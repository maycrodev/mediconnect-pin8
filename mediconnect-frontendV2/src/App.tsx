
import { Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { MainLayout } from './components/layout/MainLayout';
import { PatientDashboard } from './pages/patient/Dashboard';
import { PatientAppointments } from './pages/patient/Appointments';
import { PatientIoTMonitoring } from './pages/patient/IoTMonitoring';
import { DoctorDashboard } from './pages/doctor/Dashboard';
import { DoctorAppointments } from './pages/doctor/Appointments';
import { EHRLogs } from './pages/auditor/EHRLogs';
import { useAuthStore } from './store/useAuthStore';

function App() {
  const { isAuthenticated, user } = useAuthStore();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      
      <Route path="/" element={<MainLayout />}>
        {/* Redirect based on role or to login if not authenticated */}
        <Route index element={
          !isAuthenticated ? <Navigate to="/login" replace /> :
          user?.role === 'patient' ? <Navigate to="/patient/dashboard" replace /> :
          user?.role === 'doctor' ? <Navigate to="/doctor/dashboard" replace /> :
          user?.role === 'auditor' ? <Navigate to="/auditor/logs" replace /> :
          <Navigate to="/login" replace />
        } />

        {/* Patient Routes */}
        <Route path="patient/dashboard" element={<PatientDashboard />} />
        <Route path="patient/appointments" element={<PatientAppointments />} />
        <Route path="patient/iot-monitoring" element={<PatientIoTMonitoring />} />

        {/* Doctor Routes */}
        <Route path="doctor/dashboard" element={<DoctorDashboard />} />
        <Route path="doctor/appointments" element={<DoctorAppointments />} />
        {/* Placeholder for others */}
        <Route path="doctor/alerts" element={<div className="p-6">Alertas Críticas</div>} />
        <Route path="doctor/ehr/search" element={<div className="p-6">Buscador EHR</div>} />

        {/* Auditor Routes */}
        <Route path="auditor/logs" element={<EHRLogs />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
