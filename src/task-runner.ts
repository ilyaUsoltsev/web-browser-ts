export type Task = () => void;

export class TaskRunner {
  private tasks: Task[] = [];

  get hasTasks(): boolean {
    return this.tasks.length > 0;
  }

  scheduleTask(task: Task): void {
    this.tasks.push(task);
  }

  run(): void {
    this.tasks.shift()?.();
  }

  clear(): void {
    this.tasks.length = 0;
  }
}
