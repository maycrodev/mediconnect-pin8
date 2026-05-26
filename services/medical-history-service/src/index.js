const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const amqp = require('amqplib');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const PORT = process.env.PORT || 3005;

// === Conexión MongoDB ===
async function connectMongo(retries = 10) {
  for (let i = 0; i < retries; i++) {
    try {
      await mongoose.connect(process.env.MONGO_URI);
      console.log('[medical-history] MongoDB connected');
      return;
    } catch (e) {
      console.log(`[medical-history] Mongo retry ${i + 1}: ${e.message}`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

// === Schemas ===
const consultationSchema = new mongoose.Schema({
  appointmentId: { type: String, index: true },
  doctorId: { type: String, required: true },
  doctorName: String,
  specialty: String,
  date: { type: Date, default: Date.now },
  motivo: String,
  examen_fisico: String,
  diagnostico: [{ codigo_cie10: String, descripcion: String }],
  tratamiento: String,
  observaciones: String,
}, { _id: true });

const examSchema = new mongoose.Schema({
  type: String, // 'laboratorio', 'imagen', 'otro'
  nombre: String,
  fecha: Date,
  resultado: String,
  archivo_url: String,
  laboratorio: String,
}, { _id: true });

const medicationSchema = new mongoose.Schema({
  nombre: String,
  dosis: String,
  frecuencia: String,
  duracion: String,
  recetado_por: String,
  fecha: Date,
}, { _id: true });

const medicalHistorySchema = new mongoose.Schema({
  patientId: { type: String, required: true, unique: true, index: true },
  patientDNI: String,
  patientName: String,
  blood_type: String,
  allergies: [String],
  chronic_conditions: [String],
  family_history: [String],
  consultations: [consultationSchema],
  exams: [examSchema],
  medications: [medicationSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

medicalHistorySchema.index({ patientDNI: 1 });

const MedicalHistory = mongoose.model('MedicalHistory', medicalHistorySchema);

// === Rabbit (suscripción a eventos) ===
let rabbitChannel = null;
async function connectRabbit(retries = 10) {
  for (let i = 0; i < retries; i++) {
    try {
      const conn = await amqp.connect(process.env.RABBITMQ_URL);
      rabbitChannel = await conn.createChannel();
      await rabbitChannel.assertExchange('mediconnect.events', 'topic', { durable: true });
      const q = await rabbitChannel.assertQueue('medical-history.events', { durable: true });
      // Escucha a creación de pacientes para inicializar HCE vacío
      await rabbitChannel.bindQueue(q.queue, 'mediconnect.events', 'patient.created');
      // Escucha completación de citas para registrar consulta automáticamente
      await rabbitChannel.bindQueue(q.queue, 'mediconnect.events', 'appointment.completed');
      rabbitChannel.consume(q.queue, async msg => {
        try {
          const data = JSON.parse(msg.content.toString());
          const rk = msg.fields.routingKey;
          if (rk === 'patient.created' && data.patient) {
            const p = data.patient;
            await MedicalHistory.findOneAndUpdate(
              { patientId: p.id },
              {
                $setOnInsert: {
                  patientId: p.id, patientDNI: p.dni,
                  patientName: `${p.first_name} ${p.last_name}`,
                  blood_type: p.blood_type,
                  allergies: p.allergies ? [p.allergies] : [],
                  chronic_conditions: p.chronic_conditions ? [p.chronic_conditions] : [],
                  consultations: [], exams: [], medications: [],
                }
              },
              { upsert: true, new: true }
            );
            console.log(`[medical-history] HCE inicializado para paciente ${p.id}`);
          } else if (rk === 'appointment.completed' && data.patient_id) {
            // Idempotente: no duplica si ya hay consulta con ese appointmentId
            const exists = await MedicalHistory.findOne({
              patientId: data.patient_id,
              'consultations.appointmentId': data.id
            });
            if (!exists) {
              await MedicalHistory.findOneAndUpdate(
                { patientId: data.patient_id },
                {
                  $push: { consultations: {
                    appointmentId: data.id,
                    doctorId: data.doctor_id,
                    specialty: data.specialty,
                    date: data.updated_at || new Date(),
                    motivo: data.reason || 'Videoconsulta',
                    observaciones: data.notes || '',
                  } },
                  $set: { updatedAt: new Date() },
                },
                { upsert: true, new: true }
              );
              console.log(`[medical-history] consulta registrada vía evento para paciente ${data.patient_id}`);
            }
          }
          rabbitChannel.ack(msg);
        } catch (e) {
          console.error('consume error:', e.message);
          rabbitChannel.nack(msg, false, false);
        }
      });
      console.log('[medical-history] RabbitMQ subscribed');
      return;
    } catch { await new Promise(r => setTimeout(r, 3000)); }
  }
}

app.get('/health', (req, res) => res.json({ status: 'UP', service: 'medical-history-service' }));

// === Obtener HCE completo del paciente (req. III) ===
app.get('/history/:patientId', async (req, res) => {
  try {
    let h = await MedicalHistory.findOne({ patientId: req.params.patientId });
    if (!h) {
      // Si aún no se inicializó vía evento, crearlo vacío
      h = await MedicalHistory.create({ patientId: req.params.patientId, consultations: [], exams: [], medications: [] });
    }
    res.json(h);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// === Resumen rápido (para dashboard <150ms req. no-funcional) ===
app.get('/history/:patientId/summary', async (req, res) => {
  try {
    const h = await MedicalHistory.findOne({ patientId: req.params.patientId }).lean();
    if (!h) return res.status(404).json({ error: 'HCE no encontrado' });
    res.json({
      patientId: h.patientId, patientName: h.patientName,
      blood_type: h.blood_type, allergies: h.allergies,
      chronic_conditions: h.chronic_conditions,
      total_consultations: (h.consultations || []).length,
      total_exams: (h.exams || []).length,
      total_medications: (h.medications || []).length,
      last_consultation: (h.consultations || []).slice(-1)[0] || null,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// === Agregar consulta (durante o al finalizar la videoconsulta) ===
app.post('/history/:patientId/consultations', async (req, res) => {
  try {
    const consultation = req.body;
    const h = await MedicalHistory.findOneAndUpdate(
      { patientId: req.params.patientId },
      { $push: { consultations: consultation }, $set: { updatedAt: new Date() } },
      { new: true, upsert: true }
    );
    res.status(201).json(h);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/history/:patientId/exams', async (req, res) => {
  try {
    const h = await MedicalHistory.findOneAndUpdate(
      { patientId: req.params.patientId },
      { $push: { exams: req.body }, $set: { updatedAt: new Date() } },
      { new: true, upsert: true }
    );
    res.status(201).json(h);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/history/:patientId/medications', async (req, res) => {
  try {
    const h = await MedicalHistory.findOneAndUpdate(
      { patientId: req.params.patientId },
      { $push: { medications: req.body }, $set: { updatedAt: new Date() } },
      { new: true, upsert: true }
    );
    res.status(201).json(h);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, async () => {
  console.log(`[medical-history-service] listening on ${PORT}`);
  await connectMongo();
  await connectRabbit();
});
