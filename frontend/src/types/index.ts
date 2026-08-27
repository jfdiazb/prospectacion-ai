/**
 * Tipos e interfaces del frontend
 */

export interface IUser {
  _id: string;
  email: string;
  fullName: string;
  avatar?: string;
  role: string;
  plan: string;
}

export interface ILead {
  _id: string;
  username: string;
  platform: string;
  fullName?: string;
  bio?: string;
  followers?: number;
  engagement?: number;
  status: string;
  interestLevel: string;
  score: number;
  tags: string[];
  lastContact?: string;
  nextFollowUp?: string;
  notes?: string;
}

export interface IConversation {
  _id: string;
  leadId: string;
  messages: IMessage[];
  status: string;
}

export interface IMessage {
  _id: string;
  sender: 'user' | 'lead' | 'ai';
  text: string;
  timestamp: Date;
}

export interface CrmConversation {
  _id: string;
  leadId?: {
    username?: string;
    fullName?: string;
  };
  status: string;
  lastMessage?: string;
  messages: Array<{
    _id: string;
    sender: 'user' | 'lead' | 'ai';
    text: string;
    timestamp: string;
  }>;
}

export interface IDashboardMetrics {
  totalLeads: number;
  newLeads: number;
  activeConversations: number;
  responseRate: number;
  hotProspects: number;
  conversions: number;
}

export interface IAuthResponse {
  token: string;
  user: IUser;
}

export interface IApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
}

export interface IHunterProfile {
  username: string;
  platform: string;
  fullName?: string;
  bio?: string;
  followers?: number;
  engagement?: number;
  interestLevel?: string;
  score?: number;
  profileUrl?: string;
  tags?: string[];
  kind?: 'channel' | 'video';
  youtubeChannelId?: string;
  youtubeVideoId?: string;
  channelTitle?: string;
  thumbnailUrl?: string;
  views?: number;
  publishedAt?: string;
  profileId?: string;
  entityType?: 'person' | 'organization' | 'unknown';
  entityConfidence?: number;
  jobEvidenceType?: 'explicit' | 'indirect' | 'insufficient';
  scores?: { commercial: number; jobAvailability: number; nutritionWellness: number; productSales: number; overall: number };
  matchStatus?: 'high_priority' | 'good_candidate' | 'review' | 'low_match';
  evidence?: Array<{ category: 'commercial' | 'jobAvailability' | 'nutritionWellness' | 'productSales'; type: 'explicit' | 'indirect' | 'insufficient'; signal: string; sourceField: string; publicUrl: string; publishedAt?: string; observedAt: string; confidence: number; context: string; possibleNegation: boolean }>;
  publicLocation?: string;
  locationSource?: string;
  channelUrl?: string;
}

export interface IScraperResult {
  hashtag: string;
  totalPosts: number;
  avgEngagement: number;
  topPosts: {
    id: string;
    text: string;
    engagement: number;
  }[];
}
