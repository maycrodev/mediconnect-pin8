const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const amqp = require('amqplib');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

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
      console.log('[auth] RabbitMQ connected');
      return;
    } catch (err) {
      console.log(`[auth] RabbitMQ retry ${i + 1}/${retries}...`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  console.error('[auth] RabbitMQ connection failed');
}

function publishEvent(routingKey, payload) {
  if (!rabbitChannel) return;
  rabbitChannel.publish(
    'mediconnect.events',
    routingKey,
    Buffer.from(JSON.stringify({ ...payload, timestamp: new Date().toISOString() })),
    { persistent: true }
  );
}

// === Initial seed: ensure 3 demo users with password "password123" ===
// Retry porque postgres puede no estar listo cuando arranca este servicio
async function ensureSeedHashes(retries = 15) {
  const correctHash = await bcrypt.hash('password123', 10);
  for (let i = 0; i < retries; i++) {
    try {
      const r = await pool.query(
        `UPDATE users SET password_hash = $1
         WHERE email IN ('paciente1@mc.com','medico1@mc.com','auditor@mc.com')`,
        [correctHash]
      );
      console.log(`[auth] seed password hashes ensured (${r.rowCount} usuarios actualizados, password = password123)`);
      return;
    } catch (e) {
      console.log(`[auth] seed retry ${i + 1}/${retries}: ${e.message}`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  console.error('[auth] NO se pudieron sembrar las passwords tras todos los reintentos — el login con usuarios demo va a fallar.');
}

// === ENDPOINTS ===

app.get('/health', (req, res) => res.json({ status: 'UP', service: 'auth-service' }));

app.post('/auth/register', async (req, res) => {
  try {
    const { email, password, role, external_ref_id } = req.body;
    if (!email || !password || !role)
      return res.status(400).json({ error: 'email, password, role requeridos' });

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, role, external_ref_id)
       VALUES ($1,$2,$3,$4)
       RETURNING id, email, role, external_ref_id, created_at`,
      [email, hash, role, external_ref_id || null]
    );
    publishEvent('auth.user.registered', { user: result.rows[0] });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'email ya registrado' });
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email = $1 AND is_active = TRUE', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Credenciales inválidas' });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenciales inválidas' });

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role, ref: user.external_ref_id },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    publishEvent('auth.user.login', { userId: user.id, role: user.role });

    res.json({
      token,
      user: { id: user.id, email: user.email, role: user.role, external_ref_id: user.external_ref_id }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/auth/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Token requerido' });
  const token = authHeader.replace('Bearer ', '');
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ valid: true, user: decoded });
  } catch (err) {
    res.status(401).json({ valid: false, error: 'Token inválido' });
  }
});

app.listen(PORT, async () => {
  console.log(`[auth-service] listening on ${PORT}`);
  await ensureSeedHashes();
  await connectRabbit();
});
