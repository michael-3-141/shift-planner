import { useState } from 'react'
import { findConstraint, withConstraint, type ConstraintOf } from '../engine/rules'
import type { Constraint, ConstraintKind, Interval, Workspace } from '../engine/types'
import { overlapsPeriod, weekAround } from '../model/period'
import type { Update } from '../model/storage'
import { addDays, daysBetween, formatDay, fromInputValue, toInputValue } from '../model/time'
import { defaultRules, STEP_OPTIONS } from '../model/workspace'
import { t } from '../i18n'
import { Card } from './Card'

// Settings that shape planning: the workspace's dates and grid, then the rules as one card each.

const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

export function WorkspaceSection({ workspace, update, now }: { workspace: Workspace; update: Update; now: number }) {
  return (
    <section>
      <h2>{t().settings.workspace}</h2>
      <div className="cards">
        <DatesCard workspace={workspace} update={update} now={now} />
        <Card title={t().settings.grid} summary={t().settings.gridSummary(t().settings.stepLabel(workspace.rules.stepMinutes))}>
          <label>{t().settings.handoverStep}
            <select value={workspace.rules.stepMinutes} onChange={e => update(w => ({ ...w, rules: { ...w.rules, stepMinutes: Number(e.target.value) } }))}>
              {STEP_OPTIONS.map(m => <option key={m} value={m}>{t().settings.stepLabel(m)}</option>)}
            </select>
          </label>
          <p className="hint">{t().settings.gridHint}</p>
        </Card>
      </div>
    </section>
  )
}

const dateValue = (t: number) => toInputValue(t).slice(0, 10)
const parseDate = (value: string) => fromInputValue(`${value}T00:00`)

function DatesCard({ workspace, update, now }: { workspace: Workspace; update: Update; now: number }) {
  const { period } = workspace
  const setPeriod = (period?: Interval) => update(w => ({ ...w, period }))
  // Both ends are whole days; the last one is shown inclusive. Moving one end past the other drags it along.
  const setFirst = (value: string) => {
    const start = parseDate(value)
    if (period && !Number.isNaN(start)) setPeriod({ start, end: Math.max(period.end, addDays(start, 1)) })
  }
  const setLast = (value: string) => {
    const last = parseDate(value)
    if (period && !Number.isNaN(last)) setPeriod({ start: Math.min(period.start, last), end: addDays(last, 1) })
  }
  const hidden = period
    ? [...workspace.coverage, ...workspace.unavailable, ...workspace.shifts].filter(x => !overlapsPeriod(workspace, x)).length
    : 0
  const days = period ? daysBetween(period.start, period.end) : 0
  return (
    <Card
      title={t().settings.limitDates}
      summary={period && t().settings.datesSummary(t().common.range(formatDay(period.start), formatDay(addDays(period.end, -1))), days)}
      enabled={!!period}
      onToggle={on => setPeriod(on ? weekAround(now) : undefined)}
    >
      {period ? (
        <>
          <div className="row">
            <label>{t().settings.firstDay}<input type="date" required value={dateValue(period.start)} onChange={e => setFirst(e.target.value)} /></label>
            <label>{t().settings.lastDay}<input type="date" required value={dateValue(addDays(period.end, -1))} onChange={e => setLast(e.target.value)} /></label>
          </div>
          <p className="hint">
            {t().settings.datesHint}
            {hidden > 0 && ` ${t().settings.hiddenItems(hidden)}`}
          </p>
        </>
      ) : (
        <p className="hint">{t().settings.allDates}</p>
      )}
    </Card>
  )
}

// Every kind gets a card, in this order. A preference the workspace doesn't have yet shows switched off
// with the default settings, ready to switch on.
const KINDS: ConstraintKind[] = ['maxShift', 'minRest', 'preferredHandovers']

export function RulesSection({ workspace, update }: { workspace: Workspace; update: Update }) {
  const { rules } = workspace
  const set = (c: Constraint) => update(w => ({ ...w, rules: withConstraint(w.rules, c) }))
  const current = <K extends ConstraintKind>(kind: K): ConstraintOf<K> =>
    findConstraint(rules, kind) ?? { ...findConstraint(defaultRules(), kind)!, enabled: false }
  return (
    <section>
      <h2>{t().settings.rules}</h2>
      <p className="hint">{t().settings.rulesHint}</p>
      <div className="cards">
        {KINDS.map(kind => {
          switch (kind) {
            case 'maxShift':
              return <MaxShiftCard key={kind} c={current('maxShift')} step={rules.stepMinutes} set={set} />
            case 'minRest':
              return <MinRestCard key={kind} c={current('minRest')} step={rules.stepMinutes} set={set} />
            case 'preferredHandovers':
              return <PreferredHandoversCard key={kind} c={current('preferredHandovers')} step={rules.stepMinutes} set={set} />
          }
        })}
      </div>
    </section>
  )
}

