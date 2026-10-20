import { describe, expect, it } from 'vitest'
import type { Coverage } from '../engine/types'
import { deleteCoverage, editCoverage, repeatInterval } from './repeat'

// Monday 2026-10-19, local time.
const at = (day: number, hour: number) => new Date(2026, 9, 19 + day, hour).getTime()
const block = { start: at(0, 6), end: at(1, 0) }

describe('repeatInterval', () => {
  it('repeats on every chosen day up to and including the last day', () => {
    const copies = repeatInterval(block, 'days', at(6, 0), [0, 1, 2, 3, 4, 5, 6])
    expect(copies).toHaveLength(7)
    expect(copies[6]).toEqual({ start: at(6, 6), end: at(7, 0) })
  })

  it('repeats only on the chosen days', () => {
    // Sunday to Thursday.
    const starts = repeatInterval(block, 'days', at(13, 0), [0, 1, 2, 3, 4]).map(c => new Date(c.start).getDay())
    expect(starts).toEqual([1, 2, 3, 4, 0, 1, 2, 3, 4, 0])
  })

  it('repeats weekly', () => {
    expect(repeatInterval(block, 'weekly', at(20, 0)).map(c => c.start)).toEqual([at(0, 6), at(7, 6), at(14, 6)])
  })

  it('keeps the clock time across a daylight-saving change', () => {
    // 2026-03-29 is a change date in much of Europe; the hour stays the same either way.
    const march = { start: new Date(2026, 2, 27, 6).getTime(), end: new Date(2026, 2, 27, 18).getTime() }
    for (const c of repeatInterval(march, 'days', new Date(2026, 2, 31).getTime(), [0, 1, 2, 3, 4, 5, 6])) {
      expect(new Date(c.start).getHours()).toBe(6)
      expect(new Date(c.end).getHours()).toBe(18)
    }
  })

  it('returns only the original without repeat', () => {
    expect(repeatInterval(block, 'none', at(30, 0))).toEqual([block])
  })
})

describe('series', () => {
  // Five daily 06–14 blocks of position P in one series, plus an unrelated block.
  const series: Coverage[] = [0, 1, 2, 3, 4].map(d => ({ id: `s${d}`, positionId: 'P', start: at(d, 6), end: at(d, 14), seriesId: 'S' }))
  const coverage: Coverage[] = [...series, { id: 'x', positionId: 'P', start: at(2, 20), end: at(2, 22) }]
  const moved = { positionId: 'Q', start: at(2, 8), end: at(2, 16) }
  const byId = (list: Coverage[]) => new Map(list.map(c => [c.id, c]))

  it('edits the whole series at the same clock times on each day', () => {
    const result = byId(editCoverage(coverage, series[2], 'all', moved))
    for (const d of [0, 1, 2, 3, 4]) expect(result.get(`s${d}`)).toEqual({ id: `s${d}`, positionId: 'Q', start: at(d, 8), end: at(d, 16), seriesId: 'S' })
    expect(result.get('x')).toEqual(coverage[5])
  })

  it('splits off this and later blocks into a new series', () => {
    const result = byId(editCoverage(coverage, series[2], 'later', moved))
    expect(result.get('s1')).toEqual(series[1])
    const newSeries = result.get('s2')!.seriesId
    expect(newSeries).not.toBe('S')
    expect(result.get('s4')).toMatchObject({ start: at(4, 8), seriesId: newSeries })
  })

  it('takes a block edited alone out of its series', () => {
    const result = byId(editCoverage(coverage, series[2], 'one', moved))
    expect(result.get('s2')).toEqual({ id: 's2', ...moved })
    expect(result.get('s3')).toEqual(series[3])
  })

  it('deletes by scope', () => {
    expect(deleteCoverage(coverage, series[3], 'later').map(c => c.id)).toEqual(['s0', 's1', 's2', 'x'])
    expect(deleteCoverage(coverage, series[3], 'all').map(c => c.id)).toEqual(['x'])
    expect(deleteCoverage(coverage, series[3], 'one').map(c => c.id)).toEqual(['s0', 's1', 's2', 's4', 'x'])
  })
})
