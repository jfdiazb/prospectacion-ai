import mongoose from 'mongoose';
import Launch from '../models/Launch';
import LaunchParticipant from '../models/LaunchParticipant';
import LaunchEvent from '../models/LaunchEvent';
import Meeting from '../models/Meeting';
import { LaunchLifecycleService } from './LaunchLifecycleService';
import { LaunchDomainError } from './LaunchDomainError';
import type { LaunchEvidenceInput } from '../types/launch';

type AttendanceStatus = 'attended' | 'no_show' | 'unknown';
type ImportItem = {
  participantId: string;
  action: 'register' | 'confirm' | 'attended' | 'no_show' | 'attendance_unknown';
  evidence: LaunchEvidenceInput;
  idempotencyKey: string;
  reason?: string;
};

export class LaunchOperationsService {
  private static async participant(userId: string, launchId: string, participantId: string) {
    const participant: any = await LaunchParticipant.findOne({
      _id: participantId,
      launchId,
      userId,
    });
    if (!participant)
      throw new LaunchDomainError(
        'Participante no encontrado en el lanzamiento',
        'PARTICIPANT_NOT_FOUND'
      );
    return participant;
  }
  private static async audit(userId: string, data: any) {
    try {
      return await LaunchEvent.create({ userId, ...data });
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      return LaunchEvent.findOne({ userId, idempotencyKey: data.idempotencyKey });
    }
  }
  private static requireKey(value: string) {
    const key = String(value || '').trim();
    if (!key || key.length > 300)
      throw new LaunchDomainError('Clave de idempotencia inválida', 'INVALID_IDEMPOTENCY_KEY');
    return key;
  }
  private static async record(
    userId: string,
    launchId: string,
    participantId: string,
    dimension: 'registration' | 'confirmation' | 'attendance',
    status: string,
    evidence: LaunchEvidenceInput | undefined,
    idempotencyKeyInput: string,
    actor: string,
    eventType: string,
    reason?: string
  ) {
    const idempotencyKey = this.requireKey(idempotencyKeyInput);
    const participant = await this.participant(userId, launchId, participantId);
    const updated: any = await LaunchLifecycleService.transitionParticipant(userId, {
      participantId: participant._id.toString(),
      dimension,
      status: status as any,
      evidence,
      idempotencyKey: `transition:${idempotencyKey}`,
      actor,
      reason,
    });
    await this.audit(userId, {
      launchId,
      participantId: updated._id,
      leadId: updated.leadId,
      eventType,
      idempotencyKey: `operation:${idempotencyKey}`,
      source: evidence?.source || evidence?.type || 'manual',
      actor,
      evidence: updated[dimension].evidence,
      previousState: { [dimension]: participant[dimension].status },
      currentState: { [dimension]: updated[dimension].status },
      metadata: { reason },
    });
    return updated;
  }

