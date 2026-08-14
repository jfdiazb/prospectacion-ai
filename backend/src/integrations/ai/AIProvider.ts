export interface AIReplyContext {
  incomingText: string;
  isNewLead: boolean;
  intent: string;
  platform: 'youtube' | 'whatsapp' | 'instagram' | 'facebook';
  history: Array<{ sender: 'lead' | 'ai'; text: string }>;
}

export interface AIProvider {
  readonly name: string;
  generateReply(context: AIReplyContext): Promise<string>;
}
