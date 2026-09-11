import axios, { type AxiosInstance } from 'axios';
import crypto from 'crypto';
import mongoose from 'mongoose';
import HunterOpportunity from '../models/HunterOpportunity';
import HunterSearchCache from '../models/HunterSearchCache';
import YouTubeQuotaUsage from '../models/YouTubeQuotaUsage';
import Lead from '../models/Lead';
import { YouTubeTokenService } from '../integrations/youtube/YouTubeTokenService';
import type { IHunterProfile } from '../types/index';
import { classifyHunterCandidate, hunterStatus, SALES_JOB_SEEKER_NUTRITION_V1, type HunterSource } from './hunter/HunterScoring';
import { CommercialContextService } from './CommercialContextService';
import { AMWAY_INITIAL_CONTEXT } from '../commercial/presets/amway';

export type HunterSearchInput = { profileId?: string; keyword?: string; type?: 'channel' | 'video'; minFollowers?: number; maxFollowers?: number; regionCode?: string; publishedAfter?: string; pageToken?: string; minScore?: number; quantity?: number; recentDays?: number };

export class HunterService {
  static profiles() { return [SALES_JOB_SEEKER_NUTRITION_V1]; }

  static async searchProfiles(query: HunterSearchInput, userId?: string, http: AxiosInstance = axios): Promise<{ results: IHunterProfile[]; cached: boolean; quota: any; profileId: string; searchedQueries: number; mode: 'mock' | 'live' }> {
    if (!userId) throw new Error('Usuario no autenticado');
    const profileId = query.profileId || (query.keyword ? 'legacy_keyword' : SALES_JOB_SEEKER_NUTRITION_V1.id);
    if (![SALES_JOB_SEEKER_NUTRITION_V1.id, 'legacy_keyword'].includes(profileId)) throw new Error('Perfil objetivo no soportado');
    if (query.keyword !== undefined && (query.keyword.trim().length < 2 || query.keyword.trim().length > 100)) throw new Error('La búsqueda debe tener entre 2 y 100 caracteres');
    const commercialContext: any = mongoose.connection.readyState === 1 ? await CommercialContextService.getActive(userId) : AMWAY_INITIAL_CONTEXT;
    const maxCandidates = Math.min(50, Math.max(1, Number(process.env.YOUTUBE_HUNTER_MAX_CANDIDATES || 20)));
    const quantity = Math.min(maxCandidates, Math.max(1, Number(query.quantity || process.env.YOUTUBE_HUNTER_MAX_RESULTS || 20)));
    const minScore = Math.min(100, Math.max(0, Number(query.minScore ?? (query.keyword ? 0 : process.env.YOUTUBE_HUNTER_DEFAULT_MIN_SCORE || 75))));
    const recentDays = Math.min(365, Math.max(7, Number(query.recentDays || process.env.YOUTUBE_HUNTER_DEFAULT_RECENT_DAYS || 90)));
    const publishedAfter = query.publishedAfter || new Date(Date.now() - recentDays * 86400000).toISOString();
    const normalized = { profileId, keyword: query.keyword?.trim().toLowerCase(), minFollowers: Number(query.minFollowers || 0), maxFollowers: Number(query.maxFollowers || 0), regionCode: (query.regionCode || 'CO').toUpperCase(), publishedAfter, minScore, quantity };
    const cacheKey = crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
    const cached: any = await HunterSearchCache.findOne({ userId, cacheKey, expiresAt: { $gt: new Date() } }).lean();
    if (cached) return { results: cached.results, cached: true, quota: await this.quotaStatus(userId), profileId, searchedQueries: 0, mode: 'live' };
    if ((process.env.YOUTUBE_HUNTER_MODE || 'mock') !== 'live') {
      const contextualTerms = commercialContext?.targetProfiles?.flatMap((profile: any) => profile.searchTerms ?? []).slice(0, 6).join(' ');
      const results = this.mockResults(query.keyword || contextualTerms || 'vendedor nuevas oportunidades nutrición').filter(item => (item.scores?.overall || 0) >= minScore).slice(0, quantity);
      return { results, cached: false, quota: await this.quotaStatus(userId), profileId, searchedQueries: 0, mode: 'mock' };
    }

    const configuredQueries = commercialContext?.targetProfiles?.flatMap((profile: any) => profile.searchTerms ?? []).filter(Boolean).slice(0, 10) ?? [];
    const queries = query.keyword ? [query.keyword.trim()] : configuredQueries.length ? configuredQueries : [...SALES_JOB_SEEKER_NUTRITION_V1.searchGroups];
    await this.reserveQuota(userId, queries.length, 2);
    const token = await new YouTubeTokenService(http).getAccessToken(userId);
    const request = { headers: { Authorization: `Bearer ${token}` }, timeout: Number(process.env.YOUTUBE_TIMEOUT_MS || 10000) };
    const searches = await Promise.all(queries.map((q: string) => http.get<any>('https://www.googleapis.com/youtube/v3/search', { ...request, params: { part: 'snippet', q, type: 'video', order: 'date', maxResults: quantity, safeSearch: 'moderate', regionCode: normalized.regionCode, publishedAfter } })));
    const items = searches.flatMap(response => response.data.items || []);
    const videoIds = [...new Set(items.map((item: any) => item.id?.videoId).filter(Boolean))] as string[];
    const channelIds = [...new Set(items.map((item: any) => item.snippet?.channelId).filter(Boolean))] as string[];
    const [videos, channels] = await Promise.all([
      videoIds.length ? http.get<any>('https://www.googleapis.com/youtube/v3/videos', { ...request, params: { part: 'snippet,statistics', id: videoIds.slice(0, 50).join(',') } }) : Promise.resolve({ data: { items: [] } }),
      channelIds.length ? http.get<any>('https://www.googleapis.com/youtube/v3/channels', { ...request, params: { part: 'snippet,statistics,brandingSettings', id: channelIds.slice(0, 50).join(',') } }) : Promise.resolve({ data: { items: [] } }),
    ]);
    const videoMap = new Map<string, any>((videos.data.items || []).map((item: any) => [item.id, item]));
    const channelMap = new Map<string, any>((channels.data.items || []).map((item: any) => [item.id, item]));
    const byChannel = new Map<string, any[]>();
    for (const item of items) { const id = item.snippet?.channelId; if (!id) continue; const list = byChannel.get(id) || []; if (!list.some(v => v.id?.videoId === item.id?.videoId)) list.push(item); byChannel.set(id, list); }
    const results = [...byChannel.entries()].map(([id, list]) => this.toCandidate(id, list, channelMap.get(id), videoMap)).filter(profile => (profile.followers || 0) >= normalized.minFollowers && (!normalized.maxFollowers || (profile.followers || 0) <= normalized.maxFollowers) && (profile.scores?.overall || 0) >= minScore).sort((a, b) => (b.scores?.overall || 0) - (a.scores?.overall || 0)).slice(0, quantity);
    await HunterSearchCache.findOneAndUpdate({ userId, cacheKey }, { userId, cacheKey, results, expiresAt: new Date(Date.now() + Number(process.env.YOUTUBE_HUNTER_CACHE_MS || 21600000)) }, { upsert: true });
    return { results, cached: false, quota: await this.quotaStatus(userId), profileId, searchedQueries: queries.length, mode: 'live' };
  }

