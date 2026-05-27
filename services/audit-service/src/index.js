const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Pool } = require('pg');
const amqp = require('amqplib');
const { computeEntryHash, canonicalize, sha256 } = require('./hashChain');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const PORT = process.env.PORT || 3013;

const pool = new Pool({
  host: process.env.DB_HOST, port: process.env.DB_PORT,
  user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME,
});

// Mutex en proceso para evitar race condition al calcular prev_hash
let writeLock = Promise.resolve();
function withLock(fn) {
  const next = writeLock.then(fn, fn);
  writeLock = next.catch(() => {});
  return next;
}

// === Mapeo de eventos a contexto auditable ===
function extractContext(routingKey, data) {
  // event_type, resource_type, resource_id, patient_id, actor_id, actor_role
  const ctx = {
    event_type: routingKey,
    resource_type: null, resource_id: null,
    patient_id: data.patient_id || data.patientId || null,
    actor_id: data.actor_id || data.userId || data.doctor_id || data.doctorId || null,
    actor_role: data.actor_role || null,
  };
  if (routingKey.startsWith('appointment.')) {
    ctx.resource_type = 'appointment';
    ctx.resource_id = data.id || data.appointmentId || null;
  } else if (routingKey.startsWith('prescription.')) {
    ctx.resource_type = 'prescription';
    ctx.resource_id = data.prescriptionId || data.id || null;
  } else if (routingKey.startsWith('lab.result.')) {
    ctx.resource_type = 'lab_result';
    ctx.resource_id = data.resultId || null;
  } else if (routingKey.startsWith('lab.order.')) {
    ctx.resource_type = 'lab_order';
    ctx.resource_id = data.orderId || null;
  } else if (routingKey.startsWith('iot.metric')) {
    ctx.resource_type = 'iot_metric';
    ctx.resource_id = `${data.deviceType}/${data.deviceId || ''}`;
  } else if (routingKey.startsWith('iot.alert')) {
    ctx.resource_type = 'iot_alert';
    ctx.resource_id = data.alertId || null;
  } else if (routingKey.startsWith('rating.') || routingKey === 'doctor.rating.updated') {
    ctx.resource_type = 'rating';
    ctx.resource_id = data.id || data.doctor_id || null;
  } else if (routingKey.startsWith('patient.')) {
    ctx.resource_type = 'patient';
    const p = data.patient || data;
    ctx.resource_id = p.id || null;
    ctx.patient_id = ctx.patient_id || p.id || null;
  } else if (routingKey.startsWith('doctor.')) {
    ctx.resource_type = 'doctor';
    ctx.resource_id = data.doctor?.id || data.doctor_id || null;
  } else if (routingKey.startsWith('video.')) {
    ctx.resource_type = 'video_session';
    ctx.resource_id = data.roomId || null;
  } else if (routingKey.startsWith('auth.')) {
    ctx.resource_type = 'user';
    ctx.resource_id = data.userId || (data.user && data.user.id) || null;
    ctx.actor_role = data.role || (data.user && data.user.role) || null;
  } else if (routingKey === 'hce.accessed') {
    ctx.resource_type = 'medical_history';
    ctx.resource_id = data.patientId || null;
    ctx.actor_role = data.actor_role || null;
  }
  return ctx;
}

// === Insert con hash chain (bajo lock para serializar prev_hash) ===
async function appendEntry({ event_type, actor_id, actor_role, resource_type, resource_id, patient_id, payload, source_service }) {
  return withLock(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const lastH = await client.query("SELECT audit_last_hash() AS h");
      const prev_hash = lastH.rows[0].h;
      const created_at = new Date().toISOString();
      const entry_hash = computeEntryHash(prev_hash, {
        event_type, actor_id, actor_role, resource_type, resource_id, patient_id,
        payload, source_service, created_at,
      });
      const ins = await client.query(
        `INSERT INTO audit_log
         (event_type, actor_id, actor_role, resource_type, resource_id, patient_id,
          payload, prev_hash, entry_hash, source_service, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING seq, id, entry_hash`,
        [event_type, actor_id, actor_role, resource_type, resource_id, patient_id,
         payload, prev_hash, entry_hash, source_service, created_at]
      );
      await client.query('COMMIT');
      return ins.rows[0];
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally { client.release(); }
  });
}

