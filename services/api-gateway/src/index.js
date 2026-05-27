const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const morgan = require('morgan');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('combined'));

// === Health del gateway (sin auth) ===
app.get('/health', (req, res) => res.json({ status: 'UP', service: 'api-gateway' }));

app.get('/services/status', async (req, res) => {
  const services = {
    auth: process.env.AUTH_SERVICE_URL,
    patient: process.env.PATIENT_SERVICE_URL,
    doctor: process.env.DOCTOR_SERVICE_URL,
    appointment: process.env.APPOINTMENT_SERVICE_URL,
    medical_history: process.env.MEDICAL_HISTORY_SERVICE_URL,
    video: process.env.VIDEO_SERVICE_URL,
    prescription: process.env.PRESCRIPTION_SERVICE_URL,
    pharmacy: process.env.PHARMACY_SERVICE_URL,
    laboratory: process.env.LABORATORY_SERVICE_URL,
    iot: process.env.IOT_SERVICE_URL,
    alert: process.env.ALERT_SERVICE_URL,
    rating: process.env.RATING_SERVICE_URL,
  };
  const status = {};
  await Promise.all(Object.entries(services).map(async ([name, url]) => {
    try {
      const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
      status[name] = r.ok ? 'UP' : 'DOWN';
    } catch { status[name] = 'DOWN'; }
  }));
  res.json(status);
});

// === Middleware JWT ===
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Authorization header requerido' });
  const token = authHeader.replace('Bearer ', '');
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    // Pasar identidad al downstream
    req.headers['x-user-id'] = decoded.sub;
    req.headers['x-user-role'] = decoded.role;
    req.headers['x-user-ref'] = decoded.ref || '';
    next();
  } catch { return res.status(401).json({ error: 'Token inválido o expirado' }); }
}

function roleMiddleware(...allowed) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    if (!allowed.includes(req.user.role))
      return res.status(403).json({ error: `Rol ${req.user.role} no autorizado` });
    next();
  };
}

// === Auth gate function ===
function gateAuth(req, res, next) {
  // Skip auth para rutas públicas
  if (req.path.startsWith('/api/auth')) return next();
  return authMiddleware(req, res, next);
}
app.use(gateAuth);

// === Proxies con pathFilter (sin mount path -> req.url se preserva intacto) ===
const proxies = [
  ['/api/auth',           process.env.AUTH_SERVICE_URL,            '/auth'],
  ['/api/patients',       process.env.PATIENT_SERVICE_URL,         '/patients'],
  ['/api/doctors',        process.env.DOCTOR_SERVICE_URL,          '/doctors'],
  ['/api/appointments',   process.env.APPOINTMENT_SERVICE_URL,     '/appointments'],
  ['/api/history',        process.env.MEDICAL_HISTORY_SERVICE_URL, '/history'],
  ['/api/sessions',       process.env.VIDEO_SERVICE_URL,           '/sessions'],
  // MVP 2
  ['/api/prescriptions',  process.env.PRESCRIPTION_SERVICE_URL,    '/prescriptions'],
  ['/api/pharmacies',     process.env.PHARMACY_SERVICE_URL,        '/pharmacies'],
  ['/api/deliveries',     process.env.PHARMACY_SERVICE_URL,        '/deliveries'],
  ['/api/lab-orders',     process.env.LABORATORY_SERVICE_URL,      '/orders'],
  ['/api/lab-results',    process.env.LABORATORY_SERVICE_URL,      '/results'],
  // MVP 3
  ['/api/iot/patients',   process.env.IOT_SERVICE_URL,             '/patients'],
  ['/api/iot/metrics',    process.env.IOT_SERVICE_URL,             '/metrics'],
  ['/api/rules',          process.env.ALERT_SERVICE_URL,           '/rules'],
  ['/api/alerts',         process.env.ALERT_SERVICE_URL,           '/alerts'],
  ['/api/ratings',        process.env.RATING_SERVICE_URL,          '/ratings'],
];
for (const [prefix, target, targetPrefix] of proxies) {
  const re = new RegExp(`^${prefix.replace(/\//g, '\\/')}`);
  app.use(createProxyMiddleware({
    pathFilter: (path) => re.test(path),
    target,
    changeOrigin: true,
    pathRewrite: (path) => path.replace(re, targetPrefix),
  }));
}

app.listen(PORT, () => console.log(`[api-gateway] listening on ${PORT}`));
