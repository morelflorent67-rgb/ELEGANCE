// Chronomètre des diagnostics de vitesse (lot 8) : des durées seulement, jamais de données.

export interface Timing {
  /** Durées mesurées, en millisecondes, arrondies. */
  runs: number[];
  min: number;
  median: number;
  max: number;
}

export function summarize(durations: number[]): Timing {
  const runs = durations.map((d) => Math.round(d));
  const sorted = [...runs].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length === 0
      ? 0
      : sorted.length % 2
        ? sorted[middle]
        : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
  return { runs, min: sorted[0] ?? 0, median, max: sorted.at(-1) ?? 0 };
}

/** Une opération qui dépasse ce délai est abandonnée : sa durée est alors le délai lui-même. */
export const STEP_TIMEOUT_MS = 8_000;

/** Durée d'une opération, en millisecondes ; une erreur ou un dépassement du délai est mesuré lui aussi. */
export async function timeOnce(
  task: () => Promise<unknown>,
  timeoutMs: number = STEP_TIMEOUT_MS,
): Promise<number> {
  return (await measure(task, timeoutMs)).ms;
}

async function measure(
  task: () => Promise<unknown>,
  timeoutMs: number,
): Promise<{ ms: number; timedOut: boolean }> {
  const start = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  try {
    await Promise.race([
      task(),
      new Promise((resolve) => {
        timer = setTimeout(() => {
          timedOut = true;
          resolve(null);
        }, timeoutMs);
      }),
    ]);
  } catch {
    // La durée compte, pas le résultat : un échec reste une mesure.
  } finally {
    clearTimeout(timer);
  }
  return { ms: performance.now() - start, timedOut };
}

/** `times` exécutions l'une après l'autre ; on s'arrête au premier dépassement du délai. */
export async function timeRuns(
  times: number,
  task: () => Promise<unknown>,
  timeoutMs: number = STEP_TIMEOUT_MS,
): Promise<Timing> {
  const durations: number[] = [];
  for (let i = 0; i < times; i++) {
    const { ms, timedOut } = await measure(task, timeoutMs);
    durations.push(ms);
    if (timedOut) break;
  }
  return summarize(durations);
}
