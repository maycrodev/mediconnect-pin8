const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { MongoClient } = require('mongodb');
const amqp = require('amqplib');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '512kb' }));

const PORT = process.env.PORT || 3010;
const VALID_DEVICE_KEYS = (process.env.IOT_DEVICE_KEYS || '').split(',').map(s => s.trim()).filter(Boolean);
const DEVICE_TYPES = {
  'dev-glucometer-2026': 'glucometer',
  'dev-bp-monitor-2026': 'bp_monitor',
  'dev-oximeter-2026':   'oximeter',
};

let mongoClient, db, metricsCol;
async function connectMongo(retries = 12) {
  for (let i = 0; i < retries; i++) {
    try {
      mongoClient = new MongoClient(process.env.MONGO_URI);
      await mongoClient.connect();
      db = mongoClient.db();
      // Crea time-series collection si no existe (idempotente)
      const cols = await db.listCollections({ name: 'metrics' }).toArray();
      if (cols.length === 0) {
        await db.createCollection('metrics', {
          timeseries: {
            timeField: 'ts',
            metaField: 'meta',           // {patientId, deviceType, deviceId}
            granularity: 'seconds',
          },
          expireAfterSeconds: 60 * 60 * 24 * 365, // retención: 1 año
        });
        console.log('[iot] time-series collection "metrics" creada');
      }
      metricsCol = db.collection('metrics');
      // Índices (sobre el metaField se permiten)
      await metricsCol.createIndex({ 'meta.patientId': 1, ts: -1 });
      await metricsCol.createIndex({ 'meta.deviceType': 1, ts: -1 });
      console.log('[iot] MongoDB time-series connected');
      return;
    } catch (e) {
      console.log(`[iot] mongo retry ${i + 1}: ${e.message}`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

let rabbitChannel = null;
async function connectRabbit(retries = 10) {
  for (let i = 0; i < retries; i++) {
    try {
      const conn = await amqp.connect(process.env.RABBITMQ_URL);
      rabbitChannel = await conn.createChannel();
      await rabbitChannel.assertExchange('mediconnect.events', 'topic', { durable: true });
      console.log('[iot] RabbitMQ connected');
      return;
    } catch { await new Promise(r => setTimeout(r, 3000)); }
  }
}
function publishEvent(rk, p) {
  if (!rabbitChannel) return;
  rabbitChannel.publish('mediconnect.events', rk,
    Buffer.from(JSON.stringify({ ...p, timestamp: new Date().toISOString() })), { persistent: true });
}

// === Auth de dispositivos (header x-device-key) ===
function deviceAuth(req, res, next) {
  const key = req.headers['x-device-key'];
  if (!key || !VALID_DEVICE_KEYS.includes(key))
    return res.status(401).json({ error: 'Device key inválida' });
  req.device = { key, type: DEVICE_TYPES[key] || 'unknown' };
  next();
}

app.get('/health', (req, res) => res.json({ status: 'UP', service: 'iot-service' }));

// === INGESTA DE MÉTRICAS (dispositivo IoT) ===
// POST /metrics  header: x-device-key
// body: { patientId, deviceId, ts?, values: { glucose?, systolic?, diastolic?, spo2?, heartRate? } }
app.post('/metrics', deviceAuth, async (req, res) => {
  try {
    const { patientId, deviceId, ts, values } = req.body;
    if (!patientId || !values || typeof values !== 'object')
      return res.status(400).json({ error: 'patientId y values{} requeridos' });

    const doc = {
      ts: ts ? new Date(ts) : new Date(),
      meta: {
        patientId,
        deviceType: req.device.type,
        deviceId: deviceId || 'unknown',
      },
      values,
    };
    await metricsCol.insertOne(doc);

    // Publica evento para el alert-service
    publishEvent('iot.metric.received', {
      patientId,
      deviceType: req.device.type,
      deviceId: deviceId || 'unknown',
      ts: doc.ts,
      values,
    });

    res.status(202).json({ accepted: true, deviceType: req.device.type });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// === BATCH ingest (modo offline-first para zonas rurales) ===
app.post('/metrics/batch', deviceAuth, async (req, res) => {
  try {
    const { patientId, deviceId, samples } = req.body;
    if (!patientId || !Array.isArray(samples)) return res.status(400).json({ error: 'patientId y samples[] requeridos' });
    const docs = samples.map(s => ({
      ts: s.ts ? new Date(s.ts) : new Date(),
      meta: { patientId, deviceType: req.device.type, deviceId: deviceId || 'unknown' },
      values: s.values,
    }));
    if (docs.length) await metricsCol.insertMany(docs);
    // Publica eventos (uno por sample) — el broker absorbe
    for (const d of docs) {
      publishEvent('iot.metric.received', {
        patientId, deviceType: req.device.type, deviceId: deviceId || 'unknown',
        ts: d.ts, values: d.values,
      });
    }
    res.status(202).json({ accepted: docs.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// === CONSULTAS ===
// Últimas N métricas de un paciente
app.get('/patients/:patientId/metrics', async (req, res) => {
  try {
    const { deviceType, limit = 50 } = req.query;
    const q = { 'meta.patientId': req.params.patientId };
    if (deviceType) q['meta.deviceType'] = deviceType;
    const docs = await metricsCol.find(q).sort({ ts: -1 }).limit(parseInt(limit)).toArray();
    res.json(docs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Resumen: última métrica + estadísticas últimas 24h
app.get('/patients/:patientId/summary', async (req, res) => {
  try {
    const types = ['glucometer', 'bp_monitor', 'oximeter'];
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const out = {};
    for (const t of types) {
      const latest = await metricsCol.findOne({ 'meta.patientId': req.params.patientId, 'meta.deviceType': t }, { sort: { ts: -1 } });
      const count24h = await metricsCol.countDocuments({ 'meta.patientId': req.params.patientId, 'meta.deviceType': t, ts: { $gte: since } });
      out[t] = latest ? { latest, count_24h: count24h } : null;
    }
    res.json({ patientId: req.params.patientId, devices: out });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Serie temporal para gráfico (últimas N horas)
app.get('/patients/:patientId/series', async (req, res) => {
  try {
    const { deviceType, hours = 24 } = req.query;
    if (!deviceType) return res.status(400).json({ error: 'deviceType requerido' });
    const since = new Date(Date.now() - parseInt(hours) * 3600 * 1000);
    const docs = await metricsCol.find(
      { 'meta.patientId': req.params.patientId, 'meta.deviceType': deviceType, ts: { $gte: since } }
    ).sort({ ts: 1 }).toArray();
    res.json(docs.map(d => ({ ts: d.ts, values: d.values })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, async () => {
  console.log(`[iot-service] listening on ${PORT}`);
  console.log(`[iot] ${VALID_DEVICE_KEYS.length} device keys habilitadas`);
  await connectMongo();
  await connectRabbit();
});
