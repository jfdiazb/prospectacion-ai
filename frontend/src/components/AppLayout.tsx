import { ReactNode } from 'react';
import { Navbar } from '@components/Navbar';
import { Sidebar } from '@components/Sidebar';

interface AppLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export const AppLayout = ({ title, subtitle, children }: AppLayoutProps) => {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(167,139,250,0.16),_transparent_28%),_radial-gradient(circle_at_20%_0%,_rgba(255,255,255,0.04),_transparent_24%),_linear-gradient(180deg,#070816_0%,#111827_100%)] text-white">
      <Sidebar />

      <div className="lg:pl-72">
        <Navbar />

        <main className="mx-auto max-w-7xl px-4 py-6 pt-28 sm:px-6 lg:px-8">
          <div className="mb-8 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-card">
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">{title}</h1>
              {subtitle && <p className="text-sm leading-7 text-dark-300 max-w-2xl md:text-base">{subtitle}</p>}
            </div>
          </div>

          {children}
        </main>
      </div>
    </div>
  );
};
