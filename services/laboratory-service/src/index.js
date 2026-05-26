const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const amqp = require('amqplib');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const PORT = process.env.PORT || 3009;
const VALID_API_KEYS = (process.env.LAB_API_KEYS || '').split(',').map(s => s.trim()).filter(Boolean);
// Mapeo API key → nombre de laboratorio (en prod: tabla de partners)
const LAB_NAMES = {
  'lab-key-sanmartin-2026': 'Laboratorio San Martín',
  'lab-key-anglolab-2026':  'AngloLab Perú',
  'lab-key-roe-2026':       'Laboratorio ROE',
};

async function connectMongo(retries = 10) {
  for (let i = 0; i < retries; i++) {
    try { await mongoose.connect(process.env.MONGO_URI); console.log('[laboratory] MongoDB connected'); return; }
    catch { await new Promise(r => setTimeout(r, 3000)); }
  }
}

// === Schemas ===
const labOrderSchema = new mongoose.Schema({
  patientId: { type: String, required: true, index: true },
  patientDNI: String,
  patientName: String,
  doctorId: String,
  doctorName: String,
  appointmentId: String,
  tests: [{ code: String, name: String, sample_type: String }],
  status: { type: String, enum: ['PENDIENTE','EN_PROCESO','COMPLETADA','CANCELADA'], default: 'PENDIENTE' },
  preferred_lab: String,
  createdAt: { type: Date, default: Date.now },
});

const labResultSchema = new mongoose.Schema({
  patientId: { type: String, required: true, index: true },
  patientDNI: String,
  orderId: String,
  lab_name: { type: String, required: true },
  external_lab_order_id: String,
  status: { type: String, enum: ['RECIBIDO','VALIDADO','RECHAZADO'], default: 'RECIBIDO' },
  received_at: { type: Date, default: Date.now },
  reported_at: Date,
  test_panel: String,
  results: [{
    code: String,                // ej: GLU, HGB
    name: String,                // ej: Glucosa
    value: mongoose.Schema.Types.Mixed,
    unit: String,
    reference_min: Number,
    reference_max: Number,
    abnormal: { type: Boolean, default: false },
    comment: String,
  }],
  raw_payload: mongoose.Schema.Types.Mixed,   // copia HL7-like para auditoría
  processing_errors: [String],
});

labResultSchema.index({ orderId: 1, external_lab_order_id: 1 }, { unique: true, partialFilterExpression: { external_lab_order_id: { $exists: true } } });

const LabOrder = mongoose.model('LabOrder', labOrderSchema);
const LabResult = mongoose.model('LabResult', labResultSchema);

// === RabbitMQ ===
let rabbitChannel = null;
async function connectRabbit(retries = 10) {
  for (let i = 0; i < retries; i++) {
    try {
      const conn = await amqp.connect(process.env.RABBITMQ_URL);
      rabbitChannel = await conn.createChannel();
      await rabbitChannel.assertExchange('mediconnect.events', 'topic', { durable: true });
      // Queue interna de procesamiento (resultado recibido → validar → publicar)
      await rabbitChannel.assertQueue('laboratory.processing', { durable: true });
      rabbitChannel.consume('laboratory.processing', processLabResult);
      console.log('[laboratory] RabbitMQ connected + worker ON');
      return;
    } catch { await new Promise(r => setTimeout(r, 3000)); }
  }
}

function publishEvent(rk, p) {
  if (!rabbitChannel) return;
  rabbitChannel.publish('mediconnect.events', rk,
    Buffer.from(JSON.stringify({ ...p, timestamp: new Date().toISOString() })), { persistent: true });
}

