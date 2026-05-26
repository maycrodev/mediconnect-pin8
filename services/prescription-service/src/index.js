const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Pool } = require('pg');
const amqp = require('amqplib');
const axios = require('axios');
const { initKeyPair, getPublicKey, signPayload, verifySignature } = require('./signer');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const PORT = process.env.PORT || 3007;
const EXPIRY_DAYS = parseInt(process.env.PRESCRIPTION_EXPIRY_DAYS || '30', 10);

const pool = new Pool({
  host: process.env.DB_HOST, port: process.env.DB_PORT,
  user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME,
});

let rabbitChannel = null;
async function connectRabbit(retries = 10) {
  for (let i = 0; i < retries; i++) {
    try {
      const conn = await amqp.connect(process.env.RABBITMQ_URL);
      rabbitChannel = await conn.createChannel();
      await rabbitChannel.assertExchange('mediconnect.events', 'topic', { durable: true });
      console.log('[prescription] RabbitMQ connected');
      return;
    } catch { await new Promise(r => setTimeout(r, 3000)); }
  }
}

// === Outbox dispatcher ===
async function processOutbox() {
  if (!rabbitChannel) return;
  try {
    const pending = await pool.query('SELECT * FROM event_outbox WHERE published=FALSE ORDER BY created_at LIMIT 50');
    for (const ev of pending.rows) {
      rabbitChannel.publish(
        'mediconnect.events', ev.event_type,
        Buffer.from(JSON.stringify({ ...ev.payload, eventId: ev.id, timestamp: ev.created_at })),
        { persistent: true }
      );
      await pool.query('UPDATE event_outbox SET published=TRUE WHERE id=$1', [ev.id]);
    }
  } catch (err) { console.error('[prescription] outbox error', err.message); }
}
setInterval(processOutbox, 2000);

// === Suscripción: prescription.dispensed desde pharmacy-service ===
async function subscribeEvents() {
  if (!rabbitChannel) return;
  const q = await rabbitChannel.assertQueue('prescription.events', { durable: true });
  await rabbitChannel.bindQueue(q.queue, 'mediconnect.events', 'prescription.dispensed');
  rabbitChannel.consume(q.queue, async msg => {
    try {
      const data = JSON.parse(msg.content.toString());
      await pool.query(
        `UPDATE prescriptions SET status='DISPENSADA', dispensed_at=NOW()
         WHERE id=$1 AND status IN ('EMITIDA','ENVIADA')`,
        [data.prescriptionId]
      );
      console.log(`[prescription] receta ${data.prescriptionId} marcada DISPENSADA`);
      rabbitChannel.ack(msg);
    } catch (e) { rabbitChannel.nack(msg, false, false); }
  });
}

// === Generar folio único legible ===
function generateFolio() {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `RX-${ts}-${rnd}`;
}

app.get('/health', (req, res) => res.json({ status: 'UP', service: 'prescription-service' }));

// === Publica clave pública para verificación externa (farmacias, auditores) ===
app.get('/prescriptions/public-key', (req, res) => res.json(getPublicKey()));

