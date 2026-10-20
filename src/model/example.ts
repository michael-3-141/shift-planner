import type { Coverage, Shift, Workspace } from '../engine/types'
import { addDays } from './time'

const HOUR = 3_600_000
/** Monday 2026-10-19 00:00 UTC. */
export const WEEK_START = Date.UTC(2026, 9, 19)

const NAMES = ['Ada', 'Ben', 'Chen', 'Dana', 'Eli', 'Fay']
const COLORS = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948']

/**
 * A week of H (06–24, none on Saturday) and E (24/7) with history, one pin and some unavailability.
 * The app's example starts on a local Monday; tests use the fixed UTC one.
 */
export function sampleWeek(stepMinutes: number, weekStart = WEEK_START): Workspace {
  // Calendar days, so local times stay put across a daylight-saving change.
  const at = (day: number, hour: number) => addDays(weekStart, day + Math.floor(hour / 24)) + (hour % 24) * HOUR
  const coverage: Coverage[] = []
  for (let day = 0; day < 7; day++) {
    if (day !== 5) coverage.push({ id: `H${day}`, positionId: 'H', start: at(day, 6), end: at(day, 24) })
  }
  coverage.push({ id: 'E', positionId: 'E', start: at(0, 0), end: at(7, 0) })

  // Two days of uneven history before the week, plus a pinned shift on Wednesday evening.
  const history: [string, string, number, number, number][] = [
    ['A', 'E', -2, 0, 4], ['B', 'E', -2, 4, 8], ['C', 'H', -2, 8, 12], ['D', 'E', -2, 12, 16],
    ['E', 'H', -2, 16, 20], ['F', 'E', -2, 20, 24], ['A', 'H', -1, 10, 14], ['B', 'E', -1, 14, 18],
    ['C', 'E', -1, 18, 22], ['D', 'E', -1, 22, 24], ['E', 'H', -1, 20, 24], ['A', 'H', -1, 6, 8],
  ]
  const shifts: Shift[] = history.map(([personId, positionId, day, from, to], i) => ({
    id: `h${i}`, personId, positionId, start: at(day, from), end: at(day, to), fixed: true,
  }))
  shifts.push({ id: 'pin', personId: 'C', positionId: 'H', start: at(2, 20), end: at(2, 24), fixed: true })

  return {
    people: 'ABCDEF'.split('').map((id, i) => ({ id, name: NAMES[i], color: COLORS[i] })),
    positions: [
      { id: 'H', name: 'Front desk', color: '#d4a6c8', weight: 1.5 },
      { id: 'E', name: 'On call', color: '#a0cbe8', weight: 1 },
    ],
    coverage,
    // Six people exactly saturate two positions during 06–24 (4h on, 8h rest), so leave is on Saturday.
    unavailable: [{ id: 'u1', personId: 'D', start: at(4, 20), end: at(6, 4), note: 'Leave' }],
    shifts,
    rules: {
      stepMinutes,
      constraints: [{ kind: 'maxShift', enabled: true, minutes: 240 }, { kind: 'minRest', enabled: true, minutes: 480 }],
    },
    // The two days of history belong to the period, so they count toward fairness.
    period: { start: at(-2, 0), end: at(7, 0) },
  }
}
