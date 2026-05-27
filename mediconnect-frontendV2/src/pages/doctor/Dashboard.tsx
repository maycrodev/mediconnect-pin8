
import { AlertTriangle, Calendar, Video, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const todaysPatients = [
  { id: '101', name: 'Carlos Mendoza', time: '10:00 AM', mode: 'Videoconsulta', status: 'En espera' },
  { id: '102', name: 'María Fernanda', time: '11:30 AM', mode: 'Presencial', status: 'Confirmado' },
];

const criticalAlerts = [
  { id: 1, patient: 'Luis Herrera', type: 'Glucosa Alta (180 mg/dL)', time: 'Hace 15m' },
];

export const DoctorDashboard = () => {
  const navigate = useNavigate();

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Panel Médico</h1>
        <p className="text-slate-500 mt-1">Visión general de su agenda de hoy y alertas de pacientes crónicos.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <section className="glass-panel rounded-2xl p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="text-blue-600" /> Agenda de Hoy
              </h2>
              <button onClick={() => navigate('/doctor/appointments')} className="text-sm text-blue-600 font-medium hover:text-blue-700">Ver Calendario Completo</button>
            </div>
            
            <div className="space-y-4">
              {todaysPatients.map(patient => (
                <div key={patient.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 border border-slate-100 rounded-xl hover:shadow-md transition-shadow">
                  <div className="flex gap-4 items-center">
                    <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-bold">
                      {patient.name.charAt(0)}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900">{patient.name}</h4>
                      <p className="text-sm text-slate-500">{patient.time} • {patient.mode}</p>
                    </div>
                  </div>
                  
                  <div className="flex gap-3 mt-4 sm:mt-0 w-full sm:w-auto">
                    {patient.mode === 'Videoconsulta' && (
                      <button 
                        onClick={() => navigate(`/doctor/consultation/${patient.id}`)}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
                      >
                        <Video size={16} /> Iniciar
                      </button>
                    )}
                    <button 
                      onClick={() => navigate('/doctor/ehr/search')}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 border border-slate-200 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      Ver EHR
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="glass-panel rounded-2xl p-6 border-t-4 border-t-rose-500">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
              <AlertTriangle className="text-rose-500" /> Alertas IoT Críticas
            </h2>
            <div className="space-y-4">
              {criticalAlerts.map(alert => (
                <div key={alert.id} className="p-4 bg-rose-50 rounded-xl border border-rose-100">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-bold text-rose-900">{alert.patient}</h4>
                    <span className="text-xs text-rose-500 font-medium">{alert.time}</span>
                  </div>
                  <p className="text-sm text-rose-700">{alert.type}</p>
                  <button className="mt-3 text-xs font-semibold text-rose-600 flex items-center gap-1 hover:text-rose-800">
                    Revisar Historial <ArrowRight size={14} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="glass-panel rounded-2xl p-6 bg-gradient-to-br from-blue-600 to-indigo-700 text-white border-none">
            <h3 className="text-lg font-bold mb-2">Métricas Mensuales</h3>
            <div className="space-y-4 mt-4">
              <div>
                <p className="text-blue-100 text-sm">Consultas Atendidas</p>
                <p className="text-3xl font-black">142</p>
              </div>
              <div>
                <p className="text-blue-100 text-sm">Calificación Promedio</p>
                <div className="flex items-baseline gap-1">
                  <p className="text-3xl font-black">4.9</p>
                  <span className="text-blue-200">/ 5.0</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
