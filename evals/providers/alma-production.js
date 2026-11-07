require('../../backend/node_modules/ts-node/register/transpile-only');

const { ConversationalSafetyService } = require('../../backend/src/services/ConversationalSafetyService');
const { MessagingService } = require('../../backend/src/services/MessagingService');
const { YouTubeIngestionService } = require('../../backend/src/services/YouTubeIngestionService');
const { CommercialConversationPolicy } = require('../../backend/src/services/CommercialConversationPolicy');

const bool = value => value === true || value === 'true';

class AlmaProductionProvider {
  id() {
    return 'alma-production-services';
  }

  async callApi(_prompt, context) {
    const vars = context.vars || {};
    let result;
    if (vars.mode === 'eligibility') {
      result = YouTubeIngestionService.evaluateEligibility({
        text: String(vars.text || ''),
        isOwnComment: bool(vars.isOwnComment),
        hasExistingLead: bool(vars.hasExistingLead),
        hasAutomationReply: bool(vars.hasAutomationReply),
        hasLaunchMapping: bool(vars.hasLaunchMapping),
      });
    } else if (vars.mode === 'delivery') {
      result = {
        status: MessagingService.classifyDeliveryOutcome({
          simulated: bool(vars.simulated),
          accepted: bool(vars.accepted),
          observedPublished: bool(vars.observedPublished),
          moderationStatus: vars.moderationStatus,
          errorCode: vars.errorCode,
        }),
      };
    } else if (vars.mode === 'memory') {
      result = {
        firstContactDiscovery: ConversationalSafetyService.isFirstContactDiscovery({
          isNewLead: bool(vars.isNewLead),
          currentMessage: String(vars.text || ''),
          hasPriorConversation: bool(vars.hasPriorConversation),
          commercialMemory: bool(vars.hasCommercialMemory) ? { interests: ['producto'] } : null,
        }),
      };
    } else if (vars.mode === 'commercial') {
      result = {
        requiresAuthorizedBrief: CommercialConversationPolicy.requiresAuthorizedBrief(String(vars.text || '')),
        response: CommercialConversationPolicy.authorizedBrief({
          brandName: 'Amway',
          businessType: 'venta directa y oportunidad de negocio independiente',
          commercialLines: ['oportunidad de negocio', 'consumo de productos'],
          productFamilies: ['Nutrilite'],
          allowedInformation: ['Nombre de la marca activa', 'Familia Nutrilite como parte de la configuración activa'],
        }),
      };
    } else {
      result = ConversationalSafetyService.validate({
        text: String(vars.text || ''),
        readiness: { ready: false, reason: vars.readinessReason || 'insufficient_discovery' },
        meeting: bool(vars.confirmedMeeting)
          ? { status: 'confirmed', scheduledFor: new Date('2027-01-01T15:00:00Z') }
          : null,
        commercialInformationAuthorized: bool(vars.commercialInformationAuthorized),
        asksCommercialDetails: bool(vars.asksCommercialDetails),
      });
    }
    return { output: JSON.stringify(result) };
  }
}

module.exports = AlmaProductionProvider;
