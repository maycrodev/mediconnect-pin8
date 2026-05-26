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

const PORT = process.env.PORT || 3004;
const PATIENT_URL = process.env.PATIENT_SERVICE_URL;
const DOCTOR_URL = process.env.DOCTOR_SERVICE_URL;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

let rabbitChannel = null;
async function connectRabbit(retries = 10) {
  for (let i = 0; i < retries; i++) {
    try {
      const conn = await amqp.connect(process.env.RABBITMQ_URL);
      rabbitChannel = await conn.createChannel();
      await rabbitChannel.assertExchange('mediconnect.events', 'topic', { durable: true });
      console.log('[appointment] RabbitMQ connected');
      return;
    } catch { await new Promise(r => setTimeout(r, 3000)); }
  }
}

// === Patrón Outbox: persiste evento en la misma transacción y luego publica ===
async function processOutbox() {
  if (!rabbitChannel) return;
  try {
    const pending = await pool.query(
      `SELECT * FROM event_outbox WHERE published = FALSE ORDER BY created_at LIMIT 50`
    );
    for (const ev of pending.rows) {
      rabbitChannel.publish(
        'mediconnect.events',
        ev.event_type,
        Buffer.from(JSON.stringify({ ...ev.payload, eventId: ev.id, timestamp: ev.created_at })),
        { persistent: true }
      );
      await pool.query('UPDATE event_outbox SET published = TRUE WHERE id = $1', [ev.id]);
    }
  } catch (err) { console.error('outbox error:', err.message); }
}
setInterval(processOutbox, 2000);

app.get('/health', (req, res) => res.json({ status: 'UP', service: 'appointment-service' }));

