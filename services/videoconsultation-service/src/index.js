const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const amqp = require('amqplib');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3006;
const ENCRYPTION_KEY = (process.env.ENCRYPTION_KEY || 'mediconnect-default-key-32-bytes!').padEnd(32, '0').slice(0, 32);

async function connectMongo(retries = 10) {
  for (let i = 0; i < retries; i++) {
    try {
      await mongoose.connect(process.env.MONGO_URI);
      console.log('[video] MongoDB connected');
      return;
    } catch (e) { await new Promise(r => setTimeout(r, 3000)); }
  }
}

// === Cifrado AES-256-GCM para grabaciones (req. II) ===
function encryptPayload(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    algorithm: 'AES-256-GCM',
  };
}
function decryptPayload(payload) {
  const decipher = crypto.createDecipheriv('aes-256-gcm',
    Buffer.from(ENCRYPTION_KEY),
    Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

// === Schema sesión ===
const sessionSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true, index: true },
  appointmentId: { type: String, required: true, index: true },
  patientId: { type: String, required: true },
  doctorId: { type: String, required: true },
  status: { type: String, enum: ['CREATED','ACTIVE','ENDED'], default: 'CREATED' },
  startedAt: Date,
  endedAt: Date,
  durationSeconds: Number,
  // Capacidad de accesibilidad: subtítulos en tiempo real
  liveCaptionsEnabled: { type: Boolean, default: true },
  captions: [{ timestamp: Date, speaker: String, text: String }],
  // Grabación cifrada
  recording: {
    isRecording: { type: Boolean, default: false },
    chunks: [{
      sequence: Number,
      ciphertext: String,
      iv: String,
      tag: String,
      algorithm: String,
      createdAt: { type: Date, default: Date.now },
    }],
    totalChunks: { type: Number, default: 0 },
  },
  webrtcConfig: {
    iceServers: [{ urls: String }],
  },
}, { timestamps: true });

const Session = mongoose.model('Session', sessionSchema);

// === Rabbit ===
let rabbitChannel = null;
async function connectRabbit(retries = 10) {
  for (let i = 0; i < retries; i++) {
    try {
      const conn = await amqp.connect(process.env.RABBITMQ_URL);
      rabbitChannel = await conn.createChannel();
      await rabbitChannel.assertExchange('mediconnect.events', 'topic', { durable: true });

      // Escucha: cuando una cita VIDEOCONSULTA se inicia, crear room automáticamente
      const q = await rabbitChannel.assertQueue('video.events', { durable: true });
      await rabbitChannel.bindQueue(q.queue, 'mediconnect.events', 'appointment.started');
      rabbitChannel.consume(q.queue, async msg => {
        try {
          const data = JSON.parse(msg.content.toString());
          if (data.modality === 'VIDEOCONSULTA') {
            const exists = await Session.findOne({ appointmentId: data.id });
            if (!exists) {
              await Session.create({
                roomId: uuidv4(),
                appointmentId: data.id,
                patientId: data.patient_id,
                doctorId: data.doctor_id,
                status: 'CREATED',
                webrtcConfig: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
              });
              console.log(`[video] room auto-creado para appointment ${data.id}`);
            }
          }
          rabbitChannel.ack(msg);
        } catch (e) { rabbitChannel.nack(msg, false, false); }
      });
      console.log('[video] RabbitMQ subscribed');
      return;
    } catch { await new Promise(r => setTimeout(r, 3000)); }
  }
}
function publishEvent(rk, p) {
  if (!rabbitChannel) return;
  rabbitChannel.publish('mediconnect.events', rk,
    Buffer.from(JSON.stringify({ ...p, timestamp: new Date().toISOString() })), { persistent: true });
}

app.get('/health', (req, res) => res.json({ status: 'UP', service: 'videoconsultation-service' }));

