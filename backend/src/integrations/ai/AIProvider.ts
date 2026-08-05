export interface AIReplyContext {
  incomingText: string;
  isNewLead: boolean;
  intent: string;
}

export interface AIProvider {
  readonly name: string;
  generateReply(context: AIReplyContext): Promise<string>;
}
