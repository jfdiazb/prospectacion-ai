import type { Request, Response } from 'express';
import crypto from 'crypto';
import Meeting from '../models/Meeting';
import Activity from '../models/Activity';
import Task from '../models/Task';

type CalendlyPayload = {
  event?: string;
  payload?: {
    uri?: string;
    email?: string;
    timezone?: string;
    event?: string;
    tracking?: { utm_content?: string | null };
    scheduled_event?: {
      uri?: string;
      start_time?: string;
      location?: { join_url?: string };
    };
  };
};

export class CalendlyController {
  static async receive(req: Request, res: Response): Promise<void> {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
    if (!CalendlyController.isValidSignature(raw, req.header('calendly-webhook-signature'))) {
      res.status(401).json({ success: false, error: 'Firma de Calendly inválida' });
      return;
    }

    let body: CalendlyPayload;
    try { body = JSON.parse(raw.toString('utf8')) as CalendlyPayload; }
    catch { res.status(400).json({ success: false, error: 'Payload inválido' }); return; }

    const payload = body.payload;
    const bookingToken = payload?.tracking?.utm_content?.trim();
    if (!bookingToken) { res.status(200).json({ success: true, ignored: true }); return; }

    const meeting = await Meeting.findOne({ provider: 'calendly', bookingToken });
    if (!meeting) { res.status(200).json({ success: true, ignored: true }); return; }

    if (body.event === 'invitee.canceled') {
      const changed = meeting.status !== 'cancelled';
      meeting.status = 'cancelled';
      await meeting.save();
      await Task.updateMany({ 'metadata.meetingId': meeting._id.toString(), status: 'pending' }, { $set: { status: 'cancelled' } });
      if (changed) await Activity.create({ userId: meeting.userId, leadId: meeting.leadId, conversationId: meeting.conversationId,
        type: 'meeting_requested', description: 'El prospecto canceló la reserva en Calendly', metadata: { meetingId: meeting._id } });
      res.status(200).json({ success: true });
      return;
    }

    if (body.event === 'invitee.created') {
      const changed = meeting.status !== 'scheduled';
      const scheduledEvent = payload?.scheduled_event;
      meeting.status = 'scheduled';
      meeting.attendeeEmail = payload?.email;
      meeting.timezone = payload?.timezone;
      meeting.inviteeUri = payload?.uri;
      meeting.externalId = scheduledEvent?.uri || payload?.event;
      meeting.joinUrl = scheduledEvent?.location?.join_url;
      if (scheduledEvent?.start_time) meeting.scheduledFor = new Date(scheduledEvent.start_time);
      await meeting.save();
      await Task.updateMany({ 'metadata.meetingId': meeting._id.toString(), status: 'pending' }, {
        $set: { title: 'Preparar reunión de descubrimiento', description: 'Reserva confirmada por Calendly.', dueDate: meeting.scheduledFor },
      });
      if (changed) await Activity.create({ userId: meeting.userId, leadId: meeting.leadId, conversationId: meeting.conversationId,
        type: 'meeting_created', description: 'Reunión reservada mediante Calendly', metadata: { meetingId: meeting._id, scheduledFor: meeting.scheduledFor } });
    }

    res.status(200).json({ success: true });
  }

  static isValidSignature(raw: Buffer, header?: string): boolean {
    const secret = process.env.CALENDLY_WEBHOOK_SIGNING_KEY?.trim();
    if (!secret || !header) return false;
    const values = Object.fromEntries(header.split(',').map(part => part.trim().split('=')));
    const timestamp = values.t;
    const supplied = values.v1;
    if (!timestamp || !supplied || !/^\d+$/.test(timestamp) || !/^[a-f\d]{64}$/i.test(supplied)) return false;
    if (Math.abs(Date.now() - Number(timestamp) * 1000) > 5 * 60 * 1000) return false;
    const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${raw.toString('utf8')}`).digest('hex');
    const suppliedBuffer = Buffer.from(supplied, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    return suppliedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(suppliedBuffer, expectedBuffer);
  }
}
