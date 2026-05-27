
import { Activity, HeartPulse, Droplet, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

export const PatientIoTMonitoring = () => {
  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Monitoreo IoT</h1>
          <p className="text-slate-500 mt-1">Dispositivos médicos sincronizados con su historial clínico.</p>
        </div>
        <button className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-xl font-medium transition-colors shadow-sm">
          <RefreshCw size={16} />
          Sincronizar Ahora
        </button>
      </header>

      {/* Dispositivos Conectados */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Tensiómetro */}
        <div className="glass-panel rounded-2xl overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-rose-100 text-rose-600 rounded-xl">
                <HeartPulse size={24} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Tensiómetro Smart</h3>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span> Conectado
                </div>
              </div>
            </div>
            <span className="text-xs text-slate-400">Última lectura: Hace 2h</span>
          </div>
          <div className="p-6 flex-1 flex flex-col justify-center items-center text-center">
            <div className="flex items-baseline gap-1">
              <span className="text-5xl font-black text-slate-900 tracking-tighter">118/76</span>
              <span className="text-lg font-medium text-slate-500">mmHg</span>
            </div>
            <div className="mt-4 flex items-center gap-2 text-green-700 bg-green-50 px-3 py-1.5 rounded-lg text-sm font-medium">
              <CheckCircle2 size={16} /> Presión Arterial Normal
            </div>
          </div>
        </div>

        {/* Glucómetro */}
        <div className="glass-panel rounded-2xl overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl">
                <Droplet size={24} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Glucómetro Continuo</h3>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span> Conectado
                </div>
              </div>
            </div>
            <span className="text-xs text-slate-400">Última lectura: Hace 15m</span>
          </div>
          <div className="p-6 flex-1 flex flex-col justify-center items-center text-center">
            <div className="flex items-baseline gap-1">
              <span className="text-5xl font-black text-slate-900 tracking-tighter">142</span>
              <span className="text-lg font-medium text-slate-500">mg/dL</span>
            </div>
            <div className="mt-4 flex items-center gap-2 text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg text-sm font-medium">
              <AlertCircle size={16} /> Nivel Ligeramente Elevado
            </div>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 flex items-start gap-4">
        <Activity className="text-blue-600 shrink-0 mt-0.5" />
        <div>
          <h4 className="font-semibold text-blue-900">Seguimiento Activo</h4>
          <p className="text-sm text-blue-800 mt-1">
            Sus datos están siendo monitoreados por el equipo de cardiología del Dr. Roberto Gómez. Las alertas críticas se enviarán automáticamente a su médico.
          </p>
        </div>
      </div>
    </div>
  );
};
