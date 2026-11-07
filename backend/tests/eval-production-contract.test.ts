import { YouTubeIngestionService } from '../src/services/YouTubeIngestionService';
import { MessagingService } from '../src/services/MessagingService';

describe('eval production contracts', () => {
  test.each([
    ['INFO', 'info_keyword'],
    ['Quiero conocer más sobre esta oportunidad y cómo funciona', 'explicit_opportunity_interest'],
  ])('uses the production eligibility decision for %s', (text, reason) => {
    expect(YouTubeIngestionService.evaluateEligibility({ text })).toEqual({ eligible: true, reason });
  });

  test('keeps provider acceptance separate from readback confirmation', () => {
    expect(MessagingService.classifyDeliveryOutcome({ accepted: true })).toBe('sent');
    expect(MessagingService.classifyDeliveryOutcome({ observedPublished: true, moderationStatus: 'published' })).toBe('confirmed');
    expect(MessagingService.classifyDeliveryOutcome({ accepted: true })).not.toBe('confirmed');
  });

  test('creates stable privacy-safe YouTube correlation ids', () => {
    const first = YouTubeIngestionService.correlationId('owner-1', 'comment-1');
    expect(first).toBe(YouTubeIngestionService.correlationId('owner-1', 'comment-1'));
    expect(first).toMatch(/^yt_[a-f0-9]{24}$/);
    expect(first).not.toContain('comment-1');
  });
});
