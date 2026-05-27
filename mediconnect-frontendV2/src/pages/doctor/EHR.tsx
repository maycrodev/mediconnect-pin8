import { useState } from 'react';
import { Search, User, FileText, Activity, Clock, ShieldCheck, Printer } from 'lucide-react';

const mockPatient = {
  id: '101',
  name: 'Carlos Mendoza',
  age: 45,
  gender: 'Masculino',
  bloodType: 'O+',
  allergies: ['Penicilina'],
  chronicConditions: ['Hipertensión Arterial']
};

export const EHR = () => {
  const [searchTerm, setSearchTerm] = useState('');
  
  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Historial Clínico Electrónico (EHR)</h1>
          <p className="text-slate-500 mt-1">Acceso de solo lectura a registros inmutables (Integración Legacy API).</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-medium transition-colors">
            <Printer size={18} /> Imprimir Resumen
          </button>
        </div>
      </header>

      {/* Buscador de Pacientes */}
      <div className="glass-panel p-4 rounded-xl flex items-center gap-4 border border-slate-200">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Buscar paciente por DNI o Nombre Completo..." 
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors">
          Buscar
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Panel lateral: Perfil del paciente */}
        <div className="lg:col-span-1 space-y-6">
          <div className="glass-panel rounded-2xl p-6 text-center border-t-4 border-t-blue-600">
            <div className="w-24 h-24 mx-auto bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <User size={40} className="text-slate-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">{mockPatient.name}</h2>
            <p className="text-slate-500 text-sm">ID: {mockPatient.id}</p>
            
            <div className="mt-6 space-y-3 text-sm text-left">
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Edad</span>
                <span className="font-medium text-slate-900">{mockPatient.age} años</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Sexo</span>
                <span className="font-medium text-slate-900">{mockPatient.gender}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Grupo Sanguíneo</span>
                <span className="font-medium text-slate-900">{mockPatient.bloodType}</span>
              </div>
            </div>

            <div className="mt-6 text-left">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Alergias</h4>
              <div className="flex flex-wrap gap-2">
                {mockPatient.allergies.map(a => (
                  <span key={a} className="bg-rose-100 text-rose-700 px-2.5 py-1 rounded-md text-xs font-bold">{a}</span>
                ))}
              </div>
            </div>
            
            <div className="mt-4 text-left">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Condiciones Crónicas</h4>
              <div className="flex flex-wrap gap-2">
                {mockPatient.chronicConditions.map(c => (
                  <span key={c} className="bg-amber-100 text-amber-700 px-2.5 py-1 rounded-md text-xs font-bold">{c}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Panel principal: Línea de tiempo EHR */}
        <div className="lg:col-span-3 space-y-6">
          <div className="glass-panel rounded-2xl p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-900">Línea de Tiempo Clínica</h3>
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                <ShieldCheck size={14} /> Registros Auditados
              </div>
            </div>

            <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
              {/* Event 1 */}
              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-blue-100 text-blue-600 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                  <Activity size={18} />
                </div>
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-slate-100 bg-white shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="font-bold text-slate-900">Control Hipertensión</h4>
                    <span className="text-xs font-medium text-slate-500 flex items-center gap-1"><Clock size={12}/> Hace 1 mes</span>
                  </div>
                  <p className="text-sm text-slate-600 mt-2">Paciente acude a control mensual. PA: 120/80. Se renueva receta de Losartán 50mg.</p>
                  <p className="text-xs text-slate-400 mt-3 font-mono">Médico: Dr. Roberto Gómez - ID: REG-20260425-001</p>
                </div>
              </div>

              {/* Event 2 */}
              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-purple-100 text-purple-600 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                  <FileText size={18} />
                </div>
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-slate-100 bg-white shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="font-bold text-slate-900">Examen de Laboratorio</h4>
                    <span className="text-xs font-medium text-slate-500 flex items-center gap-1"><Clock size={12}/> Hace 2 meses</span>
                  </div>
                  <p className="text-sm text-slate-600 mt-2">Perfil lipídico. Colesterol total: 190 mg/dL (Normal). Triglicéridos: 150 mg/dL (Normal).</p>
                  <button className="mt-3 text-sm text-blue-600 font-medium hover:underline">Ver Resultados Completos</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
