import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  User,
  Users,
  Repeat,
  PhoneCall,
  Settings,
  Sparkles,
  Search,
  Globe,
  Youtube,
  CalendarRange,
} from 'lucide-react';

const routes = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { label: 'Perfil', path: '/profile', icon: User },
  { label: 'Prospectos', path: '/prospectos', icon: Users },
  { label: 'Lead Hunter', path: '/lead-hunter', icon: Search },
  { label: 'YouTube Monitor', path: '/youtube-monitor', icon: Youtube },
  { label: 'Social Scraper (demo)', path: '/social-scraper', icon: Globe },
  { label: 'Automatizaciones', path: '/automatizaciones', icon: Repeat },
  { label: 'CRM', path: '/crm', icon: PhoneCall },
  { label: 'Lanzamientos', path: '/lanzamientos', icon: CalendarRange },
  { label: 'Configuración', path: '/configuracion', icon: Settings },
];

export const Sidebar = () => {
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 flex-col gap-8 overflow-y-auto border-r border-white/10 bg-dark-950/95 px-6 py-8 backdrop-blur-xl lg:flex">
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-3xl bg-gradient-to-br from-primary-500/15 to-purple-700/15 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.16)]">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-purple-700 text-white shadow-lg shadow-primary-500/20">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white">ProspectAI</h1>
            <p className="text-sm text-dark-300">Prospección inteligente</p>
          </div>
        </div>
      </div>

      <nav className="space-y-2">
        {routes.map(route => {
          const Icon = route.icon;
          return (
            <NavLink
              key={route.path}
              to={route.path}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-3xl px-4 py-3 text-base font-medium transition ${
                  isActive
                    ? 'bg-gradient-to-r from-primary-600 to-purple-600 text-white shadow-lg shadow-primary-500/20'
                    : 'text-dark-200 hover:bg-dark-900/80 hover:text-white'
                }`
              }
            >
              <Icon className="h-5 w-5" />
              {route.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="mt-auto rounded-[1.75rem] border border-white/10 bg-dark-900/90 p-5 text-sm text-dark-300 shadow-lg shadow-black/20">
        <p className="font-semibold text-white">Panel moderno</p>
        <p className="mt-2 leading-6 text-dark-300">
          Accede rápido a herramientas clave y mantén tu flujo de trabajo organizado.
        </p>
      </div>
    </aside>
  );
};
