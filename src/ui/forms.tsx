import { useState, type FormEvent, type ReactNode } from 'react'
import type { Coverage, Shift, Unavailable, Workspace } from '../engine/types'
import type { Update } from '../model/storage'
import { deleteCoverage, editCoverage, inScope, MAX_REPEATS, repeatInterval, type Repeat, type Scope } from '../model/repeat'
import { addDays, formatDay, fromInputValue, snap, toInputValue, week, weekdayName } from '../model/time'
import { newId } from '../model/workspace'
import { t } from '../i18n'
import { Sheet } from './Sheet'

// Forms for the blocks on the schedule. Each edits one item, new or existing, and closes when done.

type Draft<T> = Omit<T, 'id'> & { id?: string }

interface FormProps<T> {
  workspace: Workspace
  update: Update
  item: Draft<T>
  onClose: () => void
}

/** Start and end fields snapped to the step grid; returns the interval or an error message. */
function useRange(item: { start: number; end: number }, stepMinutes: number) {
  const [start, setStart] = useState(toInputValue(item.start))
  const [end, setEnd] = useState(toInputValue(item.end))
  const read = (): { start: number; end: number } | string => {
    const s = fromInputValue(start)
    const e = fromInputValue(end)
    if (Number.isNaN(s) || Number.isNaN(e)) return t().forms.enterRange
    const range = { start: snap(s, stepMinutes), end: snap(e, stepMinutes) }
    return range.end > range.start ? range : t().forms.endAfterStart
  }
  const fields = (
    <div className="row">
      <label>{t().common.start}<input type="datetime-local" required step={stepMinutes * 60} value={start} onChange={e => setStart(e.target.value)} /></label>
      <label>{t().common.end}<input type="datetime-local" required step={stepMinutes * 60} value={end} onChange={e => setEnd(e.target.value)} /></label>
    </div>
  )
  return { fields, read }
}

function FormSheet({ title, onClose, onSubmit, onDelete, error, children }: {
  title: string; onClose: () => void; onSubmit: () => void; onDelete?: () => void; error?: string; children: ReactNode
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit()
  }
  return (
    <Sheet title={title} onClose={onClose}>
      <form onSubmit={submit} className="form">
        {children}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          {onDelete && <button type="button" className="danger" onClick={onDelete}>{t().common.delete}</button>}
          <span className="spacer" />
          <button type="button" onClick={onClose}>{t().common.cancel}</button>
          <button type="submit" className="primary">{t().common.save}</button>
        </div>
      </form>
    </Sheet>
  )
}

// The repeat days last chosen on this device; the locale's work days until then.
const REPEAT_DAYS = 'repeat-days'

function loadRepeatDays(): number[] {
  try {
    const days = JSON.parse(localStorage.getItem(REPEAT_DAYS) ?? 'null')
    if (Array.isArray(days) && days.every(d => Number.isInteger(d) && d >= 0 && d < 7)) return days
  } catch {
    // Storage may be unavailable or hold something else; fall back to the locale.
  }
  return week().workdays
}

function saveRepeatDays(days: number[]) {
  try {
    localStorage.setItem(REPEAT_DAYS, JSON.stringify(days))
  } catch {
    // Remembering the days is only a convenience.
  }
}

/** Replaces the item with a matching id, or appends it. */
const upsert = <T extends { id: string },>(list: T[], item: T) => (list.some(x => x.id === item.id) ? list.map(x => (x.id === item.id ? item : x)) : [...list, item])

