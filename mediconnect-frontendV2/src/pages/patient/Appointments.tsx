import { useState } from 'react';
import { Calendar as CalendarIcon, Video, MapPin, User, Search, Plus, X } from 'lucide-react';

const mockAppointments = [
  { id: 1, doctor: 'Dr. Roberto Gómez', specialty: 'Cardiología', date: 'Mañana, 10:00 AM', mode: 'Videoconsulta', status: 'Confirmada' },
  { id: 2, doctor: 'Dra. Ana Silva', specialty: 'Medicina General', date: '28 Mayo, 15:30 PM', mode: 'Presencial', status: 'Pendiente' },
];

export const PatientAppointments = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Mis Citas Médicas</h1>
          <p className="text-slate-500 mt-1">Gestione sus consultas presenciales y videoconsultas.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-xl font-medium transition-colors shadow-md shadow-teal-500/20"
        >
          <Plus size={18} />
          Agendar Cita
        </button>
      </header>

      {/* Filters */}
      <div className="glass-panel p-4 rounded-xl flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por médico o especialidad..." 
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-teal-50 text-teal-700 font-medium rounded-lg text-sm">Próximas</button>
          <button className="px-4 py-2 text-slate-600 hover:bg-slate-100 font-medium rounded-lg text-sm transition-colors">Historial</button>
        </div>
      </div>

      {/* Appointments List */}
      <div className="space-y-4">
        {mockAppointments.map(app => (
          <div key={app.id} className="glass-panel rounded-2xl p-6 flex flex-col md:flex-row gap-6 justify-between items-start md:items-center border-l-4 border-l-teal-500">
            <div className="flex gap-5">
              <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                <User className="text-slate-400" size={28} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">{app.doctor}</h3>
                <p className="text-slate-500">{app.specialty}</p>
                <div className="flex flex-wrap items-center gap-4 mt-3">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700 bg-slate-100 px-3 py-1 rounded-full">
                    <CalendarIcon size={14} /> {app.date}
                  </span>
                  <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700 bg-slate-100 px-3 py-1 rounded-full">
                    {app.mode === 'Videoconsulta' ? <Video size={14} className="text-purple-500" /> : <MapPin size={14} className="text-blue-500" />} 
                    {app.mode}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${app.status === 'Confirmada' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                {app.status}
              </span>
              <button className="flex-1 md:flex-none px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors">
                Modificar
              </button>
              <button className="flex-1 md:flex-none px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal Agendar */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-lg font-bold text-slate-900">Agendar Nueva Cita</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Especialidad</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                  <option>Medicina General</option>
                  <option>Cardiología</option>
                  <option>Pediatría</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Modalidad</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                  <option>Videoconsulta (Telemedicina)</option>
                  <option>Presencial</option>
                </select>
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg">
                  Cancelar
                </button>
                <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg shadow-sm">
                  Confirmar Fecha
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
