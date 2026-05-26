const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Pool } = require('pg');
const amqp = require('amqplib');
const { validateDNIWithCOBOL } = require('./cobolMock');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3002;

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
      console.log('[patient] RabbitMQ connected');
      return;
    } catch {
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}
function publishEvent(routingKey, payload) {
  if (!rabbitChannel) return;
  rabbitChannel.publish('mediconnect.events', routingKey,
    Buffer.from(JSON.stringify({ ...payload, timestamp: new Date().toISOString() })),
    { persistent: true });
}

app.get('/health', (req, res) => res.json({ status: 'UP', service: 'patient-service' }));

// === Validación con sistema legado COBOL ===
app.get('/patients/validate-dni/:dni', async (req, res) => {
  const result = await validateDNIWithCOBOL(req.params.dni);
  res.json(result);
});

// === Listar ===
app.get('/patients', async (req, res) => {
  try {
    const { region, search } = req.query;
    let query = 'SELECT * FROM patients WHERE 1=1';
    const params = [];
    if (region) { params.push(region); query += ` AND region = $${params.length}`; }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (first_name ILIKE $${params.length} OR last_name ILIKE $${params.length} OR dni ILIKE $${params.length})`;
    }
    query += ' ORDER BY created_at DESC LIMIT 100';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// === Por ID ===
app.get('/patients/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM patients WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Paciente no encontrado' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// === Por DNI ===
app.get('/patients/dni/:dni', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM patients WHERE dni = $1', [req.params.dni]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Paciente no encontrado' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// === Crear (valida primero contra COBOL) ===
app.post('/patients', async (req, res) => {
  try {
    const { dni, first_name, last_name, birth_date, gender, phone, email, address, region, blood_type, allergies, chronic_conditions } = req.body;
    if (!dni || !first_name || !last_name || !birth_date)
      return res.status(400).json({ error: 'dni, first_name, last_name y birth_date son requeridos' });

    // Validación obligatoria con sistema legado COBOL
    const cobolCheck = await validateDNIWithCOBOL(dni);
    if (!cobolCheck.valid)
      return res.status(422).json({ error: 'DNI rechazado por sistema de registro civil COBOL', detail: cobolCheck });

    const result = await pool.query(
      `INSERT INTO patients (dni, first_name, last_name, birth_date, gender, phone, email, address, region, blood_type, allergies, chronic_conditions, cobol_validated)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE) RETURNING *`,
      [dni, first_name, last_name, birth_date, gender, phone, email, address, region, blood_type, allergies, chronic_conditions]
    );
    publishEvent('patient.created', { patient: result.rows[0] });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'DNI ya registrado' });
    res.status(500).json({ error: err.message });
  }
});

// === Actualizar ===
app.put('/patients/:id', async (req, res) => {
  try {
    const { phone, email, address, region, blood_type, allergies, chronic_conditions } = req.body;
    const result = await pool.query(
      `UPDATE patients SET phone=$1, email=$2, address=$3, region=$4, blood_type=$5, allergies=$6, chronic_conditions=$7, updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [phone, email, address, region, blood_type, allergies, chronic_conditions, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Paciente no encontrado' });
    publishEvent('patient.updated', { patient: result.rows[0] });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, async () => {
  console.log(`[patient-service] listening on ${PORT}`);
  await connectRabbit();
});
