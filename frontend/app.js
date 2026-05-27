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
    if (e.target.dataset.tab === 'myAppointments')   loadMyAppointments();
    if (e.target.dataset.tab === 'myHistory')        loadMyHistory();
    if (e.target.dataset.tab === 'docAgenda')        loadDoctorAgenda();
    if (e.target.dataset.tab === 'myPrescriptions')  loadMyPrescriptions();
    if (e.target.dataset.tab === 'docPrescriptions') loadDoctorPrescriptions();
    if (e.target.dataset.tab === 'myIoT')            loadMyIoT();
    if (e.target.dataset.tab === 'docAlerts')        loadDoctorAlerts();
    if (e.target.dataset.tab === 'docRatings')       loadDoctorRatings();
    if (e.target.dataset.tab === 'auditOverview')    loadAuditOverview();
    if (e.target.dataset.tab === 'auditLog')         loadAuditLog();
    if (e.target.dataset.tab === 'auditPatient')     {/* manual */}
    if (e.target.dataset.tab === 'auditIntegrity')   {/* manual */}
  }
  // Side tabs en sala video
  if (e.target.classList.contains('side-tab')) {
    document.querySelectorAll('.side-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.side-panel').forEach(p => p.classList.remove('active'));
    e.target.classList.add('active');
    document.getElementById(e.target.dataset.side).classList.add('active');
    if (e.target.dataset.side === 'sideRx') loadPharmaciesForRx();
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
  else if (USER.role === 'AUDITOR') { show('auditorDashboard'); loadAuditOverview(); }
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
          ${isPatient && a.status === 'COMPLETADA'
            ? `<button class="primary" onclick="openRatingModal('${a.id}','${a.doctor_id}')">Calificar</button>` : ''}
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

// ============================================================
// ===== MVP 2: RECETAS DIGITALES + LAB =====
// ============================================================

// ----- Recetas: paciente -----
async function loadMyPrescriptions() {
  try {
    const list = await api(`/prescriptions?patient_id=${USER.external_ref_id}`);
    renderPrescriptions(list, 'prescriptionsList', /*isDoctor*/ false);
  } catch (e) { document.getElementById('prescriptionsList').innerHTML = `<p class="msg err">${e.message}</p>`; }
}

async function loadDoctorPrescriptions() {
  try {
    const list = await api(`/prescriptions?doctor_id=${USER.external_ref_id}`);
    renderPrescriptions(list, 'docPrescriptionsList', /*isDoctor*/ true);
  } catch (e) { document.getElementById('docPrescriptionsList').innerHTML = `<p class="msg err">${e.message}</p>`; }
}

async function renderPrescriptions(list, containerId, isDoctor) {
  const container = document.getElementById(containerId);
  if (!list.length) { container.innerHTML = '<p class="muted">No hay recetas.</p>'; return; }

  // Carga farmacias para selector de envío (si paciente)
  let pharmaciesHtml = '';
  if (!isDoctor) {
    try {
      const pharms = await api('/pharmacies');
      pharmaciesHtml = pharms.map(p => `<option value="${p.id}">${p.name} — ${p.city || p.region}</option>`).join('');
    } catch {}
  }

  const html = await Promise.all(list.map(async p => {
    const detail = await api(`/prescriptions/${p.id}`);
    const verify = await api(`/prescriptions/${p.id}/verify`).catch(() => ({ valid: false }));
    const items = detail.items || [];
    return `
      <div class="rx-card">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
          <div>
            <h4>Receta <span class="folio">${detail.folio}</span></h4>
            <div class="meta">${new Date(detail.issued_at).toLocaleString()} • Vence: ${new Date(detail.expires_at).toLocaleDateString()}</div>
          </div>
          <div style="display:flex;gap:6px;flex-direction:column;align-items:flex-end">
            <span class="status ${detail.status}">${detail.status}</span>
            ${verify.valid ? '<span class="badge-verified">✓ Firma válida</span>' : '<span class="badge-invalid">✗ Firma inválida</span>'}
          </div>
        </div>
        <div class="meta"><strong>Paciente:</strong> ${detail.patient_name} (DNI ${detail.patient_dni})</div>
        <div class="meta"><strong>Médico:</strong> ${detail.doctor_name} — CMP ${detail.doctor_license}</div>
        ${detail.diagnostico ? `<div class="meta"><strong>Dx:</strong> ${detail.diagnostico}</div>` : ''}
        <div class="meds">
          ${items.map(it => `<div class="med-line"><strong>${it.medication_name}</strong> — ${it.dosis}, cada ${it.frecuencia} por ${it.duracion} (${it.quantity}× ${it.via})</div>`).join('')}
        </div>
        <div class="signature">🔐 ${detail.signature_algorithm} • kid=${detail.public_key_id} • sig=${(detail.signature || '').substring(0,60)}...</div>
        ${!isDoctor && ['EMITIDA','ENVIADA'].includes(detail.status) ? `
          <div class="actions">
            <select id="sendPharm-${detail.id}">${pharmaciesHtml}</select>
            <button class="btn-primary" style="width:auto" onclick="sendRxToPharmacy('${detail.id}')">${detail.pharmacy_id ? 'Cambiar farmacia' : 'Enviar a farmacia'}</button>
          </div>` : ''}
      </div>`;
  }));
  container.innerHTML = html.join('');
}

async function sendRxToPharmacy(rxId) {
  const select = document.getElementById(`sendPharm-${rxId}`);
  const pharmacy_id = select.value;
  if (!pharmacy_id) return alert('Selecciona una farmacia');
  try {
    await api(`/prescriptions/${rxId}/send-to-pharmacy`, { method: 'POST', body: JSON.stringify({ pharmacy_id }) });
    alert(`✓ Receta enviada a la farmacia. Acércate con tu DNI.`);
    loadMyPrescriptions();
  } catch (e) { alert(e.message); }
}

// ----- Emisión de receta DESDE la sala de video -----
let rxItemCounter = 0;
function addRxItem() {
  const idx = rxItemCounter++;
  const div = document.createElement('div');
  div.className = 'rx-item';
  div.id = `rxItem-${idx}`;
  div.innerHTML = `
    <button class="rx-remove" onclick="document.getElementById('rxItem-${idx}').remove()">×</button>
    <input class="rx-med" type="text" placeholder="Medicamento (ej: Paracetamol 500mg)" required>
    <div class="row">
      <input class="rx-dosis" type="text" placeholder="Dosis (1 tab)">
      <input class="rx-frec"  type="text" placeholder="Frecuencia (8h)">
    </div>
    <div class="row">
      <input class="rx-dur"  type="text" placeholder="Duración (5 días)">
      <input class="rx-qty"  type="number" min="1" value="10" placeholder="Cantidad">
    </div>`;
  document.getElementById('rxItems').appendChild(div);
}

async function loadPharmaciesForRx() {
  try {
    const pharms = await api('/pharmacies');
    document.getElementById('rxPharmacy').innerHTML =
      '<option value="">— Sin asignar —</option>' +
      pharms.map(p => `<option value="${p.id}">${p.name} (${p.city || p.region})</option>`).join('');
  } catch {}
}

async function issuePrescription() {
  if (!currentSession) return alert('Solo desde una videoconsulta activa');
  const msg = document.getElementById('rxMsg'); msg.className = 'msg'; msg.textContent = '';
  const items = Array.from(document.querySelectorAll('#rxItems .rx-item')).map(el => ({
    medication_name: el.querySelector('.rx-med').value.trim(),
    dosis: el.querySelector('.rx-dosis').value.trim(),
    frecuencia: el.querySelector('.rx-frec').value.trim(),
    duracion: el.querySelector('.rx-dur').value.trim(),
    quantity: parseInt(el.querySelector('.rx-qty').value, 10) || 1,
  })).filter(i => i.medication_name);
  if (items.length === 0) { msg.className = 'msg err'; msg.textContent = 'Agrega al menos un medicamento'; return; }
  try {
    const r = await api('/prescriptions', {
      method: 'POST',
      body: JSON.stringify({
        patient_id: currentSession.patientId,
        doctor_id: currentSession.doctorId,
        appointment_id: currentSession.appointmentId,
        pharmacy_id: document.getElementById('rxPharmacy').value || null,
        diagnostico: document.getElementById('rxDiagnostico').value,
        items,
      })
    });
    msg.className = 'msg ok';
    msg.textContent = `✓ Receta ${r.folio} firmada y emitida${r.pharmacy_id ? ' y enviada a la farmacia' : ''}.`;
    document.getElementById('rxItems').innerHTML = '';
    document.getElementById('rxDiagnostico').value = '';
  } catch (e) { msg.className = 'msg err'; msg.textContent = e.message; }
}

// ----- Solicitar orden de laboratorio -----
let labTestCounter = 0;
function addLabTest() {
  const idx = labTestCounter++;
  const div = document.createElement('div');
  div.className = 'lab-item';
  div.id = `labTest-${idx}`;
  div.innerHTML = `
    <button class="rx-remove" onclick="document.getElementById('labTest-${idx}').remove()">×</button>
    <input class="lab-code" type="text" placeholder="Código (ej: GLU)" style="width:30%;display:inline-block">
    <input class="lab-name" type="text" placeholder="Nombre (ej: Glucosa basal)" style="width:65%;display:inline-block;margin-left:4%">`;
  document.getElementById('labTests').appendChild(div);
}

async function createLabOrder() {
  if (!currentSession) return alert('Solo desde una videoconsulta activa');
  const msg = document.getElementById('labMsg'); msg.className = 'msg'; msg.textContent = '';
  const tests = Array.from(document.querySelectorAll('#labTests .lab-item')).map(el => ({
    code: el.querySelector('.lab-code').value.trim(),
    name: el.querySelector('.lab-name').value.trim(),
    sample_type: 'sangre',
  })).filter(t => t.name);
  if (tests.length === 0) { msg.className = 'msg err'; msg.textContent = 'Agrega al menos un examen'; return; }
  try {
    const r = await api('/lab-orders', {
      method: 'POST',
      body: JSON.stringify({
        patientId: currentSession.patientId,
        doctorId: currentSession.doctorId,
        appointmentId: currentSession.appointmentId,
        preferred_lab: document.getElementById('labPreferred').value,
        tests,
      })
    });
    msg.className = 'msg ok';
    msg.textContent = `✓ Orden ${String(r._id).substring(0,8)} creada. El paciente puede ir al laboratorio.`;
    document.getElementById('labTests').innerHTML = '';
  } catch (e) { msg.className = 'msg err'; msg.textContent = e.message; }
}

// ============================================================
// ===== MVP 3: IoT + Alertas + Calificaciones =====
// ============================================================

// --- Device keys públicas para el simulador del paciente ---
const DEVICE_KEYS = {
  glucometer: 'dev-glucometer-2026',
  bp_monitor: 'dev-bp-monitor-2026',
  oximeter:   'dev-oximeter-2026',
};

async function simulateMetric(deviceType, values) {
  const headers = { 'Content-Type': 'application/json', 'x-device-key': DEVICE_KEYS[deviceType] };
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;
  try {
    const res = await fetch(API + '/iot/metrics', {
      method: 'POST', headers,
      body: JSON.stringify({
        patientId: USER.external_ref_id,
        deviceId: `sim-${deviceType}-001`,
        values,
      })
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t);
    }
    setTimeout(loadMyIoT, 600);  // refresca para que aparezca la lectura + alerta
  } catch (e) { alert('Error enviando métrica: ' + e.message); }
}

async function loadMyIoT() {
  try {
    const summary = await api(`/iot/patients/${USER.external_ref_id}/summary`);
    renderIoTCards(summary.devices);
    // Alertas del paciente
    const alerts = await api(`/alerts?patientId=${USER.external_ref_id}&status=ABIERTA`);
    renderMyAlerts(alerts);
    // Últimas mediciones (todas)
    const last = await api(`/iot/patients/${USER.external_ref_id}/metrics?limit=15`);
    renderMyMetrics(last);
  } catch (e) { console.error(e); }
}

function renderIoTCards(devices) {
  const fmt = (ts) => new Date(ts).toLocaleTimeString();
  const g = devices.glucometer, b = devices.bp_monitor, o = devices.oximeter;
  if (g) {
    document.getElementById('iotGlucoseLast').textContent = `${g.latest.values.glucose} mg/dL`;
    document.getElementById('iotGlucoseMeta').textContent = `Última: ${fmt(g.latest.ts)} • ${g.count_24h} mediciones 24h`;
  } else { document.getElementById('iotGlucoseLast').textContent = '—'; document.getElementById('iotGlucoseMeta').textContent = 'Sin lecturas'; }
  if (b) {
    document.getElementById('iotBPLast').textContent = `${b.latest.values.systolic}/${b.latest.values.diastolic}`;
    document.getElementById('iotBPMeta').textContent = `Última: ${fmt(b.latest.ts)} • ${b.count_24h} mediciones 24h`;
  } else { document.getElementById('iotBPLast').textContent = '—'; document.getElementById('iotBPMeta').textContent = 'Sin lecturas'; }
  if (o) {
    document.getElementById('iotSpO2Last').textContent = `${o.latest.values.spo2}% • ${o.latest.values.heartRate} lpm`;
    document.getElementById('iotSpO2Meta').textContent = `Última: ${fmt(o.latest.ts)} • ${o.count_24h} mediciones 24h`;
  } else { document.getElementById('iotSpO2Last').textContent = '—'; document.getElementById('iotSpO2Meta').textContent = 'Sin lecturas'; }
}

function renderMyAlerts(alerts) {
  const c = document.getElementById('myAlertsList');
  if (!alerts.length) { c.innerHTML = '<p class="muted">No tienes alertas activas.</p>'; return; }
  c.innerHTML = alerts.map(a => `
    <div class="alert-card ${a.severity}">
      <div>
        <span class="sev">${a.severity}</span>
        <strong>${a.description}</strong>
        <div class="meta">Valor: ${a.value} (${a.comparator} ${a.threshold}) — ${new Date(a.triggered_at).toLocaleString()}</div>
      </div>
    </div>`).join('');
}

function renderMyMetrics(metrics) {
  const c = document.getElementById('iotMetricsList');
  if (!metrics.length) { c.innerHTML = '<p class="muted">Sin lecturas registradas todavía.</p>'; return; }
  c.innerHTML = metrics.map(m => `
    <div class="metric-row">
      <div>
        <strong>${m.meta.deviceType}</strong>
        <span class="vals"> · ${Object.entries(m.values).map(([k,v]) => `${k}=${v}`).join(' · ')}</span>
      </div>
      <div class="ts">${new Date(m.ts).toLocaleString()}</div>
    </div>`).join('');
}

// --- Médico: alertas ---
async function loadDoctorAlerts() {
  try {
    const sev = document.getElementById('alertSeverity').value;
    const st = document.getElementById('alertStatus').value;
    const params = new URLSearchParams();
    if (sev) params.set('severity', sev);
    if (st)  params.set('status', st);
    const alerts = await api('/alerts' + (params.toString() ? '?' + params : ''));
    const c = document.getElementById('docAlertsList');
    if (!alerts.length) { c.innerHTML = '<p class="muted">No hay alertas con esos filtros.</p>'; return; }
    // Enriquecer con datos del paciente
    const cache = {};
    for (const a of alerts) {
      if (!cache[a.patientId]) {
        try { cache[a.patientId] = await api(`/patients/${a.patientId}`); } catch {}
      }
      a._patient = cache[a.patientId];
    }
    c.innerHTML = alerts.map(a => `
      <div class="alert-card ${a.severity}">
        <div>
          <span class="sev">${a.severity}</span>
          <strong>${a.description}</strong>
          <div class="meta">Paciente: ${a._patient?.first_name || 'N/A'} ${a._patient?.last_name || ''} ${a._patient?.dni ? '(DNI '+a._patient.dni+')' : ''}</div>
          <div class="meta">Valor: <b>${a.value}</b> ${a.comparator} ${a.threshold} • ${a.deviceType} • ${new Date(a.triggered_at).toLocaleString()}</div>
          <div class="meta">Estado: <b>${a.status}</b>${a.acknowledged_by ? ' por ' + a.acknowledged_by : ''}</div>
        </div>
        <div class="actions">
          ${a.status === 'ABIERTA' ? `<button onclick="ackAlert('${a._id}')">Reconocer</button>` : ''}
          ${a.status !== 'RESUELTA' ? `<button class="primary" onclick="resolveAlert('${a._id}')">Resolver</button>` : ''}
        </div>
      </div>`).join('');
  } catch (e) { document.getElementById('docAlertsList').innerHTML = `<p class="msg err">${e.message}</p>`; }
}

async function ackAlert(id) {
  try { await api(`/alerts/${id}/acknowledge`, { method: 'POST', body: JSON.stringify({ by: USER.email }) }); loadDoctorAlerts(); }
  catch (e) { alert(e.message); }
}
async function resolveAlert(id) {
  const notes = prompt('Notas de resolución (opcional):');
  try { await api(`/alerts/${id}/resolve`, { method: 'POST', body: JSON.stringify({ notes }) }); loadDoctorAlerts(); }
  catch (e) { alert(e.message); }
}

// --- Médico: calificaciones ---
async function loadDoctorRatings() {
  try {
    const summary = await api(`/ratings/doctor/${USER.external_ref_id}/summary`);
    document.getElementById('docRatingsSummary').innerHTML = `
      <div><strong>${Number(summary.avg_stars || 0).toFixed(2)}</strong><small>Promedio ★</small></div>
      <div><strong>${summary.total_ratings || 0}</strong><small>Total reseñas</small></div>
      <div><strong>${Number(summary.avg_puntualidad || 0).toFixed(2)}</strong><small>Puntualidad</small></div>
      <div><strong>${Number(summary.avg_empatia || 0).toFixed(2)}</strong><small>Empatía</small></div>`;
    const list = await api(`/ratings?doctor_id=${USER.external_ref_id}`);
    const c = document.getElementById('docRatingsList');
    c.innerHTML = list.length
      ? list.map(r => `
          <div class="rating-card">
            <div class="stars-shown">${'★'.repeat(r.stars)}${'☆'.repeat(5-r.stars)}</div>
            <div class="meta">${new Date(r.created_at).toLocaleString()} • cita ${r.appointment_id.substring(0,8)}</div>
            ${r.comment ? `<div style="margin-top:6px">${r.comment}</div>` : ''}
          </div>`).join('')
      : '<p class="muted">Aún no tienes calificaciones.</p>';
  } catch (e) { document.getElementById('docRatingsList').innerHTML = `<p class="msg err">${e.message}</p>`; }
}

// --- Modal de calificación (paciente) ---
let ratingState = { stars: 0, p: 0, e: 0, c: 0 };
function openRatingModal(appointmentId, doctorId) {
  ratingState = { stars: 0, p: 0, e: 0, c: 0 };
  const modal = document.createElement('div');
  modal.className = 'modal-bg';
  modal.innerHTML = `
    <div class="modal">
      <h3>Calificar consulta</h3>
      <p class="muted">Tu opinión ayuda a mejorar el servicio.</p>
      <div style="margin:10px 0">
        <div class="rating-stars" data-dim="stars">
          ${[1,2,3,4,5].map(n => `<span class="star" data-v="${n}">★</span>`).join('')}
        </div>
      </div>
      <div class="sub">
        <label>Puntualidad</label>
        <div class="rating-stars" data-dim="p">${[1,2,3,4,5].map(n=>`<span class="star" data-v="${n}">★</span>`).join('')}</div>
      </div>
      <div class="sub">
        <label>Empatía</label>
        <div class="rating-stars" data-dim="e">${[1,2,3,4,5].map(n=>`<span class="star" data-v="${n}">★</span>`).join('')}</div>
      </div>
      <div class="sub">
        <label>Claridad</label>
        <div class="rating-stars" data-dim="c">${[1,2,3,4,5].map(n=>`<span class="star" data-v="${n}">★</span>`).join('')}</div>
      </div>
      <textarea id="ratingComment" rows="3" placeholder="Comentario (opcional)"></textarea>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn-secondary" onclick="this.closest('.modal-bg').remove()">Cancelar</button>
        <button class="btn-primary" onclick="submitRating('${appointmentId}')">Enviar calificación</button>
      </div>
      <div id="ratingMsg" class="msg"></div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelectorAll('.rating-stars').forEach(group => {
    group.addEventListener('click', evt => {
      if (!evt.target.classList.contains('star')) return;
      const v = parseInt(evt.target.dataset.v);
      const dim = group.dataset.dim;
      ratingState[dim] = v;
      group.querySelectorAll('.star').forEach((s,i) => s.classList.toggle('active', i < v));
    });
  });
}

async function submitRating(appointmentId) {
  if (ratingState.stars < 1) { document.getElementById('ratingMsg').className='msg err'; document.getElementById('ratingMsg').textContent='Selecciona al menos 1 estrella'; return; }
  try {
    await api('/ratings', {
      method: 'POST',
      body: JSON.stringify({
        appointment_id: appointmentId,
        stars: ratingState.stars,
        puntualidad: ratingState.p || null,
        empatia: ratingState.e || null,
        claridad: ratingState.c || null,
        comment: document.getElementById('ratingComment').value || null,
      })
    });
    document.querySelector('.modal-bg').remove();
    alert('✓ Gracias por tu calificación');
  } catch (e) {
    document.getElementById('ratingMsg').className = 'msg err';
    document.getElementById('ratingMsg').textContent = e.message;
  }
}

// ============================================================
// ===== MVP 4: Dashboard del AUDITOR =====
// ============================================================

async function loadAuditOverview() {
  try {
    const s = await api('/audit/stats/summary');
    document.getElementById('auditSummaryCards').innerHTML = `
      <div><strong>${s.total_entries}</strong><small>Total registros</small></div>
      <div><strong>${s.by_event_type.length}</strong><small>Tipos de evento</small></div>
      <div><strong>${s.by_resource_type.length}</strong><small>Tipos de recurso</small></div>
      <div><strong>${s.last_entry_at ? new Date(s.last_entry_at).toLocaleTimeString() : '—'}</strong><small>Última entrada</small></div>`;
    const maxEv = Math.max(...s.by_event_type.map(x => x.n), 1);
    document.getElementById('auditByEventType').innerHTML = `
      <div class="bar-chart">
        ${s.by_event_type.map(x => `
          <div class="bar-row">
            <div class="lbl">${x.event_type}</div>
            <div class="bar"><div class="bar-fill" style="width:${(x.n/maxEv*100).toFixed(1)}%"></div></div>
            <div class="count">${x.n}</div>
          </div>`).join('')}
      </div>`;
    const maxRes = Math.max(...s.by_resource_type.map(x => x.n), 1);
    document.getElementById('auditByResource').innerHTML = `
      <div class="bar-chart">
        ${s.by_resource_type.map(x => `
          <div class="bar-row">
            <div class="lbl">${x.resource_type}</div>
            <div class="bar"><div class="bar-fill" style="width:${(x.n/maxRes*100).toFixed(1)}%"></div></div>
            <div class="count">${x.n}</div>
          </div>`).join('')}
      </div>`;
  } catch (e) {
    document.getElementById('auditSummaryCards').innerHTML = `<p class="msg err">${e.message}</p>`;
  }
}

async function loadAuditLog() {
  try {
    const params = new URLSearchParams();
    const ev = document.getElementById('filterEvent').value.trim();
    const pat = document.getElementById('filterPatient').value.trim();
    const res = document.getElementById('filterResource').value.trim();
    if (ev) params.set('event_type', ev);
    if (pat) params.set('patient_id', pat);
    if (res) params.set('resource_type', res);
    params.set('limit', '50');
    const rows = await api('/audit?' + params);
    const c = document.getElementById('auditLogTable');
    if (!rows.length) { c.innerHTML = '<p class="muted">Sin registros.</p>'; return; }
    c.innerHTML = rows.map(r => `
      <div class="audit-row" data-seq="${r.seq}">
        <div class="seq">#${r.seq}</div>
        <div>
          <div class="ev">${r.event_type}</div>
          <div class="resource">${r.resource_type || '—'} ${r.resource_id ? '· ' + r.resource_id.substring(0,20) : ''}${r.patient_id ? ' · paciente ' + r.patient_id.substring(0,8) : ''}</div>
          <div class="hash">prev: ${(r.prev_hash||'').substring(0,40)}... | entry: ${r.entry_hash.substring(0,40)}...</div>
        </div>
        <div style="text-align:right">
          <div class="ts">${new Date(r.created_at).toLocaleString()}</div>
          <button class="expand-btn" onclick="toggleAuditRow(${r.seq})">ver payload</button>
        </div>
        <pre class="full-payload">${escapeHtml(JSON.stringify(r.payload, null, 2))}</pre>
      </div>`).join('');
  } catch (e) {
    document.getElementById('auditLogTable').innerHTML = `<p class="msg err">${e.message}</p>`;
  }
}

function toggleAuditRow(seq) {
  const el = document.querySelector(`.audit-row[data-seq="${seq}"]`);
  if (el) el.classList.toggle('expanded');
}

function escapeHtml(s) { return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function verifyChainIntegrity() {
  const c = document.getElementById('integrityResult');
  c.innerHTML = '<p class="muted">Verificando cadena (puede tardar varios segundos según volumen)...</p>';
  try {
    const r = await api('/audit/integrity/verify');
    if (r.integrity === 'OK') {
      c.innerHTML = `
        <div class="integrity-ok integrity-result">
          <h4>✅ CADENA ÍNTEGRA</h4>
          <div>${r.checked_entries} entradas verificadas. Cero discrepancias.</div>
          <div class="tip">Tip hash (raíz lógica): ${r.tip_hash}</div>
        </div>`;
    } else {
      c.innerHTML = `
        <div class="integrity-broken integrity-result">
          <h4>❌ CADENA ROTA</h4>
          <div>${r.breaches_found} discrepancias en ${r.checked_entries} entradas.</div>
          <pre style="margin-top:8px;font-size:.75rem;background:rgba(255,255,255,.5);padding:8px;border-radius:4px;max-height:240px;overflow-y:auto">${JSON.stringify(r.breaches, null, 2)}</pre>
        </div>`;
    }
  } catch (e) {
    c.innerHTML = `<p class="msg err">${e.message}</p>`;
  }
}

async function tryTamper() {
  const seq = document.getElementById('tamperSeq').value;
  if (!seq) return alert('Ingresa un seq');
  const c = document.getElementById('tamperResult');
  try {
    const r = await fetch(API + `/audit/_demo/try-tamper/${seq}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    const data = await r.json();
    if (data.tamper_blocked) {
      c.innerHTML = `
        <div class="integrity-ok integrity-result">
          <h4>✅ Inmutabilidad confirmada</h4>
          <p>${data.note}</p>
          <pre style="margin-top:6px;font-size:.75rem">${escapeHtml(data.db_message)}</pre>
        </div>`;
    } else {
      c.innerHTML = `<div class="integrity-broken integrity-result"><h4>⚠️ INESPERADO</h4><pre>${JSON.stringify(data)}</pre></div>`;
    }
  } catch (e) { c.innerHTML = `<p class="msg err">${e.message}</p>`; }
}

async function loadPatientAudit() {
  const pid = document.getElementById('auditPatientId').value.trim();
  if (!pid) return;
  try {
    const rows = await api(`/audit?patient_id=${pid}&limit=100`);
    const c = document.getElementById('auditPatientTimeline');
    if (!rows.length) { c.innerHTML = '<p class="muted">Sin actividad para este paciente.</p>'; return; }
    c.innerHTML = `<div class="timeline">${rows.map(r => `
      <div class="timeline-item">
        <div class="ts">${new Date(r.created_at).toLocaleString()} • seq #${r.seq}</div>
        <div class="ev">${r.event_type}</div>
        <div class="res">${r.resource_type || '—'} ${r.resource_id ? '· ' + r.resource_id.substring(0,40) : ''} ${r.actor_role ? '· por ' + r.actor_role : ''}</div>
      </div>`).join('')}</div>`;
  } catch (e) {
    document.getElementById('auditPatientTimeline').innerHTML = `<p class="msg err">${e.message}</p>`;
  }
}

// ===== INIT =====
if (TOKEN && USER) routeAfterLogin();
else show('loginView');
