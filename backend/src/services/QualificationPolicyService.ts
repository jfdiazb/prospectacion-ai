export type LeadTemperature = 'cold' | 'warm' | 'hot';

export class QualificationPolicyService {
  static readonly version = 'conversation-qualification-v2';
  static warmThreshold(): number { return Math.max(1, Math.min(99, Number(process.env.QUALIFICATION_WARM_SCORE || 50))); }
  static hotThreshold(): number { return Math.max(this.warmThreshold() + 1, Math.min(100, Number(process.env.QUALIFICATION_HOT_SCORE || 80))); }
  static interestedThreshold(): number { return Math.max(this.warmThreshold(), Math.min(100, Number(process.env.QUALIFICATION_INTERESTED_SCORE || 70))); }
  static downgradeMargin(): number { return Math.max(0, Math.min(30, Number(process.env.QUALIFICATION_DOWNGRADE_MARGIN || 10))); }
  static maxIntentHistory(): number { return Math.max(3, Math.min(30, Number(process.env.QUALIFICATION_INTENT_HISTORY_LIMIT || 12))); }

  static temperature(score: number, previous?: LeadTemperature, terminal = false): LeadTemperature {
    if (terminal) return 'cold';
    const hot = this.hotThreshold(); const warm = this.warmThreshold(); const margin = this.downgradeMargin();
    if (previous === 'hot' && score >= hot - margin) return 'hot';
    if (previous === 'warm' && score >= warm - margin && score < hot) return 'warm';
    return score >= hot ? 'hot' : score >= warm ? 'warm' : 'cold';
  }

  static status(score: number, intent: string, meetingIntent: string, previous?: string): string {
    if (intent === 'rejection') return 'rejected';
    if (previous === 'registered') return 'registered';
    if (meetingIntent === 'high') return 'hot_prospect';
    if (previous === 'presentation_sent') return 'presentation_sent';
    if (score >= this.interestedThreshold()) return 'interested';
    if (score >= this.warmThreshold()) return 'follow_up';
    return 'conversation_started';
  }

  static reasons(evaluation: any, previous: any): string[] {
    const reasons = new Set<string>();
    const normalizedIntent = evaluation.normalizedIntent;
    const intentReasons: Record<string, string> = {
      additional_income_interest: 'additional_income_interest', business_opportunity: 'business_interest', product_interest: 'product_interest',
      product_sales_interest: 'product_sales_interest', business_and_product_interest: 'business_and_product_interest', meeting: 'explicit_meeting_intent', rejection: 'rejection_or_opt_out',
    };
    if (intentReasons[normalizedIntent]) reasons.add(intentReasons[normalizedIntent]);
    if (evaluation.signals?.meetingIntent === 'high') reasons.add('explicit_meeting_intent');
    if (evaluation.signals?.rejectionReason) reasons.add(String(evaluation.signals.rejectionReason));
    if (evaluation.signals?.need >= 70) reasons.add('declared_need');
    if (evaluation.signals?.commercialExperience >= 70) reasons.add('commercial_experience');
    if (evaluation.signals?.nutritionAffinity >= 70) reasons.add('nutrition_affinity');
    if (evaluation.signals?.entrepreneurshipOpenness >= 70) reasons.add('entrepreneurship_openness');
    if (previous && evaluation.score < Number(previous.score || 0)) reasons.add('interest_score_decreased');
    if (!reasons.size) reasons.add(previous ? 'new_conversational_information' : 'initial_conversational_evaluation');
    return [...reasons];
  }
}