export function CoverageForm({ workspace, update, item, onClose }: FormProps<Coverage>) {
  const [positionId, setPositionId] = useState(item.positionId)
  const [error, setError] = useState<string>()
  const [repeat, setRepeat] = useState<Repeat>('none')
  const [days, setDays] = useState(loadRepeatDays)
  // Repeats run to the end of the period unless told otherwise.
  const lastDayOfPeriod = workspace.period && toInputValue(addDays(workspace.period.end, -1)).slice(0, 10)
  const [until, setUntil] = useState(lastDayOfPeriod ?? toInputValue(addDays(item.start, 6)).slice(0, 10))
  const range = useRange(item, workspace.rules.stepMinutes)
  const lastDay = fromInputValue(`${until}T00:00`)
  const r = range.read()
  const copies = typeof r === 'string' || Number.isNaN(lastDay) ? [] : repeatInterval(r, repeat, lastDay, days)
  // An existing block in a series of more than one: the edit may reach the rest of the series.
  const existing = item.id ? workspace.coverage.find(c => c.id === item.id) : undefined
  const inSeries = existing ? inScope(workspace.coverage, existing, 'all').length > 1 : false
  const [scope, setScope] = useState<Scope>('one')

  const save = () => {
    if (typeof r === 'string') return setError(r)
    if (inSeries) {
      update(w => ({ ...w, coverage: editCoverage(w.coverage, existing!, scope, { positionId, ...r }) }))
      return onClose()
    }
    if (repeat !== 'none' && copies.length < 2) return setError(t().forms.nothingToRepeat)
    if (repeat === 'days') saveRepeatDays(days)
    update(w => {
      const [first, ...rest] = copies
      const seriesId = rest.length ? newId() : undefined
      const series = seriesId ? { seriesId } : {}
      const coverage = upsert(w.coverage, { id: item.id ?? newId(), positionId, ...first, ...series })
      // Copies that already exist exactly are skipped, so repeating twice does no harm.
      const added = rest
        .filter(c => !coverage.some(x => x.positionId === positionId && x.start === c.start && x.end === c.end))
        .map(c => ({ id: newId(), positionId, ...c, ...series }))
      return { ...w, coverage: [...coverage, ...added] }
    })
    onClose()
  }
  const remove = existing ? () => { update(w => ({ ...w, coverage: deleteCoverage(w.coverage, existing, scope) })); onClose() } : undefined
  return (
    <FormSheet title={item.id ? t().forms.editCoverage : t().forms.addCoverage} onClose={onClose} onSubmit={save} onDelete={remove} error={error}>
      <p className="hint">{t().forms.coverageHint}</p>
      <label>{t().common.position}
        <select value={positionId} onChange={e => setPositionId(e.target.value)}>
          {workspace.positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      {range.fields}
      {inSeries && (
        <label>{t().forms.applyTo}
          <select value={scope} onChange={e => setScope(e.target.value as Scope)}>
            <option value="one">{t().forms.scopeOne}</option>
            <option value="later">{t().forms.scopeLater(inScope(workspace.coverage, existing!, 'later').length)}</option>
            <option value="all">{t().forms.scopeAll(inScope(workspace.coverage, existing!, 'all').length)}</option>
          </select>
        </label>
      )}
      {inSeries && scope !== 'one' && <p className="hint">{t().forms.scopeHint}</p>}
      {!inSeries && <div className="row">
        <label>{t().forms.repeat}
          <select value={repeat} onChange={e => setRepeat(e.target.value as Repeat)}>
            <option value="none">{t().forms.repeatNone}</option>
            <option value="days">{t().forms.repeatDays}</option>
            <option value="weekly">{t().forms.repeatWeekly}</option>
          </select>
        </label>
        {repeat !== 'none' && <label>{t().forms.until}<input type="date" required max={lastDayOfPeriod} value={until} onChange={e => setUntil(e.target.value)} /></label>}
      </div>}
      {!inSeries && repeat === 'days' && (
        <div className="days" role="group" aria-label={t().forms.days}>
          {week().days.map(d => (
            <button
              key={d} type="button" aria-pressed={days.includes(d)}
              onClick={() => setDays(ds => (ds.includes(d) ? ds.filter(x => x !== d) : [...ds, d]))}
            >
              {weekdayName(d)}
            </button>
          ))}
        </div>
      )}
      {!inSeries && repeat !== 'none' && copies.length > 1 && (
        <p className="hint">
          {t().forms.repeatPreview(copies.length - 1, formatDay(copies[copies.length - 1].start))}
          {copies.length > MAX_REPEATS && ` ${t().forms.repeatLimit}`} {t().forms.repeatLater}
        </p>
      )}
    </FormSheet>
  )
}

export function UnavailableForm({ workspace, update, item, onClose }: FormProps<Unavailable>) {
  const [personId, setPersonId] = useState(item.personId)
  const [note, setNote] = useState(item.note ?? '')
  const [error, setError] = useState<string>()
  const range = useRange(item, workspace.rules.stepMinutes)
  const save = () => {
    const r = range.read()
    if (typeof r === 'string') return setError(r)
    update(w => ({ ...w, unavailable: upsert(w.unavailable, { id: item.id ?? newId(), personId, ...r, ...(note.trim() ? { note: note.trim() } : {}) }) }))
    onClose()
  }
  const remove = item.id ? () => { update(w => ({ ...w, unavailable: w.unavailable.filter(u => u.id !== item.id) })); onClose() } : undefined
  return (
    <FormSheet title={item.id ? t().forms.editTimeOff : t().forms.addTimeOff} onClose={onClose} onSubmit={save} onDelete={remove} error={error}>
      <label>{t().common.person}
        <select value={personId} onChange={e => setPersonId(e.target.value)}>
          {workspace.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      {range.fields}
      <label>{t().forms.note}<input dir="auto" value={note} placeholder={t().common.optional} onChange={e => setNote(e.target.value)} /></label>
    </FormSheet>
  )
}

export function ShiftForm({ workspace, update, item, onClose, now }: FormProps<Shift> & { now: number }) {
  const [personId, setPersonId] = useState(item.personId)
  const [positionId, setPositionId] = useState(item.positionId)
  const [fixed, setFixed] = useState(item.fixed)
  const [error, setError] = useState<string>()
  const range = useRange(item, workspace.rules.stepMinutes)
  const save = () => {
    const r = range.read()
    if (typeof r === 'string') return setError(r)
    if (!personId) return setError(t().forms.chooseWho)
    update(w => ({ ...w, shifts: upsert(w.shifts, { id: item.id ?? newId(), personId, positionId, ...r, fixed }) }))
    onClose()
  }
  const remove = item.id ? () => { update(w => ({ ...w, shifts: w.shifts.filter(s => s.id !== item.id) })); onClose() } : undefined
  return (
    <FormSheet title={item.id ? t().forms.editShift : t().forms.addShift} onClose={onClose} onSubmit={save} onDelete={remove} error={error}>
      <label>{t().common.person}
        <select value={personId} onChange={e => setPersonId(e.target.value)}>
          {!personId && <option value="">{t().common.choose}</option>}
          {workspace.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label>{t().common.position}
        <select value={positionId} onChange={e => setPositionId(e.target.value)}>
          {workspace.positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      {range.fields}
      {item.start >= now && (
        <label className="check">
          <input type="checkbox" checked={fixed} onChange={e => setFixed(e.target.checked)} />
          {t().forms.pinned}
        </label>
      )}
    </FormSheet>
  )
}
