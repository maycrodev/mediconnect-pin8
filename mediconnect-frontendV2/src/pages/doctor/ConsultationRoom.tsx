import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, FileText, ClipboardPen, ShieldCheck } from 'lucide-react';

export const ConsultationRoom = () => {
  // id is available for backend calls
  useParams();
  const navigate = useNavigate();
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [showPrescription, setShowPrescription] = useState(false);

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-6 animate-in fade-in duration-500">
      {/* Video Call Area */}
      <div className="flex-1 flex flex-col glass-panel rounded-2xl overflow-hidden bg-slate-900 border-slate-800">
        <div className="flex-1 relative p-4 flex flex-col justify-center items-center">
          {/* Main Patient Video (Mock) */}
          <div className="absolute inset-0 bg-slate-800/50 flex flex-col items-center justify-center">
            {isVideoOn ? (
              <img 
                src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=800&q=80" 
                alt="Paciente" 
                className="w-full h-full object-cover opacity-80"
              />
            ) : (
              <div className="w-32 h-32 bg-slate-700 rounded-full flex items-center justify-center">
                <span className="text-4xl text-white font-bold">CM</span>
              </div>
            )}
            {/* Accesibilidad: Subtítulos */}
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-black/60 text-white px-6 py-3 rounded-lg backdrop-blur-sm text-center max-w-xl text-lg font-medium shadow-lg">
              "Sí doctor, el dolor de cabeza ha disminuido desde ayer."
            </div>
          </div>

          {/* Doctor Video (Self - Mock) */}
          <div className="absolute bottom-6 right-6 w-48 h-32 bg-black rounded-xl overflow-hidden border-2 border-slate-600 shadow-2xl">
             <img 
                src="https://images.unsplash.com/photo-1612349317150-e410f624c427?auto=format&fit=crop&w=300&q=80" 
                alt="Doctor" 
                className="w-full h-full object-cover"
              />
          </div>
        </div>

        {/* Controls */}
        <div className="h-20 bg-slate-900/90 backdrop-blur-md border-t border-slate-800 flex items-center justify-center gap-6 px-6">
          <button 
            onClick={() => setIsMicOn(!isMicOn)}
            className={`p-4 rounded-full transition-colors ${isMicOn ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}`}
          >
            {isMicOn ? <Mic size={24} /> : <MicOff size={24} />}
          </button>
          <button 
            onClick={() => setIsVideoOn(!isVideoOn)}
            className={`p-4 rounded-full transition-colors ${isVideoOn ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}`}
          >
            {isVideoOn ? <VideoIcon size={24} /> : <VideoOff size={24} />}
          </button>
          <button 
            onClick={() => navigate('/doctor/dashboard')}
            className="p-4 rounded-full bg-red-600 hover:bg-red-700 text-white transition-colors shadow-lg shadow-red-500/20"
          >
            <PhoneOff size={24} />
          </button>
        </div>
      </div>

      {/* Side Panel (EHR / Prescriptions) */}
      <div className="w-96 glass-panel rounded-2xl flex flex-col overflow-hidden bg-white">
        <div className="flex border-b border-slate-100 p-1 bg-slate-50">
          <button 
            onClick={() => setShowPrescription(false)}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${!showPrescription ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            Historial (EHR)
          </button>
          <button 
            onClick={() => setShowPrescription(true)}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${showPrescription ? 'bg-white shadow-sm text-teal-600' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            Receta Digital
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!showPrescription ? (
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 text-blue-800 rounded-lg text-sm">
                <strong>Paciente:</strong> Carlos Mendoza (45 años)<br/>
                <strong>Alergias:</strong> Penicilina
              </div>
              <div className="border border-slate-100 rounded-xl p-3">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5"><FileText size={14}/> Último Laboratorio</h4>
                <p className="text-xs text-slate-600 mt-1">Hace 2 meses. Perfil lipídico normal.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase">Medicamento</label>
                  <input type="text" className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none" placeholder="Ej. Paracetamol 500mg" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase">Indicaciones</label>
                  <textarea className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none h-24" placeholder="Tomar cada 8 horas..."></textarea>
                </div>
              </div>
              
              <div className="mt-6 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2 text-xs text-emerald-600 font-medium bg-emerald-50 p-2 rounded-lg mb-4">
                  <ShieldCheck size={16} />
                  Firma Electrónica Autorizada
                </div>
                <button className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md">
                  <ClipboardPen size={18} />
                  Emitir Receta a Farmacia
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