// === Worker: valida payload, marca anormales, publica evento crítico ===
async function processLabResult(msg) {
  try {
    const { resultId } = JSON.parse(msg.content.toString());
    const result = await LabResult.findById(resultId);
    if (!result) { rabbitChannel.ack(msg); return; }

    const errors = [];
    for (const r of result.results) {
      if (r.value === undefined || r.value === null) { errors.push(`Resultado sin valor: ${r.code}`); continue; }
      if (typeof r.value === 'number' && r.reference_min != null && r.reference_max != null) {
        r.abnormal = r.value < r.reference_min || r.value > r.reference_max;
      }
    }
    result.processing_errors = errors;
    result.status = errors.length ? 'RECHAZADO' : 'VALIDADO';
    result.reported_at = new Date();
    await result.save();

    if (result.status === 'VALIDADO') {
      publishEvent('lab.result.received', {
        resultId: String(result._id),
        patientId: result.patientId,
        patientDNI: result.patientDNI,
        orderId: result.orderId,
        lab_name: result.lab_name,
        test_panel: result.test_panel,
        results: result.results.map(r => ({
          code: r.code, name: r.name, value: r.value, unit: r.unit, abnormal: r.abnormal,
          reference: r.reference_min != null ? `${r.reference_min}-${r.reference_max}` : null,
        })),
        reported_at: result.reported_at,
      });
      console.log(`[laboratory] resultado ${result._id} VALIDADO y publicado`);
    } else {
      console.log(`[laboratory] resultado ${result._id} RECHAZADO: ${errors.join('; ')}`);
    }
    rabbitChannel.ack(msg);
  } catch (e) {
    console.error('[laboratory] processing error', e.message);
    rabbitChannel.nack(msg, false, false);
  }
}

// === Middleware API key (autenticación de partners externos) ===
function partnerAuth(req, res, next) {
  const key = req.headers['x-lab-api-key'];
  if (!key || !VALID_API_KEYS.includes(key))
    return res.status(401).json({ error: 'API key de laboratorio inválida' });
  req.partner = { apiKey: key, name: LAB_NAMES[key] || 'Lab Externo' };
  next();
}

app.get('/health', (req, res) => res.json({ status: 'UP', service: 'laboratory-service' }));

// === ÓRDENES (médico solicita exámenes) ===
app.post('/orders', async (req, res) => {
  try {
    const o = await LabOrder.create(req.body);
    publishEvent('lab.order.created', {
      orderId: String(o._id), patientId: o.patientId, tests: o.tests, preferred_lab: o.preferred_lab,
    });
    res.status(201).json(o);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/orders', async (req, res) => {
  try {
    const { patientId, status } = req.query;
    const q = {};
    if (patientId) q.patientId = patientId;
    if (status) q.status = status;
    const orders = await LabOrder.find(q).sort('-createdAt').limit(100);
    res.json(orders);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// === WEBHOOK externo: laboratorios envían resultados aquí ===
// POST /lab/results  (header: x-lab-api-key)
app.post('/lab/results', partnerAuth, async (req, res) => {
  try {
    const { patientId, patientDNI, orderId, external_lab_order_id, test_panel, results } = req.body;
    if (!patientId || !Array.isArray(results))
      return res.status(400).json({ error: 'patientId y results[] requeridos' });

    // Idempotencia: si llega misma orden externa duplicada, devolver existente
    if (external_lab_order_id) {
      const existing = await LabResult.findOne({ external_lab_order_id });
      if (existing) return res.status(200).json({ duplicate: true, resultId: existing._id });
    }

    const doc = await LabResult.create({
      patientId, patientDNI, orderId: orderId || null,
      external_lab_order_id: external_lab_order_id || uuidv4(),
      lab_name: req.partner.name,
      test_panel: test_panel || 'Panel sin nombre',
      results: results.map(r => ({
        code: r.code, name: r.name, value: r.value, unit: r.unit,
        reference_min: r.reference_min, reference_max: r.reference_max,
        comment: r.comment,
      })),
      raw_payload: req.body,
      status: 'RECIBIDO',
    });

    // Encola para procesamiento asíncrono
    if (rabbitChannel) {
      rabbitChannel.sendToQueue('laboratory.processing',
        Buffer.from(JSON.stringify({ resultId: String(doc._id) })),
        { persistent: true });
    }

    res.status(202).json({ accepted: true, resultId: doc._id, status: doc.status });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// === Consulta de resultados (médico / paciente) ===
app.get('/results', async (req, res) => {
  try {
    const { patientId, status } = req.query;
    const q = {};
    if (patientId) q.patientId = patientId;
    if (status) q.status = status;
    const rs = await LabResult.find(q).sort('-received_at').limit(100);
    res.json(rs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/results/:id', async (req, res) => {
  try {
    const r = await LabResult.findById(req.params.id);
    if (!r) return res.status(404).json({ error: 'No encontrado' });
    res.json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, async () => {
  console.log(`[laboratory-service] listening on ${PORT}`);
  console.log(`[laboratory] ${VALID_API_KEYS.length} API keys de partners habilitadas`);
  await connectMongo();
  await connectRabbit();
});
