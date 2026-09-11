import { motion } from 'framer-motion';
import { useState } from 'react';
import { AppLayout } from '@components/AppLayout';
import { Card, Button, Badge } from '@components/shared';
import { scraperService } from '@services/scraperService';
import type { IScraperResult } from '@types';

export const ScraperPage = () => {
  const [hashtag, setHashtag] = useState('ventas');
  const [result, setResult] = useState<IScraperResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleScrape = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await scraperService.scrapeHashtag(hashtag.replace('#', ''));
      setResult(response.data || null);
    } catch (error) {
      console.error('Error scrapeando hashtag:', error);
      setError('No fue posible ejecutar la demostración del analizador.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout title="Social Scraper" subtitle="Extrae métricas y tendencias de hashtags para tus campañas." >
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
        <Card>
          <div className="space-y-4">
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
              Modo demostración: los resultados de esta pantalla son datos simulados y no provienen de redes sociales reales.
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Análisis rápido de hashtag</h2>
              <p className="text-dark-400">Ingresa un hashtag y obtén datos de rendimiento que te ayuden a priorizar contenido.</p>
            </div>
            {error && <p className="text-sm text-red-300">{error}</p>}
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <input
                type="text"
                value={hashtag}
                onChange={e => setHashtag(e.target.value)}
                placeholder="Ej. #emprendimiento"
                className="w-full rounded-2xl border border-white/10 bg-dark-900/95 px-4 py-3 text-sm text-white outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              />
              <Button variant="primary" onClick={handleScrape} disabled={loading}>
                {loading ? 'Analizando...' : 'Analizar hashtag'}
              </Button>
            </div>
          </div>
        </Card>

        {result && (
          <div className="grid gap-4">
            <Card>
              <div className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">#{result.hashtag}</h3>
                    <p className="text-dark-400">Datos demostrativos de tendencia, engagement y contenido.</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm text-dark-300">
                    <Badge variant="secondary">Posts: {result.totalPosts}</Badge>
                    <Badge variant="primary">Engagement: {result.avgEngagement}%</Badge>
                  </div>
                </div>
                <div className="grid gap-3">
                  {result.topPosts.map((post: any) => (
                    <Card key={post.id} hover>
                      <div className="space-y-2">
                        <p className="text-sm text-dark-300">{post.text}</p>
                        <div className="flex items-center gap-2 text-xs text-white/70">
                          <span>Engagement {post.engagement}%</span>
                          <span>·</span>
                          <span>ID: {post.id}</span>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        )}
      </motion.div>
    </AppLayout>
  );
};
