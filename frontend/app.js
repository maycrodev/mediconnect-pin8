// ===== MediConnect Frontend =====
const API = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:3100/api'
  : `${location.protocol}//${location.hostname}:3100/api`;

let TOKEN = localStorage.getItem('mc_token');
let USER  = JSON.parse(localStorage.getItem('mc_user') || 'null');
let currentSession = null;
let captionInterval = null;
let recordInterval = null;

// ===== Helpers =====
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;
  const res = await fetch(API + path, { ...opts, headers });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { status: res.status, data });
  return data;
}

function show(id) { document.querySelectorAll('main > section').forEach(s => s.classList.add('hidden')); document.getElementById(id).classList.remove('hidden'); }
function quickLogin(email) { document.getElementById('email').value = email; document.getElementById('password').value = 'password123'; document.getElementById('loginForm').requestSubmit(); }

// ===== Tabs =====
document.addEventListener('click', e => {
  if (e.target.classList.contains('tab')) {
    const parent = e.target.parentElement.parentElement;
    parent.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    parent.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    e.target.classList.add('active');
    const panel = document.getElementById(e.target.dataset.tab);
    panel.classList.add('active');
    if (e.target.dataset.tab === 'myAppointments') loadMyAppointments();
    if (e.target.dataset.tab === 'myHistory')      loadMyHistory();
    if (e.target.dataset.tab === 'docAgenda')      loadDoctorAgenda();
  }
});

// ===== LOGIN =====
document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  document.getElementById('loginError').textContent = '';
  try {
    const r = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: document.getElementById('email').value, password: document.getElementById('password').value })
    });
    TOKEN = r.token; USER = r.user;
    localStorage.setItem('mc_token', TOKEN);
    localStorage.setItem('mc_user', JSON.stringify(USER));
    routeAfterLogin();
  } catch (err) { document.getElementById('loginError').textContent = err.message; }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  TOKEN = null; USER = null;
  localStorage.clear();
  document.getElementById('nav').classList.add('hidden');
  show('loginView');
});

function routeAfterLogin() {
  document.getElementById('nav').classList.remove('hidden');
  document.getElementById('userInfo').textContent = `${USER.email} (${USER.role})`;
  if (USER.role === 'PACIENTE') { show('patientDashboard'); loadDoctorsAndSpecialties(); }
  else if (USER.role === 'MEDICO') { show('doctorDashboard'); loadDoctorAgenda(); }
  else { show('patientDashboard'); loadDoctorsAndSpecialties(); }
}

// ===== AGENDAR =====
async function loadDoctorsAndSpecialties() {
  try {
    const specs = await api('/doctors/specialties');
    const sel = document.getElementById('specialty');
    sel.innerHTML = '<option value="">Todas</option>' + specs.map(s => `<option>${s}</option>`).join('');
    await loadDoctors();
  } catch (e) { console.error(e); }
}

document.getElementById('specialty').addEventListener('change', loadDoctors);

async function loadDoctors() {
  const spec = document.getElementById('specialty').value;
  const docs = await api('/doctors' + (spec ? `?specialty=${encodeURIComponent(spec)}` : ''));
  const sel = document.getElementById('doctor');
  sel.innerHTML = docs.map(d => `<option value="${d.id}">${d.first_name} ${d.last_name} — ${d.specialty} (★${d.rating})</option>`).join('');
  loadSlots();
}

document.getElementById('doctor').addEventListener('change', loadSlots);
document.getElementById('apptDate').addEventListener('change', loadSlots);

// Set default date = mañana
const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
document.getElementById('apptDate').value = tomorrow.toISOString().split('T')[0];

async function loadSlots() {
  const did = document.getElementById('doctor').value;
  const date = document.getElementById('apptDate').value;
  if (!did || !date) return;
  try {
    const { slots } = await api(`/doctors/${did}/slots?date=${date}`);
    const apptList = await api(`/appointments?doctor_id=${did}&date=${date}`);
    const taken = new Set(apptList.map(a => a.appointment_time.substring(0,5)));
    const sel = document.getElementById('apptTime');
    const available = slots.filter(s => !taken.has(s));
    sel.innerHTML = available.length
      ? available.map(s => `<option>${s}</option>`).join('')
      : '<option value="">— sin slots disponibles —</option>';
  } catch (e) { console.error(e); }
}

