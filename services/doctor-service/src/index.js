const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Pool } = require('pg');
const amqp = require('amqplib');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3003;

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
      console.log('[doctor] RabbitMQ connected');
      return;
    } catch { await new Promise(r => setTimeout(r, 3000)); }
  }
}
function publishEvent(rk, p) {
  if (!rabbitChannel) return;
  rabbitChannel.publish('mediconnect.events', rk,
    Buffer.from(JSON.stringify({ ...p, timestamp: new Date().toISOString() })), { persistent: true });
}

app.get('/health', (req, res) => res.json({ status: 'UP', service: 'doctor-service' }));

// === Listar (con filtros) ===
app.get('/doctors', async (req, res) => {
  try {
    const { specialty, general } = req.query;
    let query = 'SELECT * FROM doctors WHERE is_active = TRUE';
    const params = [];
    if (specialty) { params.push(`%${specialty}%`); query += ` AND specialty ILIKE $${params.length}`; }
    if (general === 'true') query += ' AND is_general = TRUE';
    query += ' ORDER BY rating DESC, last_name';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/doctors/specialties', async (req, res) => {
  try {
    const result = await pool.query('SELECT DISTINCT specialty FROM doctors WHERE is_active = TRUE ORDER BY specialty');
    res.json(result.rows.map(r => r.specialty));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/doctors/:id', async (req, res) => {
  try {
    const doc = await pool.query('SELECT * FROM doctors WHERE id = $1', [req.params.id]);
    if (doc.rows.length === 0) return res.status(404).json({ error: 'Médico no encontrado' });
    const sched = await pool.query('SELECT * FROM doctor_schedule WHERE doctor_id = $1 ORDER BY day_of_week', [req.params.id]);
    res.json({ ...doc.rows[0], schedule: sched.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// === Slots disponibles para una fecha ===
app.get('/doctors/:id/slots', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'parámetro date requerido (YYYY-MM-DD)' });
    const dayOfWeek = new Date(date + 'T12:00:00Z').getUTCDay();
    const sched = await pool.query(
      'SELECT * FROM doctor_schedule WHERE doctor_id = $1 AND day_of_week = $2',
      [req.params.id, dayOfWeek]
    );
    const slots = [];
    for (const s of sched.rows) {
      const [sh, sm] = s.start_time.split(':').map(Number);
      const [eh, em] = s.end_time.split(':').map(Number);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;
      for (let t = startMin; t + s.slot_duration_minutes <= endMin; t += s.slot_duration_minutes) {
        const hh = String(Math.floor(t / 60)).padStart(2, '0');
        const mm = String(t % 60).padStart(2, '0');
        slots.push(`${hh}:${mm}`);
      }
    }
    res.json({ doctor_id: req.params.id, date, slots });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/doctors', async (req, res) => {
  try {
    const { license_number, first_name, last_name, email, phone, specialty, sub_specialty, is_general } = req.body;
    const r = await pool.query(
      `INSERT INTO doctors (license_number, first_name, last_name, email, phone, specialty, sub_specialty, is_general)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [license_number, first_name, last_name, email, phone, specialty, sub_specialty, !!is_general]
    );
    publishEvent('doctor.created', { doctor: r.rows[0] });
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'license_number o email ya registrado' });
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, async () => {
  console.log(`[doctor-service] listening on ${PORT}`);
  await connectRabbit();
});