  static async saveOpportunity(userId: string, profile: IHunterProfile) {
    if (!profile.youtubeChannelId || !profile.profileUrl) throw new Error('Oportunidad de YouTube inválida');
    return HunterOpportunity.findOneAndUpdate({ userId, youtubeChannelId: profile.youtubeChannelId, youtubeVideoId: profile.youtubeVideoId || null }, { ...profile, userId, title: profile.fullName || profile.username, description: profile.bio, score: profile.scores?.overall ?? profile.score ?? 0, status: 'saved' }, { upsert: true, new: true, runValidators: true });
  }
  static async convertOpportunity(userId: string, opportunityId: string) {
    const opportunity: any = await HunterOpportunity.findOne({ _id: opportunityId, userId });
    if (!opportunity) throw new Error('Oportunidad no encontrada');
    const score = opportunity.scores?.overall ?? opportunity.score ?? 0;
    const lead: any = await Lead.findOneAndUpdate({ userId, platform: 'youtube', username: opportunity.youtubeChannelId }, { $setOnInsert: { userId, platform: 'youtube', username: opportunity.youtubeChannelId, fullName: opportunity.channelTitle || opportunity.title, bio: opportunity.description, profileUrl: opportunity.channelUrl || `https://www.youtube.com/channel/${opportunity.youtubeChannelId}`, followers: opportunity.followers, engagement: 0, status: 'new', interestLevel: score >= 85 ? 'hot' : score >= 60 ? 'warm' : 'cold', score, tags: ['youtube', 'lead-hunter', opportunity.profileId || SALES_JOB_SEEKER_NUTRITION_V1.id], source: 'youtube_lead_hunter' } }, { upsert: true, new: true, runValidators: true });
    opportunity.status = 'converted'; opportunity.leadId = lead._id; await opportunity.save(); return { opportunity, lead };
  }
  static async listOpportunities(userId: string) { return HunterOpportunity.find({ userId }).sort({ createdAt: -1 }).limit(100).lean(); }
  static async enrichProfile(profile: IHunterProfile): Promise<IHunterProfile> { return { ...profile, score: profile.scores?.overall ?? profile.score ?? 50, interestLevel: profile.interestLevel ?? 'warm', followers: profile.followers ?? 0, engagement: profile.engagement ?? 0 }; }
  static async quotaStatus(userId: string) { const day = new Date().toISOString().slice(0, 10); const [project, user]: any[] = await Promise.all([YouTubeQuotaUsage.findOne({ scopeId: 'project', day }).lean(), YouTubeQuotaUsage.findOne({ scopeId: userId, day }).lean()]); return { day, projectSearchCalls: project?.searchCalls || 0, userSearchCalls: user?.searchCalls || 0, projectSearchLimit: Number(process.env.YOUTUBE_HUNTER_DAILY_SEARCH_LIMIT || 100), userSearchLimit: Number(process.env.YOUTUBE_HUNTER_USER_DAILY_SEARCH_LIMIT || 25), generalUnits: project?.generalUnits || 0 }; }
  private static async reserveQuota(userId: string, searchCalls: number, generalUnits: number) { const status = await this.quotaStatus(userId); if (status.projectSearchCalls + searchCalls > status.projectSearchLimit) throw new Error('Se alcanzó el límite diario de búsquedas de YouTube del proyecto'); if (status.userSearchCalls + searchCalls > status.userSearchLimit) throw new Error('Alcanzaste tu límite diario de búsquedas de YouTube'); await Promise.all(['project', userId].map(scopeId => YouTubeQuotaUsage.findOneAndUpdate({ scopeId, day: status.day }, { $inc: { searchCalls, generalUnits }, $setOnInsert: { scopeId, day: status.day } }, { upsert: true }))); }

