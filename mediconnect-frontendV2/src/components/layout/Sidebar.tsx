
import { NavLink } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { 
  Home, 
  Calendar, 
  Activity, 
  FileText, 
  LogOut,
  ShieldAlert,
  Bell
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

const patientLinks = [
  { name: 'Dashboard', to: '/patient/dashboard', icon: Home },
  { name: 'Citas Médicas', to: '/patient/appointments', icon: Calendar },
  { name: 'Monitoreo IoT', to: '/patient/iot-monitoring', icon: Activity },
];

const doctorLinks = [
  { name: 'Dashboard', to: '/doctor/dashboard', icon: Home },
  { name: 'Mi Agenda', to: '/doctor/appointments', icon: Calendar },
  { name: 'Alertas', to: '/doctor/alerts', icon: Bell },
  { name: 'Buscar Paciente', to: '/doctor/ehr/search', icon: FileText },
];

const auditorLinks = [
  { name: 'Auditoría EHR', to: '/auditor/logs', icon: ShieldAlert },
];

export const Sidebar = () => {
  const { user, logout } = useAuthStore();

  const links = 
    user?.role === 'patient' ? patientLinks : 
    user?.role === 'doctor' ? doctorLinks : 
    user?.role === 'auditor' ? auditorLinks : [];

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col h-full shrink-0">
      <div className="h-16 flex items-center px-6 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2 text-white font-bold text-xl tracking-tight">
          <Activity className="text-teal-400" />
          <span>MediConnect</span>
        </div>
      </div>
      
      <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors font-medium text-sm",
                isActive 
                  ? "bg-teal-500/10 text-teal-400" 
                  : "hover:bg-slate-800 hover:text-slate-100"
              )}
            >
              <Icon size={18} />
              {link.name}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800 shrink-0">
        <button 
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2.5 w-full text-left rounded-lg text-slate-400 hover:bg-slate-800 hover:text-red-400 transition-colors font-medium text-sm"
        >
          <LogOut size={18} />
          Cerrar Sesión
        </button>
      </div>
    </aside>
  );
};
