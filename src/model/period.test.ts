import { describe, expect, it } from 'vitest'
import type { Shift, Workspace } from '../engine/types'
import { clampDay } from './period'
import { acceptPlan, planInput, totals } from './plan'
import { emptyWorkspace } from './workspace'

// Monday 2026-10-19, local time; the period is that Monday to Sunday.
const at = (day: number, hour: number) => new Date(2026, 9, 19 + day, hour).getTime()
const shift = (id: string, day: number, from: number, to: number, fixed = false): Shift => ({ id, personId: 'A', positionId: 'P', start: at(day, from), end: at(day, to), fixed })

const workspace: Workspace = {
  ...emptyWorkspace(),
  people: [{ id: 'A', name: 'A', color: '#000000' }],
  positions: [{ id: 'P', name: 'P', color: '#000000', weight: 1 }],
  coverage: [{ id: 'c', positionId: 'P', start: at(-1, 0), end: at(9, 0) }],
  shifts: [shift('before', -3, 8, 12), shift('inside', 2, 8, 12), shift('after', 8, 8, 12)],
  period: { start: at(0, 0), end: at(7, 0) },
}

describe('period', () => {
  it('cuts coverage at the edges and ignores shifts outside when planning', () => {
    const input = planInput(workspace, at(0, 0))
    expect(input.coverage).toEqual([{ id: 'c', positionId: 'P', start: at(0, 0), end: at(7, 0) }])
    expect(input.shifts).toEqual([])
  })

  it('replaces only the unpinned shifts inside the period', () => {
    const planned = [shift('new', 3, 8, 12)]
    expect(acceptPlan(workspace, at(0, 0), planned).shifts.map(s => s.start)).toEqual([at(-3, 8), at(8, 8), at(3, 8)])
  })

  it('counts totals inside the period only', () => {
    expect(totals(workspace, workspace.shifts, at(0, 0)).get('A')!.load).toBe(240)
  })

  it('keeps the shown day inside the period', () => {
    expect(clampDay(workspace, at(-5, 10))).toBe(at(0, 0))
    expect(clampDay(workspace, at(12, 10))).toBe(at(6, 0))
    expect(clampDay(workspace, at(3, 10))).toBe(at(3, 0))
  })
})
