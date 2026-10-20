import type { Coverage, Id, Interval } from '../engine/types'
import { addDays, daysBetween, startOfDay } from './time'
import { newId } from './workspace'

export type Repeat = 'none' | 'days' | 'weekly'

/** Upper bound on copies, so a mistyped year can't flood the workspace. */
export const MAX_REPEATS = 400

/**
 * The interval and its repeats, keeping local clock times across daylight-saving changes.
 * Repeats start on later days up to and including the day of `until`; with 'days' only on the
 * given weekdays (Date.getDay() numbers, 0 = Sunday).
 */
export function repeatInterval(interval: Interval, repeat: Repeat, until: number, days: number[] = []): Interval[] {
  const result = [interval]
  if (repeat === 'none') return result
  const last = startOfDay(until)
  const every = repeat === 'weekly' ? 7 : 1
  for (let k = every; result.length <= MAX_REPEATS; k += every) {
    const start = addDays(interval.start, k)
    if (startOfDay(start) > last) break
    if (repeat === 'days' && !days.includes(new Date(start).getDay())) continue
    result.push({ start, end: addDays(interval.end, k) })
  }
  return result
}

// A series is the blocks one repeat created. Each block stays a plain coverage block; edits and
// deletes can reach just the block, it and the later ones, or the whole series.

export type Scope = 'one' | 'later' | 'all'

/** The blocks an edit of `item` with this scope touches, `item` included. */
export function inScope(coverage: Coverage[], item: Coverage, scope: Scope): Coverage[] {
  if (!item.seriesId || scope === 'one') return [item]
  return coverage.filter(c => c.seriesId === item.seriesId && (scope === 'all' || c.start >= item.start))
}

/**
 * Applies an edit of `item` to the blocks in scope: each gets the new position and clock times on its own day.
 * A block edited alone leaves its series; later blocks edited together become a series of their own.
 */
export function editCoverage(coverage: Coverage[], item: Coverage, scope: Scope, change: { positionId: Id } & Interval): Coverage[] {
  const targets = new Set(inScope(coverage, item, scope).map(c => c.id))
  const splits = scope === 'later' && coverage.some(c => c.seriesId === item.seriesId && !targets.has(c.id))
  const seriesId = scope === 'one' ? undefined : splits ? newId() : item.seriesId
  return coverage.map(c => {
    if (!targets.has(c.id)) return c
    const k = daysBetween(item.start, c.start)
    return { id: c.id, positionId: change.positionId, start: addDays(change.start, k), end: addDays(change.end, k), ...(seriesId ? { seriesId } : {}) }
  })
}

export function deleteCoverage(coverage: Coverage[], item: Coverage, scope: Scope): Coverage[] {
  const targets = new Set(inScope(coverage, item, scope).map(c => c.id))
  return coverage.filter(c => !targets.has(c.id))
}
