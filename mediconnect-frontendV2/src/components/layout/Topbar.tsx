
import { useAuthStore } from '../../store/useAuthStore';
import { Bell, Wifi, WifiOff } from 'lucide-react';
import { useState, useEffect } from 'react';

export const Topbar = () => {
  const { user } = useAuthStore();
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!user) return null;

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 shadow-sm z-10">
      <div className="flex items-center gap-4 text-sm">
        {isOnline ? (
          <span className="flex items-center gap-1.5 text-teal-600 font-medium px-2.5 py-1 bg-teal-50 rounded-full">
            <Wifi size={14} /> Conectado
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-amber-600 font-medium px-2.5 py-1 bg-amber-50 rounded-full">
            <WifiOff size={14} /> Modo Offline (Sincronización diferida)
          </span>
        )}
      </div>

      <div className="flex items-center gap-5">
        <button className="relative p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors">
          <Bell size={20} />
          {user.role === 'doctor' && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
          )}
        </button>

        <div className="flex items-center gap-3 border-l border-slate-200 pl-5">
          <div className="text-right hidden md:block">
            <div className="text-sm font-semibold text-slate-900">{user.name}</div>
            <div className="text-xs text-slate-500 capitalize">{user.role}</div>
          </div>
          <img 
            src={user.avatar} 
            alt={user.name} 
            className="w-9 h-9 rounded-full object-cover border border-slate-200"
          />
        </div>
      </div>
    </header>
  );
};
