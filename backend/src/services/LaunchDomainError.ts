export class LaunchDomainError extends Error { constructor(message: string, public code: string) { super(message); this.name = 'LaunchDomainError'; } }
