const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const amqp = require('amqplib');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '512kb' }));

const PORT = process.env.PORT || 3011;

async function connectMongo(retries = 10) {
  for (let i = 0; i < retries; i++) {
    try { await mongoose.connect(process.env.MONGO_URI); console.log('[alert] MongoDB connected'); return; }
    catch { await new Promise(r => setTimeout(r, 3000)); }
  }
}

// === Schemas ===
// Reglas configurables por paciente o globales (patientId = null)
const ruleSchema = new mongoose.Schema({
  patientId: { type: String, default: null, index: true }, // null = regla global por defecto
  deviceType: { type: String, required: true, enum: ['glucometer','bp_monitor','oximeter'], index: true },
  metric: { type: String, required: true },                // ej: glucose, systolic, diastolic, spo2
  comparator: { type: String, enum: ['>','<','>=','<=','=='], required: true },
  threshold: { type: Number, required: true },
  severity: { type: String, enum: ['INFO','WARNING','CRITICAL'], default: 'WARNING' },
  description: String,
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});
const Rule = mongoose.model('Rule', ruleSchema);

const alertSchema = new mongoose.Schema({
  patientId: { type: String, required: true, index: true },
  deviceType: String,
  metric: String,
  value: Number,
  threshold: Number,
  comparator: String,
  severity: { type: String, enum: ['INFO','WARNING','CRITICAL'] },
  description: String,
  ruleId: String,
  status: { type: String, enum: ['ABIERTA','RESUELTA','RECONOCIDA'], default: 'ABIERTA', index: true },
  triggered_at: { type: Date, default: Date.now },
  acknowledged_at: Date,
  acknowledged_by: String,
  resolved_at: Date,
  notes: String,
});
const Alert = mongoose.model('Alert', alertSchema);

// === Seed: reglas globales por defecto (HU del kata: rangos predefinidos) ===
async function seedDefaultRules() {
  if (await Rule.countDocuments() > 0) return;
  await Rule.insertMany([
    { deviceType: 'glucometer', metric: 'glucose',  comparator: '>',  threshold: 180, severity: 'CRITICAL', description: 'Hiperglucemia severa (>180 mg/dL)' },
    { deviceType: 'glucometer', metric: 'glucose',  comparator: '<',  threshold: 70,  severity: 'CRITICAL', description: 'Hipoglucemia (<70 mg/dL)' },
    { deviceType: 'bp_monitor', metric: 'systolic', comparator: '>=', threshold: 160, severity: 'CRITICAL', description: 'Crisis hipertensiva sistólica (≥160)' },
    { deviceType: 'bp_monitor', metric: 'systolic', comparator: '<',  threshold: 90,  severity: 'WARNING',  description: 'Hipotensión sistólica (<90)' },
    { deviceType: 'bp_monitor', metric: 'diastolic',comparator: '>=', threshold: 100, severity: 'CRITICAL', description: 'Crisis hipertensiva diastólica (≥100)' },
    { deviceType: 'oximeter',   metric: 'spo2',     comparator: '<',  threshold: 92,  severity: 'CRITICAL', description: 'Saturación O₂ baja (<92%)' },
    { deviceType: 'oximeter',   metric: 'spo2',     comparator: '<',  threshold: 95,  severity: 'WARNING',  description: 'Saturación O₂ levemente baja (<95%)' },
    { deviceType: 'oximeter',   metric: 'heartRate',comparator: '>',  threshold: 120, severity: 'WARNING',  description: 'Taquicardia (>120 lpm)' },
    { deviceType: 'oximeter',   metric: 'heartRate',comparator: '<',  threshold: 50,  severity: 'WARNING',  description: 'Bradicardia (<50 lpm)' },
  ]);
  console.log('[alert] reglas por defecto sembradas');
}

// === RabbitMQ ===
let rabbitChannel = null;
async function connectRabbit(retries = 10) {
  for (let i = 0; i < retries; i++) {
    try {
      const conn = await amqp.connect(process.env.RABBITMQ_URL);
      rabbitChannel = await conn.createChannel();
      await rabbitChannel.assertExchange('mediconnect.events', 'topic', { durable: true });
      const q = await rabbitChannel.assertQueue('alert.metrics', { durable: true });
      await rabbitChannel.bindQueue(q.queue, 'mediconnect.events', 'iot.metric.received');
      rabbitChannel.consume(q.queue, evaluateMetric);
      console.log('[alert] RabbitMQ connected + suscrito a iot.metric.received');
      return;
    } catch { await new Promise(r => setTimeout(r, 3000)); }
  }
}
function publishEvent(rk, p) {
  if (!rabbitChannel) return;
  rabbitChannel.publish('mediconnect.events', rk,
    Buffer.from(JSON.stringify({ ...p, timestamp: new Date().toISOString() })), { persistent: true });
}

