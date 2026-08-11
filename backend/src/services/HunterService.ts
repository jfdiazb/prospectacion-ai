import axios, { type AxiosInstance } from 'axios';
import crypto from 'crypto';
import HunterOpportunity from '../models/HunterOpportunity';
import HunterSearchCache from '../models/HunterSearchCache';
import YouTubeQuotaUsage from '../models/YouTubeQuotaUsage';
import Lead from '../models/Lead';
import { YouTubeTokenService } from '../integrations/youtube/YouTubeTokenService';
import type { IHunterProfile } from '../types/index';

type SearchInput = { keyword: string; type?: 'channel' | 'video'; minFollowers?: number; maxFollowers?: number; regionCode?: string; publishedAfter?: string; pageToken?: string };
type SearchResponse = { items?: any[]; nextPageToken?: string };

export class HunterService {
  static async searchProfiles(query: SearchInput, userId?: string, http: AxiosInstance = axios): Promise<{ results: IHunterProfile[]; nextPageToken?: string; cached: boolean; quota: any }> {
    if (!userId) throw new Error('Usuario no autenticado');
    const keyword = query.keyword?.trim();
    if (!keyword || keyword.length < 2 || keyword.length > 100) throw new Error('La búsqueda debe tener entre 2 y 100 caracteres');
    const type = query.type === 'video' ? 'video' : 'channel';
    const maxResults = Math.min(20, Math.max(1, Number(process.env.YOUTUBE_HUNTER_MAX_RESULTS || 10)));
    const normalized = { keyword: keyword.toLowerCase(), type, minFollowers: Number(query.minFollowers || 0), maxFollowers: Number(query.maxFollowers || 0), regionCode: query.regionCode?.toUpperCase(), publishedAfter: query.publishedAfter, pageToken: query.pageToken };
    const cacheKey = crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
    const cached: any = await HunterSearchCache.findOne({ userId, cacheKey, expiresAt: { $gt: new Date() } }).lean();
    if (cached) return { results: cached.results, nextPageToken: cached.nextPageToken, cached: true, quota: await this.quotaStatus(userId) };

    if ((process.env.YOUTUBE_HUNTER_MODE || 'mock') !== 'live') {
      const results = this.mockResults(keyword, type);
      return { results, cached: false, quota: await this.quotaStatus(userId) };
    }

    await this.reserveQuota(userId, 1, 1);
    const token = await new YouTubeTokenService(http).getAccessToken(userId);
    const params: Record<string, string | number> = { part: 'snippet', q: keyword, type, maxResults, safeSearch: 'moderate' };
    if (normalized.regionCode && /^[A-Z]{2}$/.test(normalized.regionCode)) params.regionCode = normalized.regionCode;
    if (query.publishedAfter && !Number.isNaN(Date.parse(query.publishedAfter))) params.publishedAfter = new Date(query.publishedAfter).toISOString();
    if (query.pageToken) params.pageToken = query.pageToken;
    const search = await http.get<SearchResponse>('https://www.googleapis.com/youtube/v3/search', { params, headers: { Authorization: `Bearer ${token}` }, timeout: Number(process.env.YOUTUBE_TIMEOUT_MS || 10000) });
    const channelIds = [...new Set((search.data.items || []).map(item => item.snippet?.channelId || item.id?.channelId).filter(Boolean))] as string[];
    let channelMap = new Map<string, any>();
    if (channelIds.length) {
      const channels = await http.get<{ items?: any[] }>('https://www.googleapis.com/youtube/v3/channels', { params: { part: 'snippet,statistics', id: channelIds.join(',') }, headers: { Authorization: `Bearer ${token}` }, timeout: Number(process.env.YOUTUBE_TIMEOUT_MS || 10000) });
      channelMap = new Map((channels.data.items || []).map(item => [item.id, item]));
    }
    const results = (search.data.items || []).map(item => this.toProfile(item, channelMap, type)).filter(profile => {
      const followers = profile.followers || 0;
      return followers >= normalized.minFollowers && (!normalized.maxFollowers || followers <= normalized.maxFollowers);
    });
    await HunterSearchCache.findOneAndUpdate({ userId, cacheKey }, { userId, cacheKey, results, nextPageToken: search.data.nextPageToken, expiresAt: new Date(Date.now() + Number(process.env.YOUTUBE_HUNTER_CACHE_MS || 21600000)) }, { upsert: true });
    return { results, nextPageToken: search.data.nextPageToken, cached: false, quota: await this.quotaStatus(userId) };
  }

  static async saveOpportunity(userId: string, profile: IHunterProfile) {
    if (!profile.youtubeChannelId || !profile.profileUrl) throw new Error('Oportunidad de YouTube inválida');
    return HunterOpportunity.findOneAndUpdate(
      { userId, youtubeChannelId: profile.youtubeChannelId, youtubeVideoId: profile.youtubeVideoId || null },
      { userId, youtubeChannelId: profile.youtubeChannelId, youtubeVideoId: profile.youtubeVideoId, kind: profile.kind || 'channel', title: profile.fullName || profile.username, channelTitle: profile.channelTitle, description: profile.bio, profileUrl: profile.profileUrl, thumbnailUrl: profile.thumbnailUrl, followers: profile.followers, views: profile.views, publishedAt: profile.publishedAt, score: profile.score, status: 'saved' },
      { upsert: true, new: true, runValidators: true },
    );
  }

