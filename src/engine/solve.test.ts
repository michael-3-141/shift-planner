import { describe, expect, it } from 'vitest'
import { sampleWeek, WEEK_START } from '../model/example'
import { withConstraint } from './rules'
import { isPreferredHandover, solve } from './solve'
import type { Shift } from './types'
import { validatePlan } from './validate'

describe('sample week', () => {
  // 15-minute steps are measured in the browser; WASM in Node is several times slower.
  for (const step of [60, 30]) {
    it(`solves at ${step}-minute steps`, async () => {
      const workspace = sampleWeek(step)
      const result = await solve(workspace, { from: WEEK_START, timeLimitSeconds: 40 })
      console.log(step, result.status, JSON.stringify(result.stats), JSON.stringify(result.totals))
      expect(['optimal', 'feasible']).toContain(result.status)
      expect(validatePlan(workspace, WEEK_START, result.shifts!)).toEqual([])
      expect(result.shifts!.some(s => s.personId === 'C' && s.end > WEEK_START + 2 * 86_400_000 + 12 * 3_600_000 && s.start < WEEK_START + 3 * 86_400_000 + 8 * 3_600_000)).toBe(false)
    }, 120_000)
  }
})

describe('preferred handovers', () => {
  it('moves handovers onto the preferred times', async () => {
    // Every 4 h from 02:00 in the sample's own clock, whatever the local time zone.
    const two = new Date(WEEK_START + 2 * 3_600_000)
    // The app's default: 2 h of extra workload may be spent on aligning handovers.
    const preferredHandovers = { everyMinutes: 240, firstMinutes: two.getHours() * 60 + two.getMinutes(), allowedExtraMinutes: 120 }
    const preferred = isPreferredHandover(preferredHandovers)
    const aligned = (shifts: Shift[]) => shifts.flatMap(s => [s.start, s.end]).filter(preferred).length / (2 * shifts.length)

    const plain = sampleWeek(60)
    const nudged = { ...plain, rules: withConstraint(plain.rules, { kind: 'preferredHandovers', enabled: true, ...preferredHandovers }) }
    const before = await solve(plain, { from: WEEK_START, timeLimitSeconds: 30 })
    const after = await solve(nudged, { from: WEEK_START, timeLimitSeconds: 30 })
    console.log('aligned before', aligned(before.shifts!), 'after', aligned(after.shifts!), JSON.stringify(after.stats.stages))
    expect(validatePlan(nudged, WEEK_START, after.shifts!)).toEqual([])
    // Node runs the solver several times slower than browsers (which reach 80-90% here), so the bar is modest.
    expect(aligned(after.shifts!)).toBeGreaterThan(Math.max(0.5, aligned(before.shifts!) + 0.1))
  }, 180_000)
})
