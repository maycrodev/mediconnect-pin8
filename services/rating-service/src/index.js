const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Pool } = require('pg');
const amqp = require('amqplib');
const axios = require('axios');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3012;

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
      console.log('[rating] RabbitMQ connected');
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
      rabbitChannel.publish('mediconnect.events', ev.event_type,
        Buffer.from(JSON.stringify({ ...ev.payload, eventId: ev.id, timestamp: ev.created_at })), { persistent: true });
      await pool.query('UPDATE event_outbox SET published=TRUE WHERE id=$1', [ev.id]);
    }
  } catch (e) { console.error('[rating] outbox', e.message); }
}
setInterval(processOutbox, 2000);

// === Recalcula el agregado de un médico (transacción) ===
async function recalcDoctorSummary(client, doctor_id) {
  const r = await client.query(
    `SELECT COUNT(*)::int AS total,
            AVG(stars)::numeric(3,2) AS avg_stars,
            AVG(puntualidad)::numeric(3,2) AS avg_p,
            AVG(empatia)::numeric(3,2) AS avg_e,
            AVG(claridad)::numeric(3,2) AS avg_c
     FROM ratings WHERE doctor_id=$1`, [doctor_id]);
  const row = r.rows[0];
  await client.query(
    `INSERT INTO doctor_rating_summary (doctor_id, total_ratings, avg_stars, avg_puntualidad, avg_empatia, avg_claridad, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,NOW())
     ON CONFLICT (doctor_id) DO UPDATE SET
       total_ratings=EXCLUDED.total_ratings, avg_stars=EXCLUDED.avg_stars,
       avg_puntualidad=EXCLUDED.avg_puntualidad, avg_empatia=EXCLUDED.avg_empatia, avg_claridad=EXCLUDED.avg_claridad,
       updated_at=NOW()`,
    [doctor_id, row.total, row.avg_stars || 0, row.avg_p, row.avg_e, row.avg_c]
  );
  return row;
}

app.get('/health', (req, res) => res.json({ status: 'UP', service: 'rating-service' }));

// === Crear rating (HU-VIII) — gating: cita debe estar COMPLETADA y pertenecer al paciente ===
app.post('/ratings', async (req, res) => {
  const client = await pool.connect();
  try {
    const { appointment_id, stars, puntualidad, empatia, claridad, comment } = req.body;
    if (!appointment_id || !stars) return res.status(400).json({ error: 'appointment_id y stars requeridos' });
    if (stars < 1 || stars > 5) return res.status(400).json({ error: 'stars debe ser 1-5' });

    // Gating: validar la cita
    let appt;
    try {
      const r = await axios.get(`${process.env.APPOINTMENT_SERVICE_URL}/appointments/${appointment_id}`);
      appt = r.data;
    } catch { return res.status(422).json({ error: 'Cita no encontrada' }); }
    if (appt.status !== 'COMPLETADA')
      return res.status(409).json({ error: `Solo puede calificar citas COMPLETADAS (actual: ${appt.status})` });

    await client.query('BEGIN');
    let row;
    try {
      const ins = await client.query(
        `INSERT INTO ratings (appointment_id, patient_id, doctor_id, stars, puntualidad, empatia, claridad, comment)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [appointment_id, appt.patient_id, appt.doctor_id, stars, puntualidad || null, empatia || null, claridad || null, comment || null]
      );
      row = ins.rows[0];
    } catch (e) {
      if (e.code === '23505') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Esa cita ya fue calificada' });
      }
      throw e;
    }
    const summary = await recalcDoctorSummary(client, appt.doctor_id);

    // Outbox: evento doctor.rating.updated → doctor-service refresca su tabla
    await client.query(
      `INSERT INTO event_outbox (aggregate_id, event_type, payload) VALUES ($1,$2,$3)`,
      [appt.doctor_id, 'doctor.rating.updated', JSON.stringify({
        doctor_id: appt.doctor_id,
        total_ratings: summary.total,
        avg_stars: parseFloat(summary.avg_stars) || 0,
      })]
    );
    await client.query(
      `INSERT INTO event_outbox (aggregate_id, event_type, payload) VALUES ($1,$2,$3)`,
      [row.id, 'rating.created', JSON.stringify(row)]
    );

    await client.query('COMMIT');
    res.status(201).json({ rating: row, doctor_summary: { total: summary.total, avg_stars: parseFloat(summary.avg_stars) || 0 } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// === Listar ratings ===
app.get('/ratings', async (req, res) => {
  try {
    const { doctor_id, patient_id, appointment_id } = req.query;
    let q = 'SELECT * FROM ratings WHERE 1=1';
    const p = [];
    if (doctor_id)     { p.push(doctor_id);     q += ` AND doctor_id=$${p.length}`; }
    if (patient_id)    { p.push(patient_id);    q += ` AND patient_id=$${p.length}`; }
    if (appointment_id){ p.push(appointment_id);q += ` AND appointment_id=$${p.length}`; }
    q += ' ORDER BY created_at DESC LIMIT 100';
    const r = await pool.query(q, p);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// === Resumen por médico (rápido, indexado) ===
app.get('/ratings/doctor/:id/summary', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM doctor_rating_summary WHERE doctor_id=$1', [req.params.id]);
    if (r.rows.length === 0) return res.json({ doctor_id: req.params.id, total_ratings: 0, avg_stars: 0 });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// === Ranking de médicos (auditoría y visualización pública) ===
app.get('/ratings/ranking', async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM doctor_rating_summary
                                WHERE total_ratings > 0
                                ORDER BY avg_stars DESC, total_ratings DESC LIMIT 50`);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// === ¿Esta cita ya fue calificada? (para UI) ===
app.get('/ratings/by-appointment/:id', async (req, res) => {
  const r = await pool.query('SELECT * FROM ratings WHERE appointment_id=$1', [req.params.id]);
  if (r.rows.length === 0) return res.status(404).json({ rated: false });
  res.json({ rated: true, rating: r.rows[0] });
});

app.listen(PORT, async () => {
  console.log(`[rating-service] listening on ${PORT}`);
  await connectRabbit();
});