// === CEP: evalúa cada métrica recibida contra reglas activas ===
function check(value, comparator, threshold) {
  switch (comparator) {
    case '>':  return value >  threshold;
    case '<':  return value <  threshold;
    case '>=': return value >= threshold;
    case '<=': return value <= threshold;
    case '==': return value === threshold;
  }
  return false;
}

async function evaluateMetric(msg) {
  try {
    const data = JSON.parse(msg.content.toString());
    const { patientId, deviceType, values } = data;
    // Reglas aplicables: del paciente + globales
    const rules = await Rule.find({
      deviceType, active: true,
      $or: [{ patientId }, { patientId: null }],
    });
    for (const rule of rules) {
      const v = values?.[rule.metric];
      if (typeof v !== 'number') continue;
      if (check(v, rule.comparator, rule.threshold)) {
        // Idempotencia: si hay alerta ABIERTA para este patient+rule no duplicar
        const open = await Alert.findOne({ patientId, ruleId: String(rule._id), status: 'ABIERTA' });
        if (open) continue;
        const a = await Alert.create({
          patientId, deviceType, metric: rule.metric, value: v,
          threshold: rule.threshold, comparator: rule.comparator,
          severity: rule.severity, description: rule.description,
          ruleId: String(rule._id),
        });
        publishEvent('iot.alert.triggered', {
          alertId: String(a._id), patientId, deviceType,
          metric: rule.metric, value: v, threshold: rule.threshold,
          severity: rule.severity, description: rule.description,
        });
        console.log(`[alert] DISPARADA ${rule.severity}: paciente ${patientId} ${rule.metric}=${v} (umbral ${rule.comparator} ${rule.threshold})`);
      }
    }
    rabbitChannel.ack(msg);
  } catch (e) {
    console.error('[alert] eval error', e.message);
    rabbitChannel.nack(msg, false, false);
  }
}

app.get('/health', (req, res) => res.json({ status: 'UP', service: 'alert-service' }));

// === REGLAS ===
app.get('/rules', async (req, res) => {
  const { patientId, deviceType } = req.query;
  const q = {};
  if (patientId) q.patientId = patientId === 'null' ? null : patientId;
  if (deviceType) q.deviceType = deviceType;
  const list = await Rule.find(q).sort('deviceType metric');
  res.json(list);
});

app.post('/rules', async (req, res) => {
  try { res.status(201).json(await Rule.create(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/rules/:id', async (req, res) => {
  try {
    const r = await Rule.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!r) return res.status(404).json({ error: 'No encontrada' });
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/rules/:id', async (req, res) => {
  await Rule.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// === ALERTAS ===
app.get('/alerts', async (req, res) => {
  const { patientId, status, severity, doctor_view } = req.query;
  const q = {};
  if (patientId) q.patientId = patientId;
  if (status) q.status = status;
  if (severity) q.severity = severity;
  const list = await Alert.find(q).sort('-triggered_at').limit(parseInt(req.query.limit || '100'));
  res.json(list);
});

app.get('/alerts/:id', async (req, res) => {
  const a = await Alert.findById(req.params.id);
  if (!a) return res.status(404).json({ error: 'No encontrada' });
  res.json(a);
});

app.post('/alerts/:id/acknowledge', async (req, res) => {
  const a = await Alert.findByIdAndUpdate(req.params.id,
    { status: 'RECONOCIDA', acknowledged_at: new Date(), acknowledged_by: req.body.by || 'MEDICO' },
    { new: true });
  if (!a) return res.status(404).json({ error: 'No encontrada' });
  res.json(a);
});

app.post('/alerts/:id/resolve', async (req, res) => {
  const a = await Alert.findByIdAndUpdate(req.params.id,
    { status: 'RESUELTA', resolved_at: new Date(), notes: req.body.notes || null },
    { new: true });
  if (!a) return res.status(404).json({ error: 'No encontrada' });
  publishEvent('iot.alert.resolved', { alertId: req.params.id, patientId: a.patientId });
  res.json(a);
});

app.listen(PORT, async () => {
  console.log(`[alert-service] listening on ${PORT}`);
  await connectMongo();
  await seedDefaultRules();
  await connectRabbit();
});
