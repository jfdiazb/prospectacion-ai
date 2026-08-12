import Task from '../src/models/Task';
import Meeting from '../src/models/Meeting';
import { TaskService } from '../src/services/TaskService';

describe('TaskService meeting reconciliation', () => {
  afterEach(() => jest.restoreAllMocks());

  test('completes elapsed scheduled meetings and cancels obsolete drafts', async () => {
    jest.spyOn(Task, 'find').mockReturnValue({
      select: () => ({ lean: async () => [
        { _id: 'task-complete', dueDate: new Date('2026-08-09T15:00:00.000Z'), metadata: { meetingId: 'meeting-scheduled' } },
        { _id: 'task-cancel', dueDate: new Date('2026-08-09T15:00:00.000Z'), metadata: { meetingId: 'meeting-draft' } },
      ] }),
    } as any);
    jest.spyOn(Meeting, 'find').mockReturnValue({
      select: () => ({ lean: async () => [
        { _id: { toString: () => 'meeting-scheduled' }, status: 'scheduled', scheduledFor: new Date('2026-08-09T15:00:00.000Z') },
        { _id: { toString: () => 'meeting-draft' }, status: 'pending_configuration' },
      ] }),
    } as any);
    const update = jest.spyOn(Task, 'updateMany').mockResolvedValue({ acknowledged: true } as any);

    await TaskService.reconcileMeetingTasks('owner-1', new Date('2026-08-11T15:00:00.000Z'));

    expect(update).toHaveBeenCalledWith({ _id: { $in: ['task-complete'] } }, { $set: { status: 'completed' } });
    expect(update).toHaveBeenCalledWith({ _id: { $in: ['task-cancel'] } }, { $set: { status: 'cancelled' } });
  });
});
