
import { useNavigate } from 'react-router-dom';
import { useAuthStore, type Role } from '../store/useAuthStore';
import { Activity, User, Stethoscope, ShieldCheck } from 'lucide-react';

export const Login = () => {
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleLogin = (role: Role) => {
    login(role);
    if (role === 'patient') navigate('/patient/dashboard');
    if (role === 'doctor') navigate('/doctor/dashboard');
    if (role === 'auditor') navigate('/auditor/logs');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center text-teal-600">
          <Activity size={48} />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900 tracking-tight">
          MediConnect S.A.S.
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600">
          Plataforma Nacional de Telemedicina
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl shadow-slate-200/50 sm:rounded-2xl sm:px-10 border border-slate-100">
          <p className="text-center text-sm font-medium text-slate-500 mb-6">
            Seleccione su perfil de acceso para el MVP
          </p>
          
          <div className="space-y-4">
            <button
              onClick={() => handleLogin('patient')}
              className="w-full flex justify-between items-center px-4 py-4 border border-slate-200 rounded-xl shadow-sm text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 hover:border-teal-500 hover:ring-1 hover:ring-teal-500 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-teal-50 text-teal-600 rounded-lg group-hover:bg-teal-100 transition-colors">
                  <User size={20} />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-slate-900">Portal Paciente</div>
                  <div className="text-xs text-slate-500 font-normal">Agendar citas, telemedicina, IoT</div>
                </div>
              </div>
            </button>

            <button
              onClick={() => handleLogin('doctor')}
              className="w-full flex justify-between items-center px-4 py-4 border border-slate-200 rounded-xl shadow-sm text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 hover:border-blue-500 hover:ring-1 hover:ring-blue-500 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-100 transition-colors">
                  <Stethoscope size={20} />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-slate-900">Portal Médico</div>
                  <div className="text-xs text-slate-500 font-normal">Consultas, EHR, recetas digitales</div>
                </div>
              </div>
            </button>

            <button
              onClick={() => handleLogin('auditor')}
              className="w-full flex justify-between items-center px-4 py-4 border border-slate-200 rounded-xl shadow-sm text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 hover:border-purple-500 hover:ring-1 hover:ring-purple-500 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-50 text-purple-600 rounded-lg group-hover:bg-purple-100 transition-colors">
                  <ShieldCheck size={20} />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-slate-900">Portal Auditor</div>
                  <div className="text-xs text-slate-500 font-normal">Revisión de logs inmutables EHR</div>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