// === EMITIR receta (HU-08) ===
app.post('/prescriptions', async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      patient_id, doctor_id, appointment_id, pharmacy_id,
      diagnostico, notes, items
    } = req.body;

    if (!patient_id || !doctor_id || !Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: 'patient_id, doctor_id e items[] son requeridos' });

    // Resolver datos de paciente y médico (para snapshot en la receta firmada)
    const [pResp, dResp] = await Promise.all([
      axios.get(`${process.env.PATIENT_SERVICE_URL}/patients/${patient_id}`).catch(() => null),
      axios.get(`${process.env.DOCTOR_SERVICE_URL}/doctors/${doctor_id}`).catch(() => null),
    ]);
    if (!pResp) return res.status(422).json({ error: 'Paciente inválido' });
    if (!dResp) return res.status(422).json({ error: 'Médico inválido' });

    const folio = generateFolio();
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + EXPIRY_DAYS * 24 * 3600 * 1000);

    // Snapshot canónico para firmar
    const payloadToSign = {
      folio,
      patient: { id: patient_id, dni: pResp.data.dni, name: `${pResp.data.first_name} ${pResp.data.last_name}` },
      doctor:  { id: doctor_id,  license: dResp.data.license_number, name: `${dResp.data.first_name} ${dResp.data.last_name}` },
      pharmacy_id: pharmacy_id || null,
      diagnostico: diagnostico || '',
      items: items.map(it => ({
        medication_name: it.medication_name,
        dosis: it.dosis,
        frecuencia: it.frecuencia,
        duracion: it.duracion,
        via: it.via || 'oral',
        quantity: it.quantity || 1,
      })),
      issued_at: issuedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    };
    const sig = signPayload(payloadToSign);

    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO prescriptions
       (folio, appointment_id, patient_id, patient_dni, patient_name,
        doctor_id, doctor_name, doctor_license, pharmacy_id, diagnostico, notes,
        signature, signature_algorithm, payload_hash, public_key_id,
        status, issued_at, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
               CASE WHEN $9::uuid IS NULL THEN 'EMITIDA' ELSE 'ENVIADA' END,
               $16,$17)
       RETURNING *`,
      [folio, appointment_id || null, patient_id, pResp.data.dni,
       `${pResp.data.first_name} ${pResp.data.last_name}`,
       doctor_id, `${dResp.data.first_name} ${dResp.data.last_name}`, dResp.data.license_number,
       pharmacy_id || null, diagnostico || null, notes || null,
       sig.signature, sig.algorithm, sig.payload_hash, sig.public_key_id,
       issuedAt, expiresAt]
    );
    const prescription = ins.rows[0];

    for (const it of items) {
      await client.query(
        `INSERT INTO prescription_items
         (prescription_id, medication_name, medication_code, presentation,
          dosis, frecuencia, duracion, via, quantity, instructions)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [prescription.id, it.medication_name, it.medication_code || null, it.presentation || null,
         it.dosis, it.frecuencia, it.duracion, it.via || 'oral', it.quantity || 1, it.instructions || null]
      );
    }

    // Outbox: prescription.issued (siempre) + prescription.sent (si llegó pharmacy_id)
    await client.query(
      `INSERT INTO event_outbox (aggregate_id, event_type, payload) VALUES ($1,$2,$3)`,
      [prescription.id, 'prescription.issued',
       JSON.stringify({ prescriptionId: prescription.id, folio, patient_id, doctor_id, items: payloadToSign.items, diagnostico, issued_at: issuedAt })]
    );
    if (pharmacy_id) {
      await client.query(
        `INSERT INTO event_outbox (aggregate_id, event_type, payload) VALUES ($1,$2,$3)`,
        [prescription.id, 'prescription.sent',
         JSON.stringify({
           prescriptionId: prescription.id, folio,
           pharmacy_id, patient_id, patient_name: payloadToSign.patient.name,
           items: payloadToSign.items, signature: sig.signature, payload_hash: sig.payload_hash,
         })]
      );
    }
    await client.query('COMMIT');

    res.status(201).json({ ...prescription, items: payloadToSign.items, _signed_payload: payloadToSign });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// === LISTAR ===