interface CardOf<K extends ConstraintKind> {
  c: ConstraintOf<K>
  step: number
  set: (c: Constraint) => void
}

function MaxShiftCard({ c, step, set }: CardOf<'maxShift'>) {
  return (
    <Card title={t().settings.maxShift} badge="required" alwaysOn summary={t().settings.maxShiftSummary(c.minutes / 60)}>
      <HoursInput label={t().settings.hoursLabel} minutes={c.minutes} minMinutes={step} onChange={minutes => set({ ...c, minutes })} />
      <p className="hint">{t().settings.maxShiftHint}</p>
    </Card>
  )
}

function MinRestCard({ c, step, set }: CardOf<'minRest'>) {
  return (
    <Card title={t().settings.minRest} badge="required" alwaysOn summary={t().settings.minRestSummary(c.minutes / 60)}>
      <HoursInput label={t().settings.hoursLabel} minutes={c.minutes} minMinutes={step} onChange={minutes => set({ ...c, minutes })} />
      <p className="hint">{t().settings.minRestHint}</p>
    </Card>
  )
}

// Intervals that divide a day, so the preferred times repeat daily.
const HANDOVER_INTERVALS = [2, 3, 4, 6, 8, 12].map(h => h * 60)

const handoverTimes = ({ everyMinutes, firstMinutes }: ConstraintOf<'preferredHandovers'>) =>
  Array.from({ length: (24 * 60) / everyMinutes }, (_, i) => (firstMinutes + i * everyMinutes) % (24 * 60))
    .sort((a, b) => a - b)
    .map(clock)

function PreferredHandoversCard({ c, step, set }: CardOf<'preferredHandovers'>) {
  // Only intervals and times on the step grid can be met.
  const intervals = HANDOVER_INTERVALS.filter(m => m % step === 0 || m === c.everyMinutes)
  const setFirst = (value: string) => {
    const [h, m] = value.split(':').map(Number)
    if (!Number.isNaN(h) && !Number.isNaN(m)) set({ ...c, firstMinutes: (Math.round((h * 60 + m) / step) * step) % (24 * 60) })
  }
  const times = handoverTimes(c)
  return (
    <Card
      title={t().settings.handovers} badge="preference"
      summary={`${times.length <= 6 ? times.join(', ') : t().settings.handoversEveryFrom(c.everyMinutes / 60, times[0])} · ${t().settings.handoversExtra(c.allowedExtraMinutes / 60)}`}
      enabled={c.enabled} onToggle={enabled => set({ ...c, enabled })}
    >
      <div className="row">
        <label>{t().settings.every}
          <select value={c.everyMinutes} onChange={e => set({ ...c, everyMinutes: Number(e.target.value) })}>
            {intervals.map(m => <option key={m} value={m}>{t().settings.everyHours(m / 60)}</option>)}
          </select>
        </label>
        <label>{t().settings.including}<input type="time" required step={step * 60} value={clock(c.firstMinutes)} onChange={e => setFirst(e.target.value)} /></label>
      </div>
      <HoursInput label={t().settings.allowedExtra} minutes={c.allowedExtraMinutes} minMinutes={0} stepMinutes={60} onChange={allowedExtraMinutes => set({ ...c, allowedExtraMinutes })} />
      <p className="hint">
        {t().settings.handoversHint(times.join(', '))}
        {c.allowedExtraMinutes
          ? ` ${t().settings.handoversExtraHint(c.allowedExtraMinutes / 60)}`
          : ` ${t().settings.handoversNoExtraHint}`}
        {(c.everyMinutes % step !== 0 || c.firstMinutes % step !== 0) && ` ${t().settings.handoversOffGrid(step)}`}
      </p>
    </Card>
  )
}

/** Hours, saved as minutes while the value is at least minMinutes. */
function HoursInput({ label, minutes, minMinutes, stepMinutes = minMinutes, onChange }: { label: string; minutes: number; minMinutes: number; stepMinutes?: number; onChange: (minutes: number) => void }) {
  const [text, setText] = useState(String(minutes / 60))
  // Follow outside changes, such as an import, without disturbing what is being typed.
  const [shown, setShown] = useState(minutes)
  if (shown !== minutes) {
    setShown(minutes)
    if (Math.round(Number(text) * 60) !== minutes) setText(String(minutes / 60))
  }
  const value = Math.round(Number(text) * 60)
  const valid = text !== '' && value >= minMinutes
  return (
    <label>{label}
      <input
        type="number" inputMode="decimal" min={minMinutes / 60} step={stepMinutes / 60} value={text} aria-invalid={!valid}
        onChange={e => {
          setText(e.target.value)
          const v = Math.round(Number(e.target.value) * 60)
          if (e.target.value !== '' && v >= minMinutes) onChange(v)
        }}
        onBlur={() => setText(String(minutes / 60))}
      />
      {!valid && <small className="error">{t().common.atLeastHours(minMinutes / 60)}</small>}
    </label>
  )
}
