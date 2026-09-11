import Meeting from '../models/Meeting';

export type AvailabilityConfig = { days: number[]; startTime: string; endTime: string; durationMinutes: number; timezone: string; bufferBeforeMinutes: number; bufferAfterMinutes: number; horizonDays: number; maxOptions: number };

export class MeetingAvailabilityService {
  static config(): AvailabilityConfig {
    const days = (process.env.MEETING_AVAILABLE_DAYS || '1,2,3,4,5').split(',').map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6);
    return { days: days.length ? days : [1, 2, 3, 4, 5], startTime: process.env.MEETING_START_TIME || '19:30', endTime: process.env.MEETING_END_TIME || '20:30', durationMinutes: Math.max(15, Number(process.env.MEETING_DURATION_MINUTES || 30)), timezone: process.env.MEETING_TIMEZONE || 'America/Bogota', bufferBeforeMinutes: Math.max(0, Number(process.env.MEETING_BUFFER_BEFORE_MINUTES || 0)), bufferAfterMinutes: Math.max(0, Number(process.env.MEETING_BUFFER_AFTER_MINUTES || 0)), horizonDays: Math.min(90, Math.max(1, Number(process.env.MEETING_HORIZON_DAYS || 14))), maxOptions: Math.min(10, Math.max(1, Number(process.env.MEETING_MAX_OPTIONS || 3))) };
  }

  static toUtc(date: string, time: string, timezone: string): Date | null {
    try { const [year, month, day] = date.split('-').map(Number); const [hour, minute] = time.split(':').map(Number); const check = new Date(Date.UTC(year, month - 1, day)); if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null; let utc = Date.UTC(year, month - 1, day, hour, minute); const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); for (let i = 0; i < 2; i++) { const parts = Object.fromEntries(formatter.formatToParts(new Date(utc)).map(part => [part.type, part.value])); utc += Date.UTC(year, month - 1, day, hour, minute) - Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute)); } const result = new Date(utc); return Number.isNaN(result.getTime()) ? null : result; } catch { return null; }
  }

  static localParts(value: Date, timezone: string) { const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(value).map(part => [part.type, part.value])); return parts; }
  static format(value: Date, timezone: string) { const parts = this.localParts(value, timezone); return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} (${timezone})`; }

  static async options(userId: string, timezone?: string, from = new Date()): Promise<Date[]> {
    const config = this.config(); const zone = timezone || config.timezone; const options: Date[] = [];
    for (let offset = 0; offset <= config.horizonDays && options.length < config.maxOptions; offset++) {
      const cursor = new Date(from.getTime() + offset * 86400000); const local = this.localParts(cursor, zone); const date = `${local.year}-${local.month}-${local.day}`;
      const noon = this.toUtc(date, '12:00', zone); if (!noon || !config.days.includes(Number(this.localParts(noon, zone).weekday === 'Sun' ? 0 : ['Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(this.localParts(noon, zone).weekday) + 1))) continue;
      const [startHour, startMinute] = config.startTime.split(':').map(Number); const [endHour, endMinute] = config.endTime.split(':').map(Number); const start = startHour * 60 + startMinute; const end = endHour * 60 + endMinute;
      for (let minute = start; minute + config.durationMinutes <= end && options.length < config.maxOptions; minute += config.durationMinutes + config.bufferAfterMinutes) {
        const slot = this.toUtc(date, `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`, zone); if (!slot || slot <= from) continue;
        if (await this.isAvailable(userId, slot, config.durationMinutes, config.bufferBeforeMinutes, config.bufferAfterMinutes)) options.push(slot);
      }
    }
    return options;
  }

  static async isAvailable(userId: string, slot: Date, durationMinutes: number, before = 0, after = 0, excludeMeetingId?: string): Promise<boolean> {
    const start = new Date(slot.getTime() - before * 60000); const end = new Date(slot.getTime() + (durationMinutes + after) * 60000);
    const query: any = { userId, status: { $in: ['requested', 'confirmed', 'scheduled', 'pending_configuration'] }, $or: [{ scheduledAt: { $lt: end, $gte: start } }, { scheduledFor: { $lt: end, $gte: start } }] }; if (excludeMeetingId) query._id = { $ne: excludeMeetingId };
    return !await Meeting.exists(query);
  }
}
