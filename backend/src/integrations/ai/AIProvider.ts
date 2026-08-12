export interface AIReplyContext {
  incomingText: string;
  isNewLead: boolean;
  intent: string;
  history: Array<{ sender: 'lead' | 'ai'; text: string }>;
}

export interface AIProvider {
  readonly name: string;
  generateReply(context: AIReplyContext): Promise<string>;
}
