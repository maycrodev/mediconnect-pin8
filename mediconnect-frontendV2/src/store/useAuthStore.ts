import { create } from 'zustand';

export type Role = 'patient' | 'doctor' | 'auditor' | null;

interface User {
  id: string;
  name: string;
  role: Role;
  email: string;
  avatar?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (role: Role) => void;
  logout: () => void;
}

const mockUsers: Record<string, User> = {
  patient: {
    id: 'P-12345678',
    name: 'Carlos Mendoza',
    role: 'patient',
    email: 'carlos@example.com',
    avatar: 'https://i.pravatar.cc/150?u=carlos',
  },
  doctor: {
    id: 'D-98765432',
    name: 'Dra. Ana Silva',
    role: 'doctor',
    email: 'dra.silva@mediconnect.gob',
    avatar: 'https://i.pravatar.cc/150?u=ana',
  },
  auditor: {
    id: 'A-55555555',
    name: 'Auditoría Minsal',
    role: 'auditor',
    email: 'auditor@minsal.gob',
    avatar: 'https://i.pravatar.cc/150?u=auditor',
  },
};

export const useAuthStore = create<AuthState>((set) => ({
  user: mockUsers['patient'], // Default logged in as patient for quick testing
  isAuthenticated: true,
  login: (role) => set({ user: role ? mockUsers[role] : null, isAuthenticated: !!role }),
  logout: () => set({ user: null, isAuthenticated: false }),
}));
