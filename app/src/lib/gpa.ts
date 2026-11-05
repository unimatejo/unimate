/**
 * GPA maths, kept pure so it can be tested on its own.
 * A planned course (grade null) and a pass/fail one ("P") never count toward the GPA; 0-hour courses neither.
 * Results are rounded to 2 decimals, like a Jordanian transcript.
 */
export type ScaleRow = { g: string; p: number };
type GradeRow = { credit_hours: number; grade: string | null; target_grade?: string | null };
export type Base = { hours: number; gpa: number };

export const DEFAULT_SCALE: ScaleRow[] = [
  { g: 'A', p: 4 }, { g: 'A-', p: 3.75 }, { g: 'B+', p: 3.5 }, { g: 'B', p: 3 }, { g: 'B-', p: 2.75 },
  { g: 'C+', p: 2.5 }, { g: 'C', p: 2 }, { g: 'C-', p: 1.75 }, { g: 'D+', p: 1.5 }, { g: 'D', p: 1.25 },
  { g: 'D-', p: 1 }, { g: 'F', p: 0 },
];

/** Academic standing (typical Jordanian bands), highest first. */
const STANDING: { min: number; key: 'excellent' | 'very_good' | 'good' | 'pass' | 'warning' }[] = [
  { min: 3.65, key: 'excellent' },
  { min: 3.0, key: 'very_good' },
  { min: 2.5, key: 'good' },
  { min: 2.0, key: 'pass' },
  { min: 0, key: 'warning' },
];

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const pointsOf = (g: string | null | undefined, scale: ScaleRow[]) => (g && g !== 'P' ? scale.find((s) => s.g === g)?.p ?? null : null);

/** Points and hours that count, from a list of rows. `useTarget`: planned rows use their target grade. */
export function totals(rows: GradeRow[], scale: ScaleRow[], useTarget = false) {
  let points = 0, hours = 0;
  for (const r of rows) {
    const h = Number(r.credit_hours) || 0;
    if (h <= 0) continue;
    const p = pointsOf(r.grade ?? (useTarget ? r.target_grade ?? null : null), scale);
    if (p == null) continue;
    points += p * h; hours += h;
  }
  return { points, hours };
}

export function semesterGpa(rows: GradeRow[], scale: ScaleRow[], useTarget = false): number | null {
  const { points, hours } = totals(rows, scale, useTarget);
  return hours ? round2(points / hours) : null;
}

/** Cumulative GPA including what the student had before the app (`base`). */
export function cumulative(base: Base | null, rows: GradeRow[], scale: ScaleRow[], useTarget = false) {
  const t = totals(rows, scale, useTarget);
  const bh = Math.max(0, Number(base?.hours) || 0);
  const points = t.points + bh * (Number(base?.gpa) || 0);
  const hours = t.hours + bh;
  return { gpa: hours ? round2(points / hours) : null, points, hours };
}

export function whatIf(base: Base | null, rows: GradeRow[], scale: ScaleRow[]) {
  return cumulative(base, rows, scale, true);
}

/** Average points needed over `remainingHours` to reach `target`. Infinity when there are no hours left to change it. */
export function neededAverage(target: number, currentPoints: number, currentHours: number, remainingHours: number): number {
  if (remainingHours <= 0) return currentHours && currentPoints / currentHours >= target ? 0 : Infinity;
  return (target * (currentHours + remainingHours) - currentPoints) / remainingHours;
}

/** Lowest letter whose points reach `points` (the grade you'd need on average). null if above the top. */
export function gradeFor(points: number, scale: ScaleRow[]): string | null {
  const asc = [...scale].sort((a, b) => a.p - b.p);
  return asc.find((s) => s.p >= points - 1e-9)?.g ?? null;
}

export function standingOf(gpa: number | null) {
  if (gpa == null) return null;
  return STANDING.find((s) => gpa >= s.min)?.key ?? 'warning';
}
