
import { Calendar, Activity, FileText, ChevronRight, Clock, MapPin } from 'lucide-react';

const nextAppointments = [
  { id: 1, doctor: 'Dr. Roberto Gómez', specialty: 'Cardiología', date: 'Mañana, 10:00 AM', mode: 'Videoconsulta' },
  { id: 2, doctor: 'Dra. Ana Silva', specialty: 'Medicina General', date: '28 Mayo, 15:30 PM', mode: 'Presencial' },
];

const recentLabs = [
  { id: 1, name: 'Hemograma Completo', date: 'Hace 2 días', status: 'Disponible' },
  { id: 2, name: 'Perfil Lipídico', date: 'Hace 2 días', status: 'Disponible' },
];

export const PatientDashboard = () => {
  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Mi Panel de Salud</h1>
        <p className="text-slate-500 mt-1">Resumen general de su estado y próximas actividades.</p>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-panel p-6 rounded-2xl border-l-4 border-l-teal-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">Próxima Cita</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">Mañana</h3>
              <p className="text-sm text-slate-600 mt-1">Cardiología</p>
            </div>
            <div className="p-3 bg-teal-50 text-teal-600 rounded-xl">
              <Calendar size={24} />
            </div>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl border-l-4 border-l-blue-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">Recetas Activas</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">2</h3>
              <p className="text-sm text-slate-600 mt-1">Ver farmacias afiliadas</p>
            </div>
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <FileText size={24} />
            </div>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl border-l-4 border-l-purple-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">Monitoreo IoT</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">Normal</h3>
              <p className="text-sm text-slate-600 mt-1">Última lectura hace 2h</p>
            </div>
            <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
              <Activity size={24} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Next Appointments */}
        <section className="glass-panel rounded-2xl p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-slate-900">Próximas Citas</h2>
            <button className="text-sm text-teal-600 font-medium hover:text-teal-700">Ver todas</button>
          </div>
          <div className="space-y-4">
            {nextAppointments.map(app => (
              <div key={app.id} className="group flex items-start gap-4 p-4 border border-slate-100 hover:border-teal-100 hover:bg-teal-50/50 rounded-xl transition-all cursor-pointer">
                <div className="p-3 bg-slate-100 group-hover:bg-teal-100 group-hover:text-teal-700 text-slate-500 rounded-xl transition-colors">
                  <Calendar size={20} />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-slate-900">{app.doctor}</h4>
                  <p className="text-sm text-slate-500">{app.specialty}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs font-medium text-slate-600">
                    <span className="flex items-center gap-1"><Clock size={14} /> {app.date}</span>
                    <span className="flex items-center gap-1"><MapPin size={14} /> {app.mode}</span>
                  </div>
                </div>
                <ChevronRight size={20} className="text-slate-400 self-center group-hover:text-teal-600 transition-colors" />
              </div>
            ))}
          </div>
        </section>

        {/* Recent Labs */}
        <section className="glass-panel rounded-2xl p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-slate-900">Resultados Recientes</h2>
            <button className="text-sm text-blue-600 font-medium hover:text-blue-700">Ir a Historial</button>
          </div>
          <div className="space-y-4">
            {recentLabs.map(lab => (
              <div key={lab.id} className="flex items-center justify-between p-4 border border-slate-100 rounded-xl hover:shadow-md transition-shadow">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                    <FileText size={20} />
                  </div>
                  <div>
                    <h4 className="font-medium text-slate-900">{lab.name}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">{lab.date}</p>
                  </div>
                </div>
                <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                  {lab.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