  private static toCandidate(channelId: string, items: any[], channel: any, videoMap: Map<string, any>): IHunterProfile {
    const channelUrl = `https://www.youtube.com/channel/${channelId}`; const sources: HunterSource[] = [{ text: channel?.snippet?.title || '', field: 'channel_title', url: channelUrl }, { text: channel?.snippet?.description || '', field: 'channel_description', url: channelUrl }];
    for (const item of items) { const video = videoMap.get(item.id?.videoId) || item; const url = `https://www.youtube.com/watch?v=${item.id?.videoId}`; sources.push({ text: video.snippet?.title || '', field: 'video_title', url, publishedAt: video.snippet?.publishedAt }, { text: video.snippet?.description || '', field: 'video_description', url, publishedAt: video.snippet?.publishedAt }); if (video.snippet?.tags?.length) sources.push({ text: video.snippet.tags.join(' '), field: 'video_tags', url, publishedAt: video.snippet?.publishedAt }); }
    const classified = classifyHunterCandidate(sources); const representative = items.sort((a, b) => Date.parse(b.snippet?.publishedAt || '0') - Date.parse(a.snippet?.publishedAt || '0'))[0]; const country = channel?.brandingSettings?.channel?.country;
    return { username: channelId, platform: 'youtube', kind: 'channel', profileId: SALES_JOB_SEEKER_NUTRITION_V1.id, youtubeChannelId: channelId, youtubeVideoId: representative?.id?.videoId, fullName: channel?.snippet?.title || representative?.snippet?.channelTitle || 'Canal de YouTube', channelTitle: channel?.snippet?.title, bio: channel?.snippet?.description, followers: Number(channel?.statistics?.subscriberCount || 0), views: Number(channel?.statistics?.viewCount || 0), engagement: 0, interestLevel: classified.scores.overall >= 85 ? 'hot' : classified.scores.overall >= 60 ? 'warm' : 'cold', score: classified.scores.overall, scores: classified.scores, matchStatus: hunterStatus(classified.scores.overall), entityType: classified.entityType, entityConfidence: classified.entityConfidence, jobEvidenceType: classified.jobEvidenceType, evidence: classified.evidence, profileUrl: representative?.id?.videoId ? `https://www.youtube.com/watch?v=${representative.id.videoId}` : channelUrl, channelUrl, thumbnailUrl: channel?.snippet?.thumbnails?.medium?.url, publishedAt: representative?.snippet?.publishedAt, publicLocation: country, locationSource: country ? 'YouTube channel country' : undefined, tags: ['youtube', SALES_JOB_SEEKER_NUTRITION_V1.id] };
  }
  private static mockResults(keyword: string): IHunterProfile[] { const sources: HunterSource[] = [{ text: `Soy asesora comercial, abierta a nuevas oportunidades. Experiencia en venta de productos de nutrición, bienestar y vida saludable. ${keyword}`, field: 'channel_description', url: 'https://www.youtube.com/channel/demo-channel' }, { text: 'Consejos de nutrición, suplementos y ventas directas', field: 'video_title', url: 'https://www.youtube.com/watch?v=demo-video', publishedAt: new Date().toISOString() }]; const c = classifyHunterCandidate(sources); return [{ username: 'demo-channel', platform: 'youtube', kind: 'channel', profileId: SALES_JOB_SEEKER_NUTRITION_V1.id, youtubeChannelId: 'demo-channel', youtubeVideoId: 'demo-video', fullName: 'Resultado demostrativo', channelTitle: 'Canal demostración', bio: sources[0].text, followers: 4200, views: 120000, engagement: 0, interestLevel: 'hot', score: c.scores.overall, scores: c.scores, matchStatus: hunterStatus(c.scores.overall), entityType: c.entityType, entityConfidence: c.entityConfidence, jobEvidenceType: c.jobEvidenceType, evidence: c.evidence, profileUrl: sources[1].url, channelUrl: sources[0].url, publicLocation: 'Colombia', locationSource: 'YouTube channel country', publishedAt: sources[1].publishedAt, tags: ['youtube', 'demo', SALES_JOB_SEEKER_NUTRITION_V1.id] }]; }
}