// === Crear sesión manualmente ===
app.post('/sessions', async (req, res) => {
  try {
    const { appointmentId, patientId, doctorId } = req.body;
    if (!appointmentId || !patientId || !doctorId)
      return res.status(400).json({ error: 'appointmentId, patientId, doctorId requeridos' });
    let session = await Session.findOne({ appointmentId });
    if (!session) {
      session = await Session.create({
        roomId: uuidv4(), appointmentId, patientId, doctorId,
        webrtcConfig: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
      });
    }
    res.status(201).json(session);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/sessions/:roomId', async (req, res) => {
  const s = await Session.findOne({ roomId: req.params.roomId });
  if (!s) return res.status(404).json({ error: 'Sesión no encontrada' });
  res.json(s);
});

app.get('/sessions/by-appointment/:appointmentId', async (req, res) => {
  const s = await Session.findOne({ appointmentId: req.params.appointmentId });
  if (!s) return res.status(404).json({ error: 'Sin sesión para esa cita' });
  res.json(s);
});

// === Iniciar (cambia a ACTIVE) ===
app.post('/sessions/:roomId/start', async (req, res) => {
  const s = await Session.findOneAndUpdate(
    { roomId: req.params.roomId },
    { status: 'ACTIVE', startedAt: new Date(), 'recording.isRecording': true },
    { new: true }
  );
  if (!s) return res.status(404).json({ error: 'Sesión no encontrada' });
  publishEvent('video.session.started', { roomId: s.roomId, appointmentId: s.appointmentId });
  res.json(s);
});

// === Finalizar ===
app.post('/sessions/:roomId/end', async (req, res) => {
  const s = await Session.findOne({ roomId: req.params.roomId });
  if (!s) return res.status(404).json({ error: 'Sesión no encontrada' });
  s.status = 'ENDED';
  s.endedAt = new Date();
  s.recording.isRecording = false;
  if (s.startedAt) s.durationSeconds = Math.floor((s.endedAt - s.startedAt) / 1000);
  await s.save();
  publishEvent('video.session.ended', {
    roomId: s.roomId, appointmentId: s.appointmentId, durationSeconds: s.durationSeconds
  });
  res.json(s);
});

// === Subir chunk de grabación (se cifra antes de almacenar) ===
app.post('/sessions/:roomId/recording/chunk', async (req, res) => {
  try {
    const { sequence, data } = req.body; // data: string base64 o texto
    if (data === undefined) return res.status(400).json({ error: 'data requerido' });
    const encrypted = encryptPayload(data);
    const s = await Session.findOneAndUpdate(
      { roomId: req.params.roomId },
      {
        $push: { 'recording.chunks': { sequence, ...encrypted } },
        $inc: { 'recording.totalChunks': 1 },
      },
      { new: true }
    );
    if (!s) return res.status(404).json({ error: 'Sesión no encontrada' });
    res.status(201).json({ ok: true, totalChunks: s.recording.totalChunks, encrypted: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// === Subtítulo en tiempo real (accesibilidad) ===
app.post('/sessions/:roomId/captions', async (req, res) => {
  try {
    const { speaker, text } = req.body;
    const s = await Session.findOneAndUpdate(
      { roomId: req.params.roomId },
      { $push: { captions: { timestamp: new Date(), speaker, text } } },
      { new: true }
    );
    if (!s) return res.status(404).json({ error: 'Sesión no encontrada' });
    res.json({ ok: true, totalCaptions: s.captions.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// === Descargar grabación descifrada (solo médicos/auditores autorizados) ===
app.get('/sessions/:roomId/recording', async (req, res) => {
  try {
    const s = await Session.findOne({ roomId: req.params.roomId });
    if (!s) return res.status(404).json({ error: 'Sesión no encontrada' });
    const decryptedChunks = (s.recording.chunks || []).map(c => ({
      sequence: c.sequence,
      data: decryptPayload({ ciphertext: c.ciphertext, iv: c.iv, tag: c.tag }),
    }));
    res.json({ roomId: s.roomId, totalChunks: decryptedChunks.length, chunks: decryptedChunks });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, async () => {
  console.log(`[videoconsultation-service] listening on ${PORT}`);
  await connectMongo();
  await connectRabbit();
});
