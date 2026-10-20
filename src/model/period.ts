import type { Interval, Workspace } from '../engine/types'
import { addDays, startOfDay, startOfWeek } from './time'

// A workspace can be limited to a period of whole days. Everything outside it is kept but hidden,
// and planning and totals only consider what lies inside.

/** The locale week containing t, the default period of a new workspace. */
export const weekAround = (t: number): Interval => {
  const start = startOfWeek(t)
  return { start, end: addDays(start, 7) }
}

export const overlapsPeriod = (workspace: Workspace, x: Interval) => !workspace.period || (x.start < workspace.period.end && x.end > workspace.period.start)

/** The day of t, moved into the period. */
export function clampDay(workspace: Workspace, t: number) {
  const day = startOfDay(t)
  const p = workspace.period
  if (!p) return day
  return Math.min(Math.max(day, p.start), addDays(p.end, -1))
}

/** The workspace as seen inside its period: coverage is cut at the edges, other items outside it dropped. */
export function withinPeriod(workspace: Workspace): Workspace {
  const p = workspace.period
  if (!p) return workspace
  const inside = (x: Interval) => overlapsPeriod(workspace, x)
  return {
    ...workspace,
    coverage: workspace.coverage.filter(inside).map(c => ({ ...c, start: Math.max(c.start, p.start), end: Math.min(c.end, p.end) })),
    unavailable: workspace.unavailable.filter(inside),
    shifts: workspace.shifts.filter(inside),
  }
}
