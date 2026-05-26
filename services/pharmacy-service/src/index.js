const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Pool } = require('pg');
const amqp = require('amqplib');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const PORT = process.env.PORT || 3008;

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
      // Suscripción: recibe recetas enviadas a farmacia
      const q = await rabbitChannel.assertQueue('pharmacy.events', { durable: true });
      await rabbitChannel.bindQueue(q.queue, 'mediconnect.events', 'prescription.sent');
      rabbitChannel.consume(q.queue, async msg => {
        try {
          const data = JSON.parse(msg.content.toString());
          // Verifica que la farmacia exista
          const pharm = await pool.query('SELECT * FROM pharmacies WHERE id=$1 AND is_active=TRUE', [data.pharmacy_id]);
          if (pharm.rows.length === 0) {
            console.log(`[pharmacy] farmacia ${data.pharmacy_id} no encontrada — receta ${data.folio} no persistida`);
            rabbitChannel.ack(msg); return;
          }
          // Idempotente por (prescription_id, pharmacy_id)
          const exists = await pool.query(
            'SELECT id FROM prescription_deliveries WHERE prescription_id=$1 AND pharmacy_id=$2',
            [data.prescriptionId, data.pharmacy_id]
          );
          if (exists.rows.length === 0) {
            await pool.query(
              `INSERT INTO prescription_deliveries
               (prescription_id, folio, pharmacy_id, patient_id, patient_name, items, status)
               VALUES ($1,$2,$3,$4,$5,$6,'RECIBIDA')`,
              [data.prescriptionId, data.folio, data.pharmacy_id, data.patient_id, data.patient_name, JSON.stringify(data.items || [])]
            );
            console.log(`[pharmacy] receta ${data.folio} recibida en farmacia ${pharm.rows[0].name}`);
          }
          rabbitChannel.ack(msg);
        } catch (e) {
          console.error('[pharmacy] consume error', e.message);
          rabbitChannel.nack(msg, false, false);
        }
      });
      console.log('[pharmacy] RabbitMQ connected + subscribed');
      return;
    } catch { await new Promise(r => setTimeout(r, 3000)); }
  }
}

function publishEvent(rk, p) {
  if (!rabbitChannel) return;
  rabbitChannel.publish('mediconnect.events', rk,
    Buffer.from(JSON.stringify({ ...p, timestamp: new Date().toISOString() })), { persistent: true });
}

app.get('/health', (req, res) => res.json({ status: 'UP', service: 'pharmacy-service' }));

// === Listar farmacias (filtros) ===
app.get('/pharmacies', async (req, res) => {
  try {
    const { region, chain, is_24h, search } = req.query;
    let q = 'SELECT * FROM pharmacies WHERE is_active=TRUE';
    const params = [];
    if (region) { params.push(region); q += ` AND region=$${params.length}`; }
    if (chain)  { params.push(chain);  q += ` AND chain=$${params.length}`; }
    if (is_24h === 'true') q += ' AND is_24h=TRUE';
    if (search) { params.push(`%${search}%`); q += ` AND (name ILIKE $${params.length} OR address ILIKE $${params.length})`; }
    q += ' ORDER BY chain, name LIMIT 200';
    const r = await pool.query(q, params);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/pharmacies/regions', async (req, res) => {
  const r = await pool.query('SELECT DISTINCT region FROM pharmacies WHERE is_active=TRUE ORDER BY region');
  res.json(r.rows.map(x => x.region));
});

app.get('/pharmacies/:id', async (req, res) => {
  const r = await pool.query('SELECT * FROM pharmacies WHERE id=$1', [req.params.id]);
  if (r.rows.length === 0) return res.status(404).json({ error: 'Farmacia no encontrada' });
  res.json(r.rows[0]);
});

// === Cola de recetas en una farmacia (vista del farmacéutico) ===
app.get('/pharmacies/:id/deliveries', async (req, res) => {
  try {
    const { status } = req.query;
    let q = 'SELECT * FROM prescription_deliveries WHERE pharmacy_id=$1';
    const params = [req.params.id];
    if (status) { params.push(status); q += ` AND status=$${params.length}`; }
    q += ' ORDER BY received_at DESC LIMIT 100';
    const r = await pool.query(q, params);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// === Por folio (auto-servicio del paciente o farmacia) ===
app.get('/deliveries/folio/:folio', async (req, res) => {
  const r = await pool.query('SELECT * FROM prescription_deliveries WHERE folio=$1', [req.params.folio]);
  if (r.rows.length === 0) return res.status(404).json({ error: 'Sin delivery para ese folio' });
  res.json(r.rows[0]);
});

// === DISPENSAR (farmacia confirma entrega al paciente) ===
app.post('/deliveries/:id/dispense', async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE prescription_deliveries SET status='DISPENSADA', dispensed_at=NOW(), notes=COALESCE($1, notes)
       WHERE id=$2 AND status IN ('RECIBIDA','EN_PREPARACION','LISTA') RETURNING *`,
      [req.body.notes || null, req.params.id]
    );
    if (r.rows.length === 0) return res.status(409).json({ error: 'No dispensable' });
    publishEvent('prescription.dispensed', {
      prescriptionId: r.rows[0].prescription_id,
      pharmacy_id: r.rows[0].pharmacy_id,
      folio: r.rows[0].folio,
      patient_id: r.rows[0].patient_id,
      dispensed_at: r.rows[0].dispensed_at,
    });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/deliveries/:id/status', async (req, res) => {
  try {
    const { status, notes } = req.body;
    if (!['EN_PREPARACION','LISTA','RECHAZADA'].includes(status))
      return res.status(400).json({ error: 'Estado inválido' });
    const r = await pool.query(
      `UPDATE prescription_deliveries SET status=$1, notes=COALESCE($2, notes)
       WHERE id=$3 RETURNING *`,
      [status, notes || null, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'No encontrada' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, async () => {
  console.log(`[pharmacy-service] listening on ${PORT}`);
  await connectRabbit();
});
