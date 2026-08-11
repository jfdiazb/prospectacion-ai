import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@context/AuthContext';
import { crmService, type CrmTask } from '@services/crmService';
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
  const [searchTerm, setSearchTerm] = useState('');
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
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

  useEffect(() => {
    crmService.tasks().then(setTasks).catch(() => setTasks([]));
  }, []);

  const pendingTasks = useMemo(
    () => tasks.filter(task => task.status === 'pending').sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    }),
    [tasks],
  );

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchTerm.trim();
    navigate(query ? `/prospectos?buscar=${encodeURIComponent(query)}` : '/prospectos');
  };

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-dark-950/95 py-4 backdrop-blur-xl lg:pl-72">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 sm:px-6 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-gradient-to-br from-primary-500 to-purple-700 text-white shadow-lg shadow-primary-500/20"><Sparkles className="h-6 w-6" /></div>
            <div><p className="text-sm text-dark-300">Bienvenido de nuevo</p><p className="font-semibold text-white">{user?.fullName ?? 'Administrador'}</p></div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <form className="relative hidden md:block" onSubmit={submitSearch} role="search">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-500" />
              <input type="search" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Buscar prospectos..." aria-label="Buscar prospectos" className="w-full rounded-2xl border border-white/10 bg-dark-900/95 py-3 pl-10 pr-4 text-sm text-white shadow-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20" />
            </form>

            <button type="button" onClick={() => setDarkMode(previous => !previous)} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-dark-900/95 px-4 text-sm text-white transition hover:border-primary-500 hover:bg-dark-800">
              {darkMode ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}{darkMode ? 'Modo oscuro' : 'Claro'}
            </button>
            <Link to="/configuracion" className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-dark-900/95 px-4 text-sm font-medium text-white transition hover:border-primary-500 hover:bg-dark-800"><UserCircle className="h-4 w-4" />Mi cuenta</Link>
            <button type="button" onClick={handleLogout} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 text-sm font-medium text-red-200 transition hover:border-red-400 hover:bg-red-500/15"><LogOut className="h-4 w-4" />Cerrar sesión</button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-dark-300 xl:justify-end">
          {mobileRoutes.map(route => <Link key={route.path} to={route.path} className="rounded-2xl bg-dark-900 px-4 py-2 transition hover:bg-dark-800 hover:text-white">{route.label}</Link>)}
          <div className="relative">
            <button type="button" aria-expanded={alertsOpen} aria-controls="navbar-alerts" onClick={() => setAlertsOpen(open => !open)} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-dark-900/95 px-4 text-sm text-white transition hover:border-primary-500 hover:bg-dark-800">
              <Bell className="h-4 w-4" />Alertas
              {pendingTasks.length > 0 && <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">{pendingTasks.length}</span>}
            </button>
            {alertsOpen && (
              <div id="navbar-alerts" className="absolute right-0 z-50 mt-3 w-[min(22rem,calc(100vw-2rem))] rounded-3xl border border-white/10 bg-dark-950 p-4 shadow-2xl shadow-black/40">
                <div className="mb-3 flex items-center justify-between gap-3"><p className="font-semibold text-white">Tareas pendientes</p><span className="text-xs text-dark-400">{pendingTasks.length} activas</span></div>
                <div className="max-h-72 space-y-2 overflow-y-auto">
                  {pendingTasks.slice(0, 5).map(task => (
                    <button key={task._id} type="button" onClick={() => navigate('/crm')} className="w-full rounded-2xl bg-white/5 p-3 text-left transition hover:bg-white/10">
                      <p className="text-sm font-medium text-white">{task.title}</p>
                      <p className="mt-1 text-xs text-dark-400">{task.leadId?.fullName || task.leadId?.username || 'Actividad CRM'}{task.dueDate ? ` · ${new Date(task.dueDate).toLocaleDateString('es-CO')}` : ''}</p>
                    </button>
                  ))}
                  {!pendingTasks.length && <p className="rounded-2xl bg-white/5 p-4 text-sm text-dark-300">No tienes tareas pendientes.</p>}
                </div>
                <button type="button" onClick={() => navigate('/crm')} className="mt-3 w-full rounded-2xl border border-primary-500/30 px-4 py-2 text-sm font-medium text-primary-200 transition hover:bg-primary-500/10">Ver CRM</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
