export interface AIReplyContext {
  incomingText: string;
  isNewLead: boolean;
  intent: string;
  platform: 'youtube' | 'whatsapp' | 'instagram' | 'facebook';
  history: Array<{ sender: 'lead' | 'ai'; text: string }>;
  askedTopics?: string[];
  normalizedIntent?: string;
  purpose?: 'conversation' | 'follow_up' | 'reactivation' | 'meeting_reminder' | 'meeting_followup';
  reactivationReason?: string;
  commercialContext?: {
    brandName: string; businessType?: string; commercialLines?: string[]; allowedInformation?: string[];
    informationPendingConfirmation?: string[]; communicationRules?: string[]; restrictions?: string[]; disclaimers?: string[];
  };
}

export type AIProviderUsed = 'gemini' | 'mock';

export interface AIReplyResult {
  text: string;
  aiProviderUsed: AIProviderUsed;
}

export interface AIProvider {
  readonly name: string;
  generateReply(context: AIReplyContext): Promise<AIReplyResult>;
}
