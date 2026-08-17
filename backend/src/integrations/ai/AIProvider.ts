export interface AIReplyContext {
  incomingText: string;
  isNewLead: boolean;
  intent: string;
  platform: 'youtube' | 'whatsapp' | 'instagram' | 'facebook';
  history: Array<{ sender: 'lead' | 'ai'; text: string }>;
  askedTopics?: string[];
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
