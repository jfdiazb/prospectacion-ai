import Task from '../models/Task';
import type { ITask } from '../types/index';

export class TaskService {
  static async createTask(userId: string, taskData: Partial<ITask>): Promise<ITask> {
    const task = await Task.create({ ...taskData, userId });
    return task;
  }

  static async getUserTasks(userId: string): Promise<ITask[]> {
    return await Task.find({ userId }).sort({ dueDate: 1, createdAt: -1 });
  }

  static async getTaskById(taskId: string, userId: string): Promise<ITask | null> {
    return await Task.findOne({ _id: taskId, userId });
  }

  static async updateTask(taskId: string, userId: string, updateData: Partial<ITask>): Promise<ITask | null> {
    return await Task.findOneAndUpdate({ _id: taskId, userId }, updateData, { new: true });
  }

  static async deleteTask(taskId: string, userId: string): Promise<boolean> {
    const result = await Task.deleteOne({ _id: taskId, userId });
    return result.deletedCount > 0;
  }
}
