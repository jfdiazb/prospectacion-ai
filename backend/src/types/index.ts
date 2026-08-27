/**
 * Tipos y interfaces de la aplicación
 */

export interface IUser {
  _id?: string;
  email: string;
  password: string;
  fullName: string;
  avatar?: string;
  role: 'admin' | 'user' | 'team_lead';
  phone?: string;
  company?: string;
  plan?: 'free' | 'starter' | 'professional' | 'enterprise';
  isActive?: boolean;
  lastLogin?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ILead {
  _id?: string;
  userId: string;
  username: string;
  platform: string;
  fullName?: string;
  bio?: string;
  profileUrl?: string;
  followers?: number;
  following?: number;
  engagement?: number;
  status: string;
  controlMode?: 'automated' | 'handoff_requested' | 'human_controlled';
  handoffReason?: string;
  handoffRequestedAt?: Date;
  humanControlStartedAt?: Date;
  automationResumedAt?: Date;
  interestLevel: string;
  score: number;
  tags: string[];
  lastContact?: Date;
  nextFollowUp?: Date;
  notes?: string;
  email?: string;
  phone?: string;
  source?: string;
  currentChannel?: string;
  commercialContextId?: string;
  normalizedIntent?: string;
  normalizedIntents?: string[];
  origin?: {
    platform?: string;
    source?: string;
    externalContentId?: string;
    initialContent?: string;
    occurredAt?: Date;
    publicUrl?: string;
  };

aiAnalysis?: {
  [key: string]: any;
};

messageHistory?: {
  platform: string;
  timestamp: Date;
  content: string;
  type: string;
}[];

  createdAt?: Date;
  updatedAt?: Date;
}

export interface IConversation {
  _id?: string;
  leadId: string;
  userId: string;
  messages: IMessage[];
  status: string;
  aiAnalysis?: string;
  lastMessage?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IMessage {
  _id?: string;
  sender: 'user' | 'lead' | 'ai';
  text: string;
  platform?: string;
  timestamp: Date;
  isRead?: boolean;
  direction?: 'inbound' | 'outbound';
  status?: 'received' | 'proposed' | 'pending' | 'sent' | 'failed';
  externalMessageId?: string;
  relatedMessageId?: string;
  processingError?: string;
}

export interface ITask {
  _id?: string;
  userId: string;
  leadId: string;
  conversationId?: string;
  title: string;
  description: string;
  type: 'follow_up' | 'meeting' | 'call' | 'email' | 'other';
  status: 'pending' | 'completed' | 'cancelled';
  dueDate?: Date;
  priority?: 'low' | 'medium' | 'high';
  metadata?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAutomationFlow {
  _id?: string;
  userId: string;
  name: string;
  description?: string;
  status?: 'draft' | 'active' | 'paused' | 'disabled' | 'error';
  trigger: {
    type: string;
    keyword?: string;
    keywords?: string[];
  };
  actions: IAction[];
  conditions?: ICondition[];
  conditionLogic?: 'AND' | 'OR';
  version?: number;
  lastRunAt?: Date;
  schedule?: {
    frequency: string;
    daysOfWeek?: number[];
  };
  isActive: boolean;
  executionStats?: {
    totalExecutions?: number;
    successfulExecutions?: number;
    failedExecutions?: number;
    lastExecution?: Date;
    nextExecution?: Date;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAction {
  _id?: string;
  type: string;
  message?: string;
  delay?: number;
  config?: Record<string, any>;
  conditions?: ICondition[];
}

export interface ICondition {
  field: string;
  operator: string;
  value: any;
}

export interface IDashboardMetrics {
  totalLeads: number;
  newLeads: number;
  activeConversations: number;
  responseRate: number;
  hotProspects: number;
  conversionsCount: number;
  lastUpdated: Date;
}

export interface IAuthResponse {
  token: string;
  refreshToken?: string;
  user: Partial<IUser>;
}

export interface IPaginationParams {
  page?: number;
  limit?: number;
  skip?: number;
}

export interface IPaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
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

export interface IProfileScrape {
  username: string;
  platform: string;
  profileUrl: string;
  followers: number;
  engagement: number;
  bio: string;
  recentHashtags: string[];
}

export interface IApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}
