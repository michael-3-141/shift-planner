import { describe, expect, it } from 'vitest'
import type { Workspace } from '../engine/types'
import { withConstraint } from '../engine/rules'
import { setupDone } from './setup'
import { emptyWorkspace } from './workspace'

const at = (day: number, hour: number) => new Date(2026, 9, 19 + day, hour).getTime()
const now = at(1, 12)

describe('setupDone', () => {
  it('has only the default rules in a new workspace', () => {
    expect(setupDone(emptyWorkspace(), now)).toEqual({ rules: true, people: false, positions: false, coverage: false, plan: false })
  })

  it('counts only coverage and shifts inside the dates and not over yet', () => {
    const w: Workspace = {
      ...emptyWorkspace(),
      people: [{ id: 'A', name: 'A', color: '#000000' }],
      positions: [{ id: 'P', name: 'P', color: '#000000', weight: 1 }],
      period: { start: at(0, 0), end: at(7, 0) },
      coverage: [{ id: 'past', positionId: 'P', start: at(0, 6), end: at(0, 22) }, { id: 'later', positionId: 'P', start: at(8, 6), end: at(8, 22) }],
      shifts: [{ id: 's', personId: 'A', positionId: 'P', start: at(0, 6), end: at(0, 10), fixed: true }],
    }
    expect(setupDone(w, now)).toMatchObject({ people: true, positions: true, coverage: false, plan: false })
    const covered = { ...w, coverage: [...w.coverage, { id: 'now', positionId: 'P', start: at(2, 6), end: at(2, 22) }] }
    expect(setupDone(covered, now).coverage).toBe(true)
  })

  it('flags rules that cannot be planned with', () => {
    const w = emptyWorkspace()
    expect(setupDone({ ...w, rules: withConstraint(w.rules, { kind: 'minRest', enabled: true, minutes: 0 }) }, now).rules).toBe(false)
  })
})