// === RabbitMQ: suscripción universal (#) ===
let rabbitChannel = null;
async function connectRabbit(retries = 12) {
  for (let i = 0; i < retries; i++) {
    try {
      const conn = await amqp.connect(process.env.RABBITMQ_URL);
      rabbitChannel = await conn.createChannel();
      await rabbitChannel.assertExchange('mediconnect.events', 'topic', { durable: true });
      const q = await rabbitChannel.assertQueue('audit.all', { durable: true });
      // # captura TODA la jerarquía: appointment.*, prescription.*, lab.*, iot.*, rating.*, doctor.*, hce.*, video.*, auth.*, patient.*
      await rabbitChannel.bindQueue(q.queue, 'mediconnect.events', '#');
      rabbitChannel.consume(q.queue, async (msg) => {
        try {
          const data = JSON.parse(msg.content.toString());
          const rk = msg.fields.routingKey;
          const ctx = extractContext(rk, data);
          await appendEntry({
            event_type: rk,
            actor_id: ctx.actor_id,
            actor_role: ctx.actor_role,
            resource_type: ctx.resource_type,
            resource_id: ctx.resource_id ? String(ctx.resource_id) : null,
            patient_id: ctx.patient_id,
            payload: data,
            source_service: data._source || rk.split('.')[0],
          });
          rabbitChannel.ack(msg);
        } catch (e) {
          console.error('[audit] error procesando evento', e.message);
          rabbitChannel.nack(msg, false, false);
        }
      });
      console.log('[audit] RabbitMQ conectado + suscrito a TODOS los eventos (#)');
      return;
    } catch { await new Promise(r => setTimeout(r, 3000)); }
  }
}

app.get('/health', (req, res) => res.json({ status: 'UP', service: 'audit-service' }));

