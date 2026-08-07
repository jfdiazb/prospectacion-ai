import { motion } from 'framer-motion';
import { useState, useEffect, useMemo } from 'react';
import { AppLayout } from '@components/AppLayout';
import { Card, Button, Badge } from '@components/shared';
import { leadService } from '@services/leadService';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Cell,
} from 'recharts';
import { Sparkles, Target, Users } from 'lucide-react';

const chartColors = {
  primary: '#a78bfa',
  secondary: '#38bdf8',
  accent: '#f59e0b',
  danger: '#f97316',
  green: '#22c55e',
};

/**
 * Dashboard principal
 */
export const DashboardPage = () => {
  const [stats, setStats] = useState<any>(null);
  const [hotLeads, setHotLeads] = useState<any[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [statsData, leadsData] = await Promise.all([
        leadService.getLeadStats(),
        leadService.getHotLeads(),
      ]);
      setStats(statsData);
      setHotLeads(leadsData);
    } catch (error) {
      console.error('Error cargando dashboard:', error);
    }
  };

  const weeklyData = useMemo(
    () =>
      stats?.weeklyLeads ?? [
        { name: 'Lun', leads: 24, conversions: 6, hot: 12 },
        { name: 'Mar', leads: 30, conversions: 8, hot: 16 },
        { name: 'Mié', leads: 28, conversions: 7, hot: 15 },
        { name: 'Jue', leads: 35, conversions: 11, hot: 18 },
        { name: 'Vie', leads: 40, conversions: 14, hot: 20 },
        { name: 'Sáb', leads: 20, conversions: 5, hot: 10 },
        { name: 'Dom', leads: 18, conversions: 4, hot: 9 },
      ],
    [stats],
  );

  const channelData = useMemo(
    () =>
      stats?.channelPerformance ?? [
        { name: 'YouTube', value: 58 },
        { name: 'Referidos', value: 20 },
        { name: 'Email', value: 14 },
        { name: 'Manual', value: 8 },
      ],
    [stats],
  );

  const funnelData = useMemo(
    () => [
      { name: 'Nuevos', value: stats?.newLeads ?? 38, color: chartColors.secondary },
      { name: 'Calientes', value: stats?.hotLeads ?? 18, color: chartColors.accent },
      { name: 'Convertidos', value: stats?.registeredLeads ?? 12, color: chartColors.green },
    ],
    [stats],
  );

  const conversionRate = stats
    ? Math.min(100, Math.round((stats.registeredLeads / Math.max(stats.totalLeads, 1)) * 100))
    : 0;

  return (
    <AppLayout title="Dashboard" subtitle="Monitorea tus prospectos, conversiones y actividades más importantes.">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
        {stats && (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Card className="bg-gradient-to-br from-primary-600/15 to-purple-700/15 border-white/10">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.24em] text-primary-300">Total de Leads</p>
                  <h3 className="mt-3 text-4xl font-semibold text-white">{stats.totalLeads}</h3>
                  <p className="mt-2 text-sm text-dark-300">Todos los contactos en tu pipeline.</p>
                </div>
                <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-white/10 text-primary-200 shadow-lg shadow-primary-500/10">
                  <Users className="h-6 w-6" />
                </div>
              </div>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-primary-500 to-purple-500" style={{ width: '80%' }} />
              </div>
            </Card>

            <Card className="bg-gradient-to-br from-sky-500/10 to-primary-600/10 border-white/10">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.24em] text-sky-300">Nuevos Leads</p>
                  <h3 className="mt-3 text-4xl font-semibold text-white">{stats.newLeads}</h3>
                  <p className="mt-2 text-sm text-dark-300">Leads incorporados esta semana.</p>
                </div>
                <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-white/10 text-sky-200 shadow-lg shadow-sky-500/10">
                  <Sparkles className="h-6 w-6" />
                </div>
              </div>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-cyan-500" style={{ width: '64%' }} />
              </div>
            </Card>

            <Card className="bg-gradient-to-br from-amber-500/10 to-red-500/10 border-white/10">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-300">Conversiones</p>
                  <h3 className="mt-3 text-4xl font-semibold text-white">{stats.registeredLeads}</h3>
                  <p className="mt-2 text-sm text-dark-300">Tasa de conversión estimada {conversionRate}%.</p>
                </div>
                <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-white/10 text-amber-200 shadow-lg shadow-amber-500/10">
                  <Target className="h-6 w-6" />
                </div>
              </div>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-red-500" style={{ width: `${conversionRate}%` }} />
              </div>
            </Card>
          </div>
        )}

        <section className="grid gap-6 xl:grid-cols-[1.6fr_0.95fr]">
          <Card className="overflow-hidden">
            <div className="flex flex-col gap-4 border-b border-white/10 bg-dark-900/80 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-primary-300">Actividad semanal</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Tendencia de leads</h2>
              </div>
              <div className="rounded-3xl bg-white/5 px-4 py-2 text-sm text-white shadow-inner shadow-black/10">Más de {stats?.weeklyLeads?.reduce((sum:any, item:any) => sum + item.leads, 0) ?? stats?.totalLeads ?? 0} leads esta semana</div>
            </div>

            <div className="h-[320px] px-4 py-6 sm:px-6">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="leadsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartColors.primary} stopOpacity={0.65} />
                      <stop offset="95%" stopColor={chartColors.primary} stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)' }} labelStyle={{ color: '#e2e8f0' }} itemStyle={{ color: '#f8fafc' }} />
                  <Area type="monotone" dataKey="leads" stroke={chartColors.primary} fill="url(#leadsGradient)" strokeWidth={3} dot={{ fill: '#a78bfa', r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid gap-6">
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-dark-900/80 px-6 py-5">
                <div>
                  <p className="text-sm uppercase tracking-[0.24em] text-primary-300">Funnel</p>
                  <h3 className="text-xl font-semibold text-white">Evolución de conversión</h3>
                </div>
                <Badge variant="primary">{conversionRate}%</Badge>
              </div>
              <div className="h-[220px] px-4 py-6 sm:px-6">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={funnelData} innerRadius={50} outerRadius={90} paddingAngle={4} dataKey="value">
                      {funnelData.map(entry => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)' }} labelStyle={{ color: '#e2e8f0' }} itemStyle={{ color: '#f8fafc' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-dark-900/80 px-6 py-5">
                <div>
                  <p className="text-sm uppercase tracking-[0.24em] text-primary-300">Canales</p>
                  <h3 className="text-xl font-semibold text-white">Rendimiento por fuente</h3>
                </div>
                <span className="rounded-3xl bg-white/5 px-4 py-2 text-sm text-white">Visión rápida</span>
              </div>
              <div className="h-[220px] px-4 py-6 sm:px-6">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={channelData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)' }} labelStyle={{ color: '#e2e8f0' }} itemStyle={{ color: '#f8fafc' }} />
                    <Bar dataKey="value" fill={chartColors.secondary} radius={[12, 12, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </section>

        <section className="grid gap-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Prospectos Calientes</h2>
              <p className="text-dark-300">Sigue los leads con mayor probabilidad de conversión.</p>
            </div>
            <Button variant="secondary" size="sm">
              Ver todos
            </Button>
          </div>

          <div className="grid gap-4">
            {hotLeads.slice(0, 5).map((lead, index) => (
              <motion.div key={lead._id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.08 }}>
                <Card>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="font-semibold text-white">{lead.username}</h3>
                      <p className="text-sm text-dark-300">{lead.platform}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="danger">Score: {lead.score}</Badge>
                      <span className="rounded-full bg-red-500/15 px-3 py-1 text-sm font-medium text-red-200">Urgente</span>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>
      </motion.div>
    </AppLayout>
  );
};