  static async convertOpportunity(userId: string, opportunityId: string) {
    const opportunity: any = await HunterOpportunity.findOne({ _id: opportunityId, userId });
    if (!opportunity) throw new Error('Oportunidad no encontrada');
    const username = opportunity.youtubeChannelId;
    const lead: any = await Lead.findOneAndUpdate({ userId, platform: 'youtube', username }, { $setOnInsert: { userId, platform: 'youtube', username, fullName: opportunity.channelTitle || opportunity.title, bio: opportunity.description, profileUrl: `https://www.youtube.com/channel/${opportunity.youtubeChannelId}`, followers: opportunity.followers, engagement: 0, status: 'new', interestLevel: opportunity.score >= 71 ? 'hot' : opportunity.score >= 31 ? 'warm' : 'cold', score: opportunity.score, tags: ['youtube', 'lead-hunter'], source: 'youtube_lead_hunter' } }, { upsert: true, new: true, runValidators: true });
    opportunity.status = 'converted'; opportunity.leadId = lead._id; await opportunity.save();
    return { opportunity, lead };
  }

  static async listOpportunities(userId: string) { return HunterOpportunity.find({ userId }).sort({ createdAt: -1 }).limit(100).lean(); }

  static async enrichProfile(profile: IHunterProfile): Promise<IHunterProfile> { return { ...profile, score: profile.score ?? 50, interestLevel: profile.interestLevel ?? 'warm', followers: profile.followers ?? 0, engagement: profile.engagement ?? 0 }; }

  static async quotaStatus(userId: string) {
    const day = new Date().toISOString().slice(0, 10);
    const [project, user]: any[] = await Promise.all([YouTubeQuotaUsage.findOne({ scopeId: 'project', day }).lean(), YouTubeQuotaUsage.findOne({ scopeId: userId, day }).lean()]);
    return { day, projectSearchCalls: project?.searchCalls || 0, userSearchCalls: user?.searchCalls || 0, projectSearchLimit: Number(process.env.YOUTUBE_HUNTER_DAILY_SEARCH_LIMIT || 100), userSearchLimit: Number(process.env.YOUTUBE_HUNTER_USER_DAILY_SEARCH_LIMIT || 25), generalUnits: project?.generalUnits || 0 };
  }

  private static async reserveQuota(userId: string, searchCalls: number, generalUnits: number) {
    const status = await this.quotaStatus(userId);
    if (status.projectSearchCalls + searchCalls > status.projectSearchLimit) throw new Error('Se alcanzó el límite diario de búsquedas de YouTube del proyecto');
    if (status.userSearchCalls + searchCalls > status.userSearchLimit) throw new Error('Alcanzaste tu límite diario de búsquedas de YouTube');
    const day = status.day;
    await Promise.all([
      YouTubeQuotaUsage.findOneAndUpdate({ scopeId: 'project', day }, { $inc: { searchCalls, generalUnits }, $setOnInsert: { scopeId: 'project', day } }, { upsert: true }),
      YouTubeQuotaUsage.findOneAndUpdate({ scopeId: userId, day }, { $inc: { searchCalls, generalUnits }, $setOnInsert: { scopeId: userId, day } }, { upsert: true }),
    ]);
  }

  private static toProfile(item: any, channels: Map<string, any>, type: 'channel' | 'video'): IHunterProfile {
    const channelId = item.snippet?.channelId || item.id?.channelId;
    const channel = channels.get(channelId);
    const followers = Number(channel?.statistics?.subscriberCount || 0);
    const views = Number(channel?.statistics?.viewCount || 0);
    const score = Math.min(100, Math.round(Math.log10(Math.max(followers, 1)) * 15 + (views > 100000 ? 15 : 0)));
    const videoId = item.id?.videoId;
    return { username: channelId, platform: 'youtube', kind: type, youtubeChannelId: channelId, youtubeVideoId: videoId, fullName: item.snippet?.title || channel?.snippet?.title || 'Canal de YouTube', channelTitle: item.snippet?.channelTitle || channel?.snippet?.title, bio: item.snippet?.description, followers, views, engagement: 0, interestLevel: score >= 71 ? 'hot' : score >= 31 ? 'warm' : 'cold', score, profileUrl: videoId ? `https://www.youtube.com/watch?v=${videoId}` : `https://www.youtube.com/channel/${channelId}`, thumbnailUrl: item.snippet?.thumbnails?.medium?.url || channel?.snippet?.thumbnails?.medium?.url, publishedAt: item.snippet?.publishedAt, tags: [type, 'youtube'] };
  }

  private static mockResults(keyword: string, type: 'channel' | 'video'): IHunterProfile[] {
    return [{ username: 'demo-channel', platform: 'youtube', kind: type, youtubeChannelId: 'demo-channel', youtubeVideoId: type === 'video' ? 'demo-video' : undefined, fullName: `Resultado de prueba: ${keyword}`, channelTitle: 'Canal demostración', bio: 'Activa YOUTUBE_HUNTER_MODE=live para consultar la API oficial.', followers: 4200, views: 120000, engagement: 0, interestLevel: 'warm', score: 62, profileUrl: 'https://www.youtube.com', tags: ['youtube', 'demo'] }];
  }
}