app.get('/prescriptions', async (req, res) => {
  try {
    const { patient_id, doctor_id, status, folio } = req.query;
    let q = 'SELECT * FROM prescriptions WHERE 1=1';
    const params = [];
    if (patient_id) { params.push(patient_id); q += ` AND patient_id=$${params.length}`; }
    if (doctor_id)  { params.push(doctor_id);  q += ` AND doctor_id=$${params.length}`; }
    if (status)     { params.push(status);     q += ` AND status=$${params.length}`; }
    if (folio)      { params.push(folio);      q += ` AND folio=$${params.length}`; }
    q += ' ORDER BY issued_at DESC LIMIT 100';
    const r = await pool.query(q, params);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// === DETALLE con items ===
app.get('/prescriptions/:id', async (req, res) => {
  try {
    const p = await pool.query('SELECT * FROM prescriptions WHERE id=$1', [req.params.id]);
    if (p.rows.length === 0) return res.status(404).json({ error: 'Receta no encontrada' });
    const items = await pool.query('SELECT * FROM prescription_items WHERE prescription_id=$1', [req.params.id]);
    res.json({ ...p.rows[0], items: items.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// === VERIFICAR firma de una receta ===
app.get('/prescriptions/:id/verify', async (req, res) => {
  try {
    const p = await pool.query('SELECT * FROM prescriptions WHERE id=$1', [req.params.id]);
    if (p.rows.length === 0) return res.status(404).json({ error: 'Receta no encontrada' });
    const items = await pool.query('SELECT * FROM prescription_items WHERE prescription_id=$1', [req.params.id]);
    const pres = p.rows[0];
    const payload = {
      folio: pres.folio,
      patient: { id: pres.patient_id, dni: pres.patient_dni, name: pres.patient_name },
      doctor:  { id: pres.doctor_id, license: pres.doctor_license, name: pres.doctor_name },
      pharmacy_id: pres.pharmacy_id,
      diagnostico: pres.diagnostico || '',
      items: items.rows.map(it => ({
        medication_name: it.medication_name, dosis: it.dosis, frecuencia: it.frecuencia,
        duracion: it.duracion, via: it.via, quantity: it.quantity,
      })),
      issued_at: pres.issued_at.toISOString(),
      expires_at: pres.expires_at.toISOString(),
    };
    const valid = verifySignature(payload, pres.signature);
    res.json({
      valid,
      folio: pres.folio,
      algorithm: pres.signature_algorithm,
      public_key_id: pres.public_key_id,
      expired: new Date() > new Date(pres.expires_at),
      status: pres.status,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// === ENVIAR a farmacia (si no se eligió al emitir) ===
app.post('/prescriptions/:id/send-to-pharmacy', async (req, res) => {
  const client = await pool.connect();
  try {
    const { pharmacy_id } = req.body;
    if (!pharmacy_id) return res.status(400).json({ error: 'pharmacy_id requerido' });

    await client.query('BEGIN');
    const p = await client.query('SELECT * FROM prescriptions WHERE id=$1', [req.params.id]);
    if (p.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Receta no encontrada' }); }
    const pres = p.rows[0];
    if (pres.status === 'DISPENSADA' || pres.status === 'ANULADA' || pres.status === 'VENCIDA')
      { await client.query('ROLLBACK'); return res.status(409).json({ error: `Receta en estado ${pres.status} no puede enviarse` }); }

    const items = await client.query('SELECT * FROM prescription_items WHERE prescription_id=$1', [req.params.id]);
    await client.query(
      `UPDATE prescriptions SET pharmacy_id=$1, status='ENVIADA' WHERE id=$2`,
      [pharmacy_id, req.params.id]
    );
    await client.query(
      `INSERT INTO event_outbox (aggregate_id, event_type, payload) VALUES ($1,$2,$3)`,
      [pres.id, 'prescription.sent', JSON.stringify({
        prescriptionId: pres.id, folio: pres.folio,
        pharmacy_id, patient_id: pres.patient_id, patient_name: pres.patient_name,
        items: items.rows.map(it => ({ medication_name: it.medication_name, dosis: it.dosis, frecuencia: it.frecuencia, duracion: it.duracion, via: it.via, quantity: it.quantity })),
        signature: pres.signature, payload_hash: pres.payload_hash,
      })]
    );
    await client.query('COMMIT');
    res.json({ ok: true, prescriptionId: pres.id, pharmacy_id });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// === ANULAR ===
app.post('/prescriptions/:id/cancel', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `UPDATE prescriptions SET status='ANULADA'
       WHERE id=$1 AND status IN ('EMITIDA','ENVIADA') RETURNING *`,
      [req.params.id]
    );
    if (r.rows.length === 0) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'No se puede anular' }); }
    await client.query(
      `INSERT INTO event_outbox (aggregate_id, event_type, payload) VALUES ($1,$2,$3)`,
      [r.rows[0].id, 'prescription.cancelled', JSON.stringify({ prescriptionId: r.rows[0].id, reason: req.body.reason || null })]
    );
    await client.query('COMMIT');
    res.json(r.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

app.listen(PORT, async () => {
  console.log(`[prescription-service] listening on ${PORT}`);
  initKeyPair();
  await connectRabbit();
  await subscribeEvents();
});