// === LISTAR (filtros: patient_id, doctor_id, status, date) ===
app.get('/appointments', async (req, res) => {
  try {
    const { patient_id, doctor_id, status, date } = req.query;
    let query = 'SELECT * FROM appointments WHERE 1=1';
    const params = [];
    if (patient_id) { params.push(patient_id); query += ` AND patient_id = $${params.length}`; }
    if (doctor_id)  { params.push(doctor_id);  query += ` AND doctor_id = $${params.length}`; }
    if (status)     { params.push(status);     query += ` AND status = $${params.length}`; }
    if (date)       { params.push(date);       query += ` AND appointment_date = $${params.length}`; }
    query += ' ORDER BY appointment_date DESC, appointment_time DESC LIMIT 200';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/appointments/:id', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM appointments WHERE id = $1', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Cita no encontrada' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// === AGENDAR (HU-01) ===
app.post('/appointments', async (req, res) => {
  const client = await pool.connect();
  try {
    const { patient_id, doctor_id, appointment_date, appointment_time, modality, reason, duration_minutes } = req.body;
    if (!patient_id || !doctor_id || !appointment_date || !appointment_time || !modality)
      return res.status(400).json({ error: 'patient_id, doctor_id, appointment_date, appointment_time y modality son requeridos' });

    // Validaciones cross-service (sincrónicas en el flujo de booking)
    const [patientResp, doctorResp] = await Promise.all([
      axios.get(`${PATIENT_URL}/patients/${patient_id}`).catch(() => null),
      axios.get(`${DOCTOR_URL}/doctors/${doctor_id}`).catch(() => null),
    ]);
    if (!patientResp || patientResp.status !== 200)
      return res.status(422).json({ error: 'Paciente no existe o servicio no disponible' });
    if (!doctorResp || doctorResp.status !== 200)
      return res.status(422).json({ error: 'Médico no existe o servicio no disponible' });

    const doctorData = doctorResp.data;

    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO appointments (patient_id, doctor_id, specialty, appointment_date, appointment_time, duration_minutes, modality, reason, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'AGENDADA') RETURNING *`,
      [patient_id, doctor_id, doctorData.specialty, appointment_date, appointment_time, duration_minutes || 30, modality, reason]
    );
    const appt = ins.rows[0];

    // OUTBOX: evento crítico de salud (asíncrono)
    await client.query(
      `INSERT INTO event_outbox (aggregate_id, event_type, payload) VALUES ($1, $2, $3)`,
      [appt.id, 'appointment.created', JSON.stringify({
        appointmentId: appt.id, patientId: patient_id, doctorId: doctor_id,
        date: appointment_date, time: appointment_time, modality,
        patientName: `${patientResp.data.first_name} ${patientResp.data.last_name}`,
        doctorName: `${doctorData.first_name} ${doctorData.last_name}`,
      })]
    );
    await client.query('COMMIT');
    res.status(201).json(appt);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Slot ocupado: ese médico ya tiene cita en esa fecha/hora' });
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// === MODIFICAR (HU-02) ===
app.put('/appointments/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { appointment_date, appointment_time, modality, reason, notes, status } = req.body;
    await client.query('BEGIN');
    const r = await client.query(
      `UPDATE appointments SET
         appointment_date = COALESCE($1, appointment_date),
         appointment_time = COALESCE($2, appointment_time),
         modality = COALESCE($3, modality),
         reason = COALESCE($4, reason),
         notes = COALESCE($5, notes),
         status = COALESCE($6, status),
         updated_at = NOW()
       WHERE id = $7 AND status NOT IN ('CANCELADA','COMPLETADA') RETURNING *`,
      [appointment_date, appointment_time, modality, reason, notes, status, req.params.id]
    );
    if (r.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Cita no modificable o inexistente' }); }
    await client.query(
      `INSERT INTO event_outbox (aggregate_id, event_type, payload) VALUES ($1, $2, $3)`,
      [r.rows[0].id, 'appointment.updated', JSON.stringify(r.rows[0])]
    );
    await client.query('COMMIT');
    res.json(r.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// === CANCELAR (HU-03) ===
app.post('/appointments/:id/cancel', async (req, res) => {
  const client = await pool.connect();
  try {
    const { reason, cancelled_by } = req.body;
    await client.query('BEGIN');
    const r = await client.query(
      `UPDATE appointments SET status='CANCELADA', cancellation_reason=$1, cancelled_by=$2, updated_at=NOW()
       WHERE id=$3 AND status NOT IN ('CANCELADA','COMPLETADA') RETURNING *`,
      [reason || 'Sin especificar', cancelled_by || 'PACIENTE', req.params.id]
    );
    if (r.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Cita no cancelable' }); }
    await client.query(
      `INSERT INTO event_outbox (aggregate_id, event_type, payload) VALUES ($1, $2, $3)`,
      [r.rows[0].id, 'appointment.cancelled', JSON.stringify(r.rows[0])]
    );
    await client.query('COMMIT');
    res.json(r.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// === Iniciar consulta (cambia a EN_CURSO) ===
app.post('/appointments/:id/start', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `UPDATE appointments SET status='EN_CURSO', updated_at=NOW()
       WHERE id=$1 AND status IN ('AGENDADA','CONFIRMADA') RETURNING *`,
      [req.params.id]
    );
    if (r.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Cita no iniciable' }); }
    await client.query(
      `INSERT INTO event_outbox (aggregate_id, event_type, payload) VALUES ($1,$2,$3)`,
      [r.rows[0].id, 'appointment.started', JSON.stringify(r.rows[0])]
    );
    await client.query('COMMIT');
    res.json(r.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

app.post('/appointments/:id/complete', async (req, res) => {
  const client = await pool.connect();
  try {
    const { notes } = req.body;
    await client.query('BEGIN');
    const r = await client.query(
      `UPDATE appointments SET status='COMPLETADA', notes=COALESCE($1,notes), updated_at=NOW()
       WHERE id=$2 AND status='EN_CURSO' RETURNING *`,
      [notes, req.params.id]
    );
    if (r.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Cita no completable (debe estar EN_CURSO)' }); }
    await client.query(
      `INSERT INTO event_outbox (aggregate_id, event_type, payload) VALUES ($1,$2,$3)`,
      [r.rows[0].id, 'appointment.completed', JSON.stringify(r.rows[0])]
    );
    await client.query('COMMIT');
    res.json(r.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

app.listen(PORT, async () => {
  console.log(`[appointment-service] listening on ${PORT}`);
  await connectRabbit();
});
