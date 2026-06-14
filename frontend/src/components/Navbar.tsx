import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@context/AuthContext';
import { Bell, LogOut, Moon, Search, Sparkles, Sun, UserCircle } from 'lucide-react';

const mobileRoutes = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Prospectos', path: '/prospectos' },
  { label: 'Lead Hunter', path: '/lead-hunter' },
  { label: 'Social Scraper', path: '/social-scraper' },
  { label: 'Automatizaciones', path: '/automatizaciones' },
];

export const Navbar = () => {
  const { user, logout } = useAuth();
  const [darkMode, setDarkMode] = useState(true);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  useEffect(() => {
    const storedTheme = localStorage.getItem('theme');
    setDarkMode(storedTheme ? storedTheme === 'dark' : true);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-dark-950/95 py-4 backdrop-blur-xl lg:pl-72">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 sm:px-6 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between w-full">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-gradient-to-br from-primary-500 to-purple-700 text-white shadow-lg shadow-primary-500/20">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-dark-300">Bienvenido de nuevo</p>
              <p className="font-semibold text-white">{user?.fullName ?? 'Administrador'}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative hidden md:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-500" />
              <input
                type="text"
                placeholder="Buscar..."
                className="w-full rounded-2xl border border-white/10 bg-dark-900/95 py-3 pl-10 pr-4 text-sm text-white shadow-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              />
            </div>

            <button
              type="button"
              onClick={() => setDarkMode(prev => !prev)}
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-dark-900/95 px-4 text-sm text-white transition hover:border-primary-500 hover:bg-dark-800"
            >
              {darkMode ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              {darkMode ? 'Modo oscuro' : 'Claro'}
            </button>

            <Link
              to="/configuracion"
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-dark-900/95 px-4 text-sm font-medium text-white transition hover:border-primary-500 hover:bg-dark-800"
            >
              <UserCircle className="h-4 w-4" />
              Mi cuenta
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 text-sm font-medium text-red-200 transition hover:border-red-400 hover:bg-red-500/15"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-dark-300 xl:justify-end">
          {mobileRoutes.map(route => (
            <Link
              key={route.path}
              to={route.path}
              className="rounded-2xl bg-dark-900 px-4 py-2 transition hover:bg-dark-800 hover:text-white"
            >
              {route.label}
            </Link>
          ))}
          <button className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-dark-900/95 px-4 text-sm text-white transition hover:border-primary-500 hover:bg-dark-800">
            <Bell className="h-4 w-4" />
            Alertas
          </button>
        </div>
      </div>
    </header>
  );
};