document.getElementById('newApptForm').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = document.getElementById('apptMsg');
  msg.className = 'msg'; msg.textContent = '';
  try {
    const r = await api('/appointments', {
      method: 'POST',
      body: JSON.stringify({
        patient_id: USER.external_ref_id,
        doctor_id: document.getElementById('doctor').value,
        appointment_date: document.getElementById('apptDate').value,
        appointment_time: document.getElementById('apptTime').value,
        modality: document.getElementById('modality').value,
        reason: document.getElementById('reason').value,
      })
    });
    msg.className = 'msg ok';
    msg.textContent = `✓ Cita agendada: ${r.appointment_date} a las ${r.appointment_time.substring(0,5)} (ID: ${r.id.substring(0,8)})`;
    document.getElementById('reason').value = '';
    loadSlots();
  } catch (err) {
    msg.className = 'msg err';
    msg.textContent = '✗ ' + err.message;
  }
});

// ===== MIS CITAS =====
async function loadMyAppointments() {
  try {
    const apps = await api(`/appointments?patient_id=${USER.external_ref_id}`);
    renderAppointments(apps, 'appointmentsList', true);
  } catch (e) { console.error(e); }
}

async function renderAppointments(apps, containerId, isPatient) {
  const container = document.getElementById(containerId);
  if (!apps.length) { container.innerHTML = '<p class="muted">No hay citas.</p>'; return; }
  // Enriquecer con nombres
  const docCache = {};
  for (const a of apps) {
    if (!docCache[a.doctor_id]) {
      try { docCache[a.doctor_id] = await api(`/doctors/${a.doctor_id}`); } catch {}
    }
    a._doctor = docCache[a.doctor_id];
    if (!isPatient) {
      try { a._patient = await api(`/patients/${a.patient_id}`); } catch {}
    }
  }
  container.innerHTML = apps.map(a => `
    <div class="appt-card">
      <div>
        <strong>${isPatient
          ? `Dr(a). ${a._doctor?.first_name || ''} ${a._doctor?.last_name || ''} (${a.specialty})`
          : `${a._patient?.first_name || ''} ${a._patient?.last_name || ''} — DNI ${a._patient?.dni || ''}`}</strong>
        <div class="meta">${a.appointment_date} • ${a.appointment_time.substring(0,5)} • ${a.modality}</div>
        <div class="meta">Motivo: ${a.reason || '—'}</div>
        ${a.cancellation_reason ? `<div class="meta" style="color:#dc2626">Cancelada: ${a.cancellation_reason}</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
        <span class="status ${a.status}">${a.status}</span>
        <div class="actions">
          ${a.modality === 'VIDEOCONSULTA' && ['AGENDADA','CONFIRMADA'].includes(a.status)
            ? `<button class="primary" onclick="startVideoCall('${a.id}','${a.patient_id}','${a.doctor_id}')">Iniciar Video</button>` : ''}
          ${a.status === 'EN_CURSO' && a.modality === 'VIDEOCONSULTA'
            ? `<button class="primary" onclick="rejoinVideo('${a.id}','${a.patient_id}','${a.doctor_id}')">Volver a sala</button>` : ''}
          ${['AGENDADA','CONFIRMADA'].includes(a.status)
            ? `<button class="danger" onclick="cancelAppt('${a.id}')">Cancelar</button>` : ''}
        </div>
      </div>
    </div>`).join('');
}

async function cancelAppt(id) {
  const reason = prompt('Motivo de cancelación:');
  if (reason === null) return;
  try {
    await api(`/appointments/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason, cancelled_by: USER.role })
    });
    if (USER.role === 'MEDICO') loadDoctorAgenda(); else loadMyAppointments();
  } catch (e) { alert(e.message); }
}

// ===== MI HISTORIAL (paciente) =====
async function loadMyHistory() {
  try {
    const h = await api(`/history/${USER.external_ref_id}`);
    renderHistory(h, 'historyView');
  } catch (e) { document.getElementById('historyView').innerHTML = `<p class="muted">Sin historial: ${e.message}</p>`; }
}

