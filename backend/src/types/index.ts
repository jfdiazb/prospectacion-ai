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
  interestLevel: string;
  score: number;
  tags: string[];
  lastContact?: Date;
  nextFollowUp?: Date;
  notes?: string;
  email?: string;
  phone?: string;
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
}

export interface IAutomationFlow {
  _id?: string;
  userId: string;
  name: string;
  description?: string;
  trigger: {
    type: string;
    keyword?: string;
  };
  actions: IAction[];
  schedule?: {
    frequency: string;
    daysOfWeek?: number[];
  };
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAction {
  _id?: string;
  type: string;
  message?: string;
  delay?: number;
  conditions?: ICondition[];
}

export interface ICondition {
  field: string;
  operator: string;
  value: string | number;
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