// === API DE INGRESO MANUAL (lo usan los services para logs explícitos sin pasar por broker) ===
app.post('/audit', async (req, res) => {
  try {
    const e = await appendEntry(req.body);
    res.status(201).json(e);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// === CONSULTA (auditores - solo lectura) ===
app.get('/audit', async (req, res) => {
  try {
    const { event_type, patient_id, actor_id, resource_type, resource_id, since, until, limit = 100, offset = 0 } = req.query;
    let q = 'SELECT seq, id, event_type, actor_id, actor_role, resource_type, resource_id, patient_id, payload, prev_hash, entry_hash, source_service, created_at FROM audit_log WHERE 1=1';
    const params = [];
    if (event_type)   { params.push(event_type);   q += ` AND event_type = $${params.length}`; }
    if (patient_id)   { params.push(patient_id);   q += ` AND patient_id = $${params.length}`; }
    if (actor_id)     { params.push(actor_id);     q += ` AND actor_id = $${params.length}`; }
    if (resource_type){ params.push(resource_type);q += ` AND resource_type = $${params.length}`; }
    if (resource_id)  { params.push(resource_id);  q += ` AND resource_id = $${params.length}`; }
    if (since)        { params.push(since);        q += ` AND created_at >= $${params.length}`; }
    if (until)        { params.push(until);        q += ` AND created_at <= $${params.length}`; }
    q += ` ORDER BY seq DESC LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;
    const r = await pool.query(q, params);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/audit/:seq', async (req, res) => {
  const r = await pool.query('SELECT * FROM audit_log WHERE seq=$1', [req.params.seq]);
  if (r.rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
  res.json(r.rows[0]);
});

// === ESTADÍSTICAS para dashboard del auditor ===
app.get('/audit/stats/summary', async (req, res) => {
  try {
    const total = await pool.query('SELECT COUNT(*)::int AS n FROM audit_log');
    const byType = await pool.query(
      `SELECT event_type, COUNT(*)::int AS n
       FROM audit_log GROUP BY event_type ORDER BY n DESC LIMIT 25`
    );
    const byResource = await pool.query(
      `SELECT resource_type, COUNT(*)::int AS n
       FROM audit_log WHERE resource_type IS NOT NULL
       GROUP BY resource_type ORDER BY n DESC`
    );
    const last = await pool.query('SELECT created_at FROM audit_log ORDER BY seq DESC LIMIT 1');
    res.json({
      total_entries: total.rows[0].n,
      last_entry_at: last.rows[0]?.created_at || null,
      by_event_type: byType.rows,
      by_resource_type: byResource.rows,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// === INTEGRIDAD: re-calcular hashes y reportar discrepancias ===
app.get('/audit/integrity/verify', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT seq, event_type, actor_id, actor_role, resource_type, resource_id, patient_id, payload, prev_hash, entry_hash, source_service, created_at FROM audit_log ORDER BY seq'
    );
    let expectedPrev = '0000000000000000000000000000000000000000000000000000000000000000';
    const breaches = [];
    let checked = 0;
    for (const row of r.rows) {
      checked++;
      const recalc = computeEntryHash(row.prev_hash, {
        event_type: row.event_type, actor_id: row.actor_id, actor_role: row.actor_role,
        resource_type: row.resource_type, resource_id: row.resource_id, patient_id: row.patient_id,
        payload: row.payload, source_service: row.source_service,
        created_at: row.created_at.toISOString(),
      });
      if (recalc !== row.entry_hash) {
        breaches.push({ seq: row.seq, reason: 'entry_hash mismatch (payload alterado)', expected: recalc, found: row.entry_hash });
      }
      if (row.prev_hash !== expectedPrev) {
        breaches.push({ seq: row.seq, reason: 'prev_hash no coincide con la cadena (entrada borrada o reordenada)', expected: expectedPrev, found: row.prev_hash });
      }
      expectedPrev = row.entry_hash;
    }
    res.json({
      integrity: breaches.length === 0 ? 'OK' : 'BROKEN',
      checked_entries: checked,
      breaches_found: breaches.length,
      breaches,
      tip_hash: expectedPrev,   // "merkle root" lógico (último hash de la cadena)
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// === Acceso al HCE (para que medical-history pueda registrar lecturas explícitas también) ===
// Esto es complementario al consumer de eventos (algunos services podrían no publicar vía broker)
app.post('/audit/hce-access', async (req, res) => {
  try {
    const { patient_id, actor_id, actor_role, summary_only } = req.body;
    const e = await appendEntry({
      event_type: 'hce.accessed',
      actor_id, actor_role,
      resource_type: 'medical_history',
      resource_id: patient_id,
      patient_id,
      payload: { summary_only: !!summary_only, ts: new Date() },
      source_service: 'medical-history-service',
    });
    res.status(201).json(e);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// === Prueba demostrativa de inmutabilidad: intentar UPDATE/DELETE devuelve error ===
app.post('/audit/_demo/try-tamper/:seq', async (req, res) => {
  try {
    await pool.query("UPDATE audit_log SET payload='{\"hacked\":true}' WHERE seq=$1", [req.params.seq]);
    res.status(500).json({ error: 'NO ESPERADO: la actualización pasó.' });
  } catch (e) {
    res.status(403).json({
      tamper_blocked: true,
      db_message: e.message,
      note: 'El trigger PostgreSQL bloqueó la mutación. La cadena queda intacta.'
    });
  }
});

app.listen(PORT, async () => {
  console.log(`[audit-service] listening on ${PORT}`);
  await connectRabbit();
});
