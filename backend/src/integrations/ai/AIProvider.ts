export interface AIReplyContext {
  userId?: string;
  leadId?: string;
  conversationId?: string;
  sourceEventId?: string;
  incomingText: string;
  isNewLead: boolean;
  intent: string;
  platform: 'youtube' | 'whatsapp' | 'instagram' | 'facebook' | 'tiktok';
  history: Array<{ sender: 'lead' | 'ai'; text: string }>;
  askedTopics?: string[];
  memory?: {
    interests?: string[]; needs?: string[]; objections?: string[]; askedTopics?: string[];
    commercialState?: string; meetingInterest?: string; bookingStatus?: string; bookingProvider?: string;
  };
  normalizedIntent?: string;
  purpose?: 'conversation' | 'follow_up' | 'reactivation' | 'meeting_reminder' | 'meeting_followup';
  reactivationReason?: string;
  commercialContext?: {
    brandName: string;
    businessType?: string;
    commercialLines?: string[];
    allowedInformation?: string[];
    informationPendingConfirmation?: string[];
    communicationRules?: string[];
    restrictions?: string[];
    disclaimers?: string[];
  };
}

export type AIProviderUsed = 'groq' | 'gemini' | 'mock';

export interface AIReplyResult {
  text: string;
  aiProviderUsed: AIProviderUsed;
}

export interface AIProvider {
  readonly name: string;
  generateReply(context: AIReplyContext): Promise<AIReplyResult>;
}
