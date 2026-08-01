export type MaintenanceTask = Readonly<{
  name: string;
  run: () => Promise<unknown>;
}>;

export type MaintenanceLogger = Readonly<{
  info: (context: Readonly<Record<string, unknown>>, message: string) => void;
  error: (context: Readonly<Record<string, unknown>>, message: string) => void;
}>;

export type MaintenanceRunSummary = Readonly<{
  startedAt: string;
  completedAt: string;
  succeeded: readonly string[];
  failed: readonly string[];
}>;

export type MaintenanceRunner = Readonly<{
  start: () => void;
  stop: () => void;
  runOnce: () => Promise<MaintenanceRunSummary>;
}>;

export function createMaintenanceRunner(
  options: Readonly<{
    tasks: readonly MaintenanceTask[];
    intervalMs: number;
    logger: MaintenanceLogger;
    now?: () => Date;
  }>,
): MaintenanceRunner {
  if (!Number.isSafeInteger(options.intervalMs) || options.intervalMs < 1_000) {
    throw new Error("Maintenance interval must be an integer of at least one second.");
  }
  if (options.tasks.length === 0) {
    throw new Error("At least one maintenance task is required.");
  }
  if (new Set(options.tasks.map((task) => task.name)).size !== options.tasks.length) {
    throw new Error("Maintenance task names must be unique.");
  }

  const now = options.now ?? (() => new Date());
  let timer: NodeJS.Timeout | null = null;
  let activeRun: Promise<MaintenanceRunSummary> | null = null;

  const execute = async (): Promise<MaintenanceRunSummary> => {
    const startedAt = now();
    const succeeded: string[] = [];
    const failed: string[] = [];

    for (const task of options.tasks) {
      try {
        const result = await task.run();
        succeeded.push(task.name);
        options.logger.info({ task: task.name, result }, "SkillUp maintenance task completed");
      } catch (error) {
        failed.push(task.name);
        options.logger.error({ task: task.name, error }, "SkillUp maintenance task failed");
      }
    }

    const completedAt = now();
    return {
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      succeeded,
      failed,
    };
  };

  const runOnce = (): Promise<MaintenanceRunSummary> => {
    if (activeRun) return activeRun;
    activeRun = execute().finally(() => {
      activeRun = null;
    });
    return activeRun;
  };

  return {
    start: () => {
      if (timer) return;
      void runOnce();
      timer = setInterval(() => void runOnce(), options.intervalMs);
      timer.unref();
    },
    stop: () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    },
    runOnce,
  };
}
