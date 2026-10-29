import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Conversation from '../src/models/Conversation';
import Lead from '../src/models/Lead';
import Meeting from '../src/models/Meeting';
import OutboundMessage from '../src/models/OutboundMessage';
import InboundEvent from '../src/models/InboundEvent';
import { AlmaService } from '../src/services/AlmaService';
import { ConversationMemoryService } from '../src/services/ConversationMemoryService';

jest.setTimeout(120000);

describe('regresión de continuidad comercial y reunión', () => {
  let mongo: MongoMemoryServer;
  const originalEnv = process.env;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri('alma-meeting-continuity'));
  });

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      AI_MODE: 'mock',
      SCHEDULING_MODE: 'calendly',
      CALENDLY_BOOKING_URL: 'https://calendly.com/alma/discovery',
      WHATSAPP_MESSAGING_MODE: 'mock',
      WHATSAPP_PHONE_NUMBER_ID: 'test-phone-number-id',
      REAL_OUTBOUND_ENABLED: 'false',
    };
    await Promise.all(Object.values(mongoose.connection.collections).map(collection => collection.deleteMany({})));
  });

  afterAll(async () => {
    process.env = originalEnv;
    await mongoose.disconnect();
    await mongo.stop();
  });

  test('responde el estado real, conserva modalidad y horario y sobrevive a una reconexión', async () => {
    const userId = new mongoose.Types.ObjectId();
    const lead: any = await Lead.create({ userId, username: 'prospecto-incidente', phone: '573000000000', platform: 'whatsapp' });
    const conversation: any = await Conversation.create({
      userId,
      leadId: lead._id,
      controlMode: 'automated',
      messages: [
        {
          sender: 'ai',
          text: 'Perfect, te agendo para mañana a las 7 p.m. ¿Prefieres que sea presencial o por videollamada?',
          platform: 'whatsapp',
        },
        {
          sender: 'lead',
          text: 'Prefiero por videollamada. ¿Me confirmas la reunión y me envías el enlace?',
          platform: 'whatsapp',
          direction: 'inbound',
          externalMessageId: 'wamid.meeting-continuity-regression',
        },
      ],
    });
    await InboundEvent.create({
      userId,
      externalEventId: 'wamid.meeting-continuity-regression',
      channel: 'whatsapp',
      eventType: 'message',
      senderId: '573000000000',
      accountId: 'test-phone-number-id',
      eventTimestamp: new Date(),
      conversationRecordedAt: new Date(),
      processingState: 'completed',
    });

    const response = await AlmaService.processMessage({
      userId: userId.toString(),
      leadId: lead._id.toString(),
      conversationId: conversation._id.toString(),
      text: 'Prefiero por videollamada. ¿Me confirmas la reunión y me envías el enlace?',
      isNewLead: false,
      platform: 'whatsapp',
      sourceEventId: 'wamid.meeting-continuity-regression',
      recipient: { type: 'whatsapp_user', phoneNumber: '573000000000' },
    });

    expect(response).toMatch(/por videollamada/i);
    expect(response).toMatch(/todavía no está confirmada/i);
    expect(response).toMatch(/preferencia.+19:00.+verificarse/i);
    expect(response).toContain('https://calendly.com/alma/discovery');
    expect(response).not.toMatch(/ya podemos revisar el siguiente paso|recibir la agenda/i);
    expect(response).not.toMatch(/^perfect\b/i);

    const meeting: any = await Meeting.findOne({ conversationId: conversation._id }).lean();
    expect(meeting).toMatchObject({
      status: 'pending_booking',
      provider: 'calendly',
      modality: 'video',
      requestedTime: '19:00',
    });
    expect(meeting.requestedDate).toBeTruthy();
    expect(await OutboundMessage.countDocuments({
      sourceEventId: 'wamid.meeting-continuity-regression',
      deliveryStatus: 'simulated',
    })).toBe(1);

    await mongoose.disconnect();
    await mongoose.connect(mongo.getUri('alma-meeting-continuity'));
    const memory: any = await ConversationMemoryService.get(userId.toString(), conversation._id.toString());
    expect(memory).toMatchObject({
      bookingStatus: 'pending_booking',
      bookingProvider: 'calendly',
      meetingModality: 'video',
      requestedMeetingTime: '19:00',
    });
  });

  test('entrega la agenda autorizada cuando el prospecto acepta la oferta real de WhatsApp', async () => {
    const userId = new mongoose.Types.ObjectId();
    const lead: any = await Lead.create({ userId, username: 'prospecto-agenda-real', phone: '573000000001', platform: 'whatsapp' });
    const offer = '¿Te gustaría agendar una breve llamada para explicarte paso a paso el proceso de inicio y la capacitación disponible?';
    const acceptance = 'Sí, me interesa. Envíame el enlace para agendar la llamada.';
    const conversation: any = await Conversation.create({
      userId,
      leadId: lead._id,
      controlMode: 'automated',
      commercialMemory: {
        interests: ['business_opportunity'],
        needs: ['declared_need'],
        meetingEvidence: ['declared_interest', 'declared_need_or_goal', 'prospect_context', 'discovery_conversation'],
        commercialState: 'qualified',
        meetingInterest: 'offered',
        updatedThroughEventId: 'wamid.meeting-offer',
        updatedAt: new Date(),
        version: 1,
      },
      messages: [
        { sender: 'ai', text: offer, platform: 'whatsapp', direction: 'outbound', status: 'sent' },
        { sender: 'lead', text: acceptance, platform: 'whatsapp', direction: 'inbound', externalMessageId: 'wamid.agenda-acceptance' },
      ],
    });
    await InboundEvent.create({
      userId,
      externalEventId: 'wamid.agenda-acceptance',
      channel: 'whatsapp',
      eventType: 'message',
      senderId: '573000000001',
      accountId: 'test-phone-number-id',
      eventTimestamp: new Date(),
      conversationRecordedAt: new Date(),
      processingState: 'completed',
    });

    const response = await AlmaService.processMessage({
      userId: userId.toString(),
      leadId: lead._id.toString(),
      conversationId: conversation._id.toString(),
      text: acceptance,
      isNewLead: false,
      platform: 'whatsapp',
      sourceEventId: 'wamid.agenda-acceptance',
      recipient: { type: 'whatsapp_user', phoneNumber: '573000000001' },
    });

    expect(response).toContain('https://calendly.com/alma/discovery');
    expect(response).toMatch(/todavía no está confirmada/i);
    expect(response).not.toMatch(/No tengo información autorizada suficiente|qué resultado concreto/i);
    const meeting: any = await Meeting.findOne({ conversationId: conversation._id }).lean();
    expect(meeting).toMatchObject({ provider: 'calendly', status: 'pending_booking' });
    expect(meeting.bookingUrl).toContain('utm_source=whatsapp');
    const memory: any = await ConversationMemoryService.get(userId.toString(), conversation._id.toString());
    expect(memory).toMatchObject({ meetingInterest: 'accepted', bookingStatus: 'pending_booking' });
  });

  test('registra la aceptación sin reiniciar descubrimiento cuando la agenda no está configurada', async () => {
    delete process.env.CALENDLY_BOOKING_URL;
    const userId = new mongoose.Types.ObjectId();
    const lead: any = await Lead.create({ userId, username: 'prospecto-agenda-pendiente', phone: '573000000002', platform: 'whatsapp' });
    const acceptance = 'Sí, me interesa. Envíame el enlace para agendar la llamada.';
    const conversation: any = await Conversation.create({
      userId,
      leadId: lead._id,
      controlMode: 'automated',
      commercialMemory: { meetingInterest: 'offered', commercialState: 'qualified', version: 1 },
      messages: [
        { sender: 'ai', text: '¿Te gustaría agendar una breve llamada para explicarte paso a paso el proceso de inicio y la capacitación disponible?', platform: 'whatsapp' },
        { sender: 'lead', text: acceptance, platform: 'whatsapp' },
      ],
    });

    const response = await AlmaService.processMessage({
      userId: userId.toString(), leadId: lead._id.toString(), conversationId: conversation._id.toString(),
      text: acceptance, isNewLead: false, platform: 'whatsapp', sourceEventId: 'wamid.agenda-unconfigured',
      recipient: { type: 'whatsapp_user', phoneNumber: '573000000002' },
    });

    expect(response).toMatch(/acepté tu solicitud.+agenda no está disponible.+no necesitas repetir/i);
    expect(response).not.toMatch(/qué resultado concreto/i);
    expect(await Meeting.findOne({ conversationId: conversation._id }).lean()).toMatchObject({
      provider: 'calendly', status: 'pending_configuration',
    });
  });
});