  static async register(
    userId: string,
    launchId: string,
    participantId: string,
    evidence: LaunchEvidenceInput | undefined,
    idempotencyKey: string,
    actor: string
  ) {
    return this.record(
      userId,
      launchId,
      participantId,
      'registration',
      'registered',
      evidence,
      idempotencyKey,
      actor,
      'launch.participant_registered'
    );
  }
  static async confirm(
    userId: string,
    launchId: string,
    participantId: string,
    evidence: LaunchEvidenceInput | undefined,
    idempotencyKey: string,
    actor: string
  ) {
    const [launch, participant]: any[] = await Promise.all([
      Launch.findOne({ _id: launchId, userId }),
      this.participant(userId, launchId, participantId),
    ]);
    if (!launch) throw new LaunchDomainError('Lanzamiento no encontrado', 'LAUNCH_NOT_FOUND');
    const requiresRegistration =
      launch.registrationConfig?.requireRegistrationForConfirmation !== false;
    if (requiresRegistration && participant.registration.status !== 'registered')
      throw new LaunchDomainError(
        'La política del lanzamiento exige registro antes de confirmar',
        'REGISTRATION_REQUIRED'
      );
    return this.record(
      userId,
      launchId,
      participantId,
      'confirmation',
      'confirmed',
      evidence,
      idempotencyKey,
      actor,
      'launch.participant_confirmed',
      requiresRegistration ? undefined : 'policy_allows_confirmation_without_registration'
    );
  }
  static async attendance(
    userId: string,
    launchId: string,
    participantId: string,
    status: AttendanceStatus,
    evidence: LaunchEvidenceInput | undefined,
    idempotencyKey: string,
    actor: string,
    reason?: string
  ) {
    if (!['attended', 'no_show', 'unknown'].includes(status))
      throw new LaunchDomainError('Estado de asistencia inválido', 'INVALID_ATTENDANCE');
    if (status === 'unknown') {
      if (!reason?.trim() || !evidence)
        throw new LaunchDomainError(
          'Volver a unknown requiere evidencia y motivo de corrección',
          'CORRECTION_EVIDENCE_REQUIRED'
        );
      const corrected = await this.record(
        userId,
        launchId,
        participantId,
        'attendance',
        'unknown',
        evidence,
        idempotencyKey,
        actor,
        'launch.participant_attendance_unknown',
        reason
      );
      await this.audit(userId, {
        launchId,
        participantId: corrected._id,
        leadId: corrected.leadId,
        eventType: 'launch.participant_corrected',
        idempotencyKey: `correction:${idempotencyKey}`,
        source: evidence.source || evidence.type,
        actor,
        evidence: corrected.attendance.evidence,
        currentState: { attendance: 'unknown' },
        metadata: { dimension: 'attendance', reason },
      });
      return corrected;
    }
    return this.record(
      userId,
      launchId,
      participantId,
      'attendance',
      status,
      evidence,
      idempotencyKey,
      actor,
      status === 'attended' ? 'launch.participant_attended' : 'launch.participant_not_attended',
      reason
    );
  }
  static async correct(
    userId: string,
    launchId: string,
    participantId: string,
    dimension: 'registration' | 'confirmation',
    evidence: LaunchEvidenceInput | undefined,
    idempotencyKey: string,
    actor: string,
    reason: string
  ) {
    if (!evidence || !reason?.trim())
      throw new LaunchDomainError(
        'La corrección requiere evidencia y motivo',
        'CORRECTION_EVIDENCE_REQUIRED'
      );
    const corrected = await this.record(
      userId,
      launchId,
      participantId,
      dimension,
      'unknown',
      evidence,
      idempotencyKey,
      actor,
      `launch.participant_${dimension}_unknown`,
      reason
    );
    await this.audit(userId, {
      launchId,
      participantId: corrected._id,
      leadId: corrected.leadId,
      eventType: 'launch.participant_corrected',
      idempotencyKey: `correction:${idempotencyKey}`,
      source: evidence.source || evidence.type,
      actor,
      evidence: corrected[dimension].evidence,
      currentState: { [dimension]: 'unknown' },
      metadata: { dimension, reason },
    });
    return corrected;
  }
  static async status(userId: string, launchId: string, participantId: string) {
    const participant: any = await this.participant(userId, launchId, participantId);
    return {
      participantId: participant._id,
      launchId: participant.launchId,
      leadId: participant.leadId,
      registration: participant.registration,
      confirmation: participant.confirmation,
      attendance: participant.attendance,
      meetingId: participant.meetingId,
    };
  }
  static async metrics(userId: string, launchId: string) {
    if (!(await Launch.exists({ _id: launchId, userId })))
      throw new LaunchDomainError('Lanzamiento no encontrado', 'LAUNCH_NOT_FOUND');
    const [row]: any[] = await LaunchParticipant.aggregate([
      {
        $match: {
        userId: new mongoose.Types.ObjectId(userId),
        launchId: new mongoose.Types.ObjectId(launchId),
        },
      },
      {
        $group: {
          _id: null,
          selected: { $sum: 1 },
          conversations: { $sum: { $cond: [{ $ne: ['$conversationId', null] }, 1, 0] } },
          qualified: { $sum: { $cond: [{ $ne: ['$qualifiedAt', null] }, 1, 0] } },
          meetingReady: { $sum: { $cond: [{ $eq: ['$meetingReadiness.ready', true] }, 1, 0] } },
          meetings: { $sum: { $cond: [{ $ne: ['$meetingId', null] }, 1, 0] } },
          converted: { $sum: { $cond: [{ $eq: ['$outcome.status', 'converted'] }, 1, 0] } },
          closedLost: { $sum: { $cond: [{ $eq: ['$outcome.status', 'closed_lost'] }, 1, 0] } },
          registered: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$registration.status', 'registered'] },
                    { $ne: ['$registration.evidence', null] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          confirmed: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$confirmation.status', 'confirmed'] },
                    { $ne: ['$confirmation.evidence', null] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          attended: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$attendance.status', 'attended'] },
                    { $ne: ['$attendance.evidence', null] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          notAttended: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$attendance.status', 'no_show'] },
                    { $ne: ['$attendance.evidence', null] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          unknown: { $sum: { $cond: [{ $eq: ['$attendance.status', 'unknown'] }, 1, 0] } },
        },
      },
    ]);
    return row
      ? {
          selected: row.selected,
          conversations: row.conversations,
          qualified: row.qualified,
          meetingReady: row.meetingReady,
          meetings: row.meetings,
          converted: row.converted,
          closedLost: row.closedLost,
          registered: row.registered,
          confirmed: row.confirmed,
          attended: row.attended,
          notAttended: row.notAttended,
          unknown: row.unknown,
        }
      : { selected: 0, conversations: 0, qualified: 0, meetingReady: 0, meetings: 0, converted: 0, closedLost: 0, registered: 0, confirmed: 0, attended: 0, notAttended: 0, unknown: 0 };
  }
  static async importBatch(userId: string, launchId: string, items: ImportItem[], actor: string) {
    if (!Array.isArray(items) || !items.length || items.length > 100)
      throw new LaunchDomainError(
        'El lote debe contener entre 1 y 100 hechos',
        'INVALID_IMPORT_BATCH'
      );
    const results = [];
    for (const item of items) {
      try {
        let data;
        if (item.action === 'register')
          data = await this.register(
            userId,
            launchId,
            item.participantId,
            item.evidence,
            item.idempotencyKey,
            actor
          );
        else if (item.action === 'confirm')
          data = await this.confirm(
            userId,
            launchId,
            item.participantId,
            item.evidence,
            item.idempotencyKey,
            actor
          );
        else
          data = await this.attendance(
            userId,
            launchId,
            item.participantId,
            item.action === 'attendance_unknown' ? 'unknown' : item.action,
            item.evidence,
            item.idempotencyKey,
            actor,
            item.reason
          );
        results.push({
          idempotencyKey: item.idempotencyKey,
          success: true,
          participantId: data._id,
        });
      } catch (error) {
        results.push({
          idempotencyKey: item.idempotencyKey,
          success: false,
          code: error instanceof LaunchDomainError ? error.code : 'IMPORT_ERROR',
          message: error instanceof Error ? error.message : 'Error de importación',
        });
      }
    }
    return {
      processed: results.length,
      succeeded: results.filter(item => item.success).length,
      failed: results.filter(item => !item.success).length,
      results,
    };
  }
  static async attachMeeting(
    userId: string,
    launchId: string,
    participantId: string,
    meetingId: string,
    actor: string,
    idempotencyKey: string
  ) {
    const participant: any = await this.participant(userId, launchId, participantId);
    const meeting: any = await Meeting.findOne({
      _id: meetingId,
      userId,
      leadId: participant.leadId,
    });
    if (!meeting)
      throw new LaunchDomainError('La reunión no pertenece al participante', 'MEETING_NOT_FOUND');
    await LaunchParticipant.updateOne(
      { _id: participant._id, userId, launchId },
      { $set: { meetingId: meeting._id } }
    );
    await this.audit(userId, {
      launchId,
      participantId,
      leadId: participant.leadId,
      eventType: 'launch.participant_meeting_linked',
      idempotencyKey,
      source: 'manual',
      actor,
      currentState: { meetingId: meeting._id.toString() },
    });
    return this.status(userId, launchId, participantId);
  }
}
