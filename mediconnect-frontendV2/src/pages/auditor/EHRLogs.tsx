import { useState } from 'react';
import { ShieldCheck, Search, Download, Filter, Eye } from 'lucide-react';

const mockLogs = [
  { id: 'LOG-001', timestamp: '2026-05-26 10:15:32', user: 'Dr. Roberto Gómez', role: 'Médico Especialista', action: 'Acceso Lectura EHR', targetPatient: 'Carlos Mendoza', ip: '192.168.1.45', status: 'Autorizado' },
  { id: 'LOG-002', timestamp: '2026-05-26 10:45:11', user: 'Dra. Ana Silva', role: 'Médico General', action: 'Emisión Receta Digital', targetPatient: 'María Fernanda', ip: '10.0.0.12', status: 'Autorizado firmado' },
  { id: 'LOG-003', timestamp: '2026-05-25 18:20:05', user: 'Desconocido', role: 'N/A', action: 'Intento Acceso EHR', targetPatient: 'Luis Herrera', ip: '203.0.113.42', status: 'Bloqueado' },
];

export const EHRLogs = () => {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <ShieldCheck className="text-purple-600" size={32} />
            Auditoría de Accesos
          </h1>
          <p className="text-slate-500 mt-1">Registros inmutables de acceso al Historial Clínico Electrónico Nacional.</p>
        </div>
        <button className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow-sm">
          <Download size={18} /> Exportar Reporte Criptográfico
        </button>
      </header>

      {/* Controles de Filtro */}
      <div className="glass-panel p-4 rounded-xl flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por ID de log, usuario o paciente..." 
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg font-medium hover:bg-slate-50">
          <Filter size={18} /> Filtros Avanzados
        </button>
      </div>

      {/* Tabla de Logs */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">ID Log (Hash)</th>
                <th className="px-6 py-4">Fecha / Hora</th>
                <th className="px-6 py-4">Usuario</th>
                <th className="px-6 py-4">Acción</th>
                <th className="px-6 py-4">Paciente Afectado</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4 text-center">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mockLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-mono text-xs text-slate-500">{log.id}</td>
                  <td className="px-6 py-4 text-slate-700">{log.timestamp}</td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">{log.user}</div>
                    <div className="text-xs text-slate-500">{log.role}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-700">{log.action}</td>
                  <td className="px-6 py-4 text-slate-700">{log.targetPatient}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      log.status.includes('Autorizado') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button className="text-purple-600 hover:text-purple-800 p-1 rounded hover:bg-purple-50 transition-colors">
                      <Eye size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-sm text-slate-500">
          Mostrando 3 de 34,201 registros encriptados.
          <div className="flex gap-2 text-xs">
             <span className="font-mono bg-slate-200 px-2 py-1 rounded text-slate-700">SHA-256 Checksum Verified</span>
          </div>
        </div>
      </div>
    </div>
  );
};
