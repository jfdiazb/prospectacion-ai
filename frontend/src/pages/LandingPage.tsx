import { ArrowRight, MessageSquareText, ShieldCheck, Sparkles, Target } from 'lucide-react';
import { Link } from 'react-router-dom';

const capabilities = [
  {
    icon: MessageSquareText,
    title: 'Conversaciones organizadas',
    description:
      'Centraliza el contexto de conversaciones procedentes de canales digitales autorizados.',
  },
  {
    icon: Target,
    title: 'Prospectos y calificación',
    description:
      'Organiza prospectos, señales comerciales y criterios de calificación para priorizar la atención.',
  },
  {
    icon: Sparkles,
    title: 'Seguimiento asistido',
    description: 'Facilita tareas, continuidad comercial y revisión humana durante el seguimiento.',
  },
];

export const LandingPage = () => (
  <main className="min-h-screen overflow-hidden text-white">
    <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
      <Link className="flex items-center gap-3 font-semibold" to="/">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 shadow-lg shadow-primary-900/30">
          <Sparkles size={20} aria-hidden="true" />
        </span>
        <span>ALMA Prospect</span>
      </Link>
      <Link
        className="rounded-full border border-dark-600 px-5 py-2.5 text-sm font-semibold text-dark-200 hover:border-primary-500 hover:text-white"
        to="/login"
      >
        Iniciar sesión
      </Link>
    </nav>
    <section className="relative mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-14 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:pb-28 lg:pt-24">
      <div
        className="absolute -left-32 top-0 h-72 w-72 rounded-full bg-primary-600/20 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative space-y-7">
        <p className="inline-flex items-center gap-2 rounded-full border border-primary-500/30 bg-primary-500/10 px-4 py-2 text-sm font-semibold text-primary-300">
          <ShieldCheck size={16} aria-hidden="true" /> Gestión comercial con control humano
        </p>
        <h1 className="max-w-3xl text-5xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl">
          Conversaciones que avanzan con <span className="text-primary-400">contexto</span>.
        </h1>
        <p className="max-w-2xl text-lg leading-8 text-dark-300 sm:text-xl">
          ALMA Prospect es una plataforma para gestionar conversaciones, prospectos, calificación y
          seguimiento provenientes de canales digitales.
        </p>
        <div className="flex flex-wrap gap-4">
          <Link
            className="inline-flex items-center gap-2 rounded-full bg-primary-600 px-6 py-3 font-semibold shadow-lg shadow-primary-900/30 hover:bg-primary-500"
            to="/login"
          >
            Acceder a ALMA <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <Link
            className="rounded-full border border-dark-600 px-6 py-3 font-semibold text-dark-200 hover:border-dark-400 hover:text-white"
            to="/privacy"
          >
            Privacidad
          </Link>
        </div>
      </div>
      <div className="relative rounded-[2rem] border border-dark-700 bg-dark-800/80 p-6 shadow-card backdrop-blur sm:p-8">
        <p className="mb-6 text-sm font-semibold uppercase tracking-[0.22em] text-primary-400">
          Una vista clara del proceso
        </p>
        <div className="space-y-4">
          {capabilities.map(({ icon: Icon, title, description }) => (
            <article key={title} className="rounded-2xl border border-dark-700 bg-dark-900/70 p-5">
              <div className="mb-3 flex items-center gap-3">
                <span className="rounded-xl bg-primary-500/10 p-2 text-primary-400">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <h2 className="font-semibold">{title}</h2>
              </div>
              <p className="text-sm leading-6 text-dark-300">{description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
    <footer className="border-t border-dark-800 bg-dark-900/50">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-dark-400 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>© 2026 Academia Digital 10K · ALMA Prospect</p>
        <div className="flex gap-5">
          <Link className="hover:text-white" to="/privacy">
            Política de Privacidad
          </Link>
          <Link className="hover:text-white" to="/terms">
            Términos de Servicio
          </Link>
        </div>
      </div>
    </footer>
  </main>
);
