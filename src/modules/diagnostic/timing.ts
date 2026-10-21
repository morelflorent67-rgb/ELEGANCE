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

/** Durée d'une opération, en millisecondes ; une erreur est mesurée elle aussi. */
export async function timeOnce(task: () => Promise<unknown>): Promise<number> {
  const start = performance.now();
  try {
    await task();
  } catch {
    // La durée compte, pas le résultat : un échec reste une mesure.
  }
  return performance.now() - start;
}

/** `times` exécutions l'une après l'autre. */
export async function timeRuns(times: number, task: () => Promise<unknown>): Promise<Timing> {
  const durations: number[] = [];
  for (let i = 0; i < times; i++) durations.push(await timeOnce(task));
  return summarize(durations);
}