function renderHistory(h, containerId) {
  const container = document.getElementById(containerId);
  const consultations = h.consultations || [];
  const exams = h.exams || [];
  const medications = h.medications || [];
  container.innerHTML = `
    <div class="hce-summary">
      <div><strong>${consultations.length}</strong><small>Consultas</small></div>
      <div><strong>${exams.length}</strong><small>Exámenes</small></div>
      <div><strong>${medications.length}</strong><small>Medicamentos</small></div>
      <div><strong>${h.blood_type || '—'}</strong><small>Tipo de sangre</small></div>
    </div>
    <div class="hce-section">
      <h4>Alergias y crónicas</h4>
      <div class="hce-item">Alergias: ${(h.allergies || []).join(', ') || '—'}</div>
      <div class="hce-item">Condiciones crónicas: ${(h.chronic_conditions || []).join(', ') || '—'}</div>
    </div>
    <div class="hce-section">
      <h4>Consultas (${consultations.length})</h4>
      ${consultations.length
        ? consultations.map(c => `<div class="hce-item"><strong>${new Date(c.date).toLocaleDateString()}</strong> — ${c.specialty || ''} • ${c.doctorName || ''}<br><em>Motivo:</em> ${c.motivo || '—'} • <em>Dx:</em> ${(c.diagnostico || []).map(d=>d.descripcion).join(', ') || '—'}<br><em>Tratamiento:</em> ${c.tratamiento || '—'}</div>`).join('')
        : '<div class="hce-item muted">Sin consultas registradas</div>'}
    </div>
    <div class="hce-section">
      <h4>Exámenes (${exams.length})</h4>
      ${exams.length
        ? exams.map(e => `<div class="hce-item"><strong>${e.nombre}</strong> (${e.type}) • ${new Date(e.fecha).toLocaleDateString()} — ${e.resultado || '—'}</div>`).join('')
        : '<div class="hce-item muted">Sin exámenes</div>'}
    </div>
    <div class="hce-section">
      <h4>Medicamentos (${medications.length})</h4>
      ${medications.length
        ? medications.map(m => `<div class="hce-item"><strong>${m.nombre}</strong> ${m.dosis} cada ${m.frecuencia} • ${m.duracion}</div>`).join('')
        : '<div class="hce-item muted">Sin medicamentos</div>'}
    </div>`;
}

// ===== MÉDICO =====
async function loadDoctorAgenda() {
  try {
    const apps = await api(`/appointments?doctor_id=${USER.external_ref_id}`);
    renderAppointments(apps, 'docAppointmentsList', false);
  } catch (e) { console.error(e); }
}

async function searchPatientHistory() {
  const q = document.getElementById('patientSearch').value.trim();
  if (!q) return;
  try {
    let patient;
    if (/^\d+$/.test(q)) patient = await api(`/patients/dni/${q}`);
    else patient = await api(`/patients/${q}`);
    const h = await api(`/history/${patient.id}`);
    h.patientName = `${patient.first_name} ${patient.last_name}`;
    h.blood_type = patient.blood_type;
    document.getElementById('patientHistoryView').innerHTML = `<h4 style="margin-bottom:14px">Paciente: ${h.patientName} — DNI ${patient.dni}</h4><div id="_hceTmp"></div>`;
    document.getElementById('patientHistoryView').querySelector('#_hceTmp').id = 'patHceRender';
    renderHistory(h, 'patHceRender');
  } catch (e) { document.getElementById('patientHistoryView').innerHTML = `<p class="msg err">${e.message}</p>`; }
}

// ===== VIDEOCONSULTA =====
async function startVideoCall(appointmentId, patientId, doctorId) {
  try {
    // Inicia la cita
    try { await api(`/appointments/${appointmentId}/start`, { method: 'POST' }); } catch {}
    // Crea o recupera la sesión
    let session;
    try { session = await api(`/sessions/by-appointment/${appointmentId}`); }
    catch { session = await api('/sessions', { method: 'POST', body: JSON.stringify({ appointmentId, patientId, doctorId }) }); }
    await api(`/sessions/${session.roomId}/start`, { method: 'POST' });
    currentSession = { ...session, appointmentId, patientId, doctorId };
    openVideoRoom();
  } catch (e) { alert('Error iniciando video: ' + e.message); }
}

async function rejoinVideo(appointmentId, patientId, doctorId) {
  try {
    const session = await api(`/sessions/by-appointment/${appointmentId}`);
    currentSession = { ...session, appointmentId, patientId, doctorId };
    openVideoRoom();
  } catch (e) { alert(e.message); }
}

async function openVideoRoom() {
  show('videoView');
  document.getElementById('videoInfo').textContent = `Sala: ${currentSession.roomId.substring(0,8)} • Sesión cifrada AES-256-GCM • Subtítulos activos`;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.getElementById('localVideo').srcObject = stream;
    // Simulación de remoto: clonamos el stream propio en escala reducida
    document.getElementById('remoteVideo').srcObject = stream;
    document.getElementById('remoteLabel').textContent = USER.role === 'MEDICO' ? 'Paciente (simulado)' : 'Médico (simulado)';
  } catch (e) {
    document.getElementById('localVideo').poster = '';
    console.warn('Cámara no disponible:', e.message);
  }
  // Cargar HCE lateral
  try {
    const h = await api(`/history/${currentSession.patientId}`);
    document.getElementById('videoHistorySide').innerHTML = `
      <div class="hce-item"><strong>Crónicas:</strong> ${(h.chronic_conditions||[]).join(', ') || '—'}</div>
      <div class="hce-item"><strong>Alergias:</strong> ${(h.allergies||[]).join(', ') || '—'}</div>
      <div class="hce-item"><strong>Últ. consulta:</strong> ${h.consultations?.length ? new Date(h.consultations.slice(-1)[0].date).toLocaleDateString() : '—'}</div>
      <div class="hce-item"><strong>Medicamentos activos:</strong> ${(h.medications||[]).length}</div>`;
  } catch {}

  // Simular subtítulos en vivo (accesibilidad)
  const captionTexts = [
    'Buenos días, ¿cómo se siente hoy?',
    'Tengo un poco de dolor de cabeza desde ayer.',
    '¿Le ha medido la presión arterial?',
    'Sí, está en 130/85.',
    'Vamos a revisar su historial...',
  ];
  let i = 0;
  document.getElementById('captionsContent').innerHTML = '';
  captionInterval = setInterval(async () => {
    if (i >= captionTexts.length) return;
    const text = captionTexts[i];
    const speaker = i % 2 === 0 ? 'Médico' : 'Paciente';
    document.getElementById('captionsContent').innerHTML += `<div><b>${speaker}:</b> ${text}</div>`;
    try { await api(`/sessions/${currentSession.roomId}/captions`, { method: 'POST', body: JSON.stringify({ speaker, text }) }); } catch {}
    i++;
  }, 3000);

  // Simular envío de chunks cifrados de grabación
  let seq = 0;
  recordInterval = setInterval(async () => {
    try {
      await api(`/sessions/${currentSession.roomId}/recording/chunk`, {
        method: 'POST',
        body: JSON.stringify({ sequence: seq++, data: `chunk-${Date.now()}-binary-base64-stub` })
      });
    } catch {}
  }, 4000);
}

document.getElementById('endCallBtn').addEventListener('click', async () => {
  if (!currentSession) return;
  clearInterval(captionInterval); clearInterval(recordInterval);
  const stream = document.getElementById('localVideo').srcObject;
  if (stream) stream.getTracks().forEach(t => t.stop());
  try {
    await api(`/sessions/${currentSession.roomId}/end`, { method: 'POST' });
    await api(`/appointments/${currentSession.appointmentId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ notes: document.getElementById('consultNotes').value })
    });
  } catch (e) { console.error(e); }
  alert('Consulta finalizada. La grabación cifrada quedó almacenada y la cita marcada como COMPLETADA.');
  currentSession = null;
  routeAfterLogin();
});

async function saveConsultation() {
  if (!currentSession) return;
  const notes = document.getElementById('consultNotes').value;
  if (!notes.trim()) { alert('Escribe notas antes de guardar'); return; }
  try {
    await api(`/history/${currentSession.patientId}/consultations`, {
      method: 'POST',
      body: JSON.stringify({
        appointmentId: currentSession.appointmentId,
        doctorId: currentSession.doctorId,
        doctorName: USER.email,
        date: new Date(),
        motivo: 'Consulta vía videoconsulta',
        observaciones: notes,
      })
    });
    alert('✓ Notas guardadas en HCE');
  } catch (e) { alert(e.message); }
}

// ===== INIT =====
if (TOKEN && USER) routeAfterLogin();
else show('loginView');
