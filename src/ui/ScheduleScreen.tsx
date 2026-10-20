import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { Coverage, Shift, Unavailable, Uncoverable, Workspace } from '../engine/types'
import type { Update } from '../model/storage'
import { clampDay } from '../model/period'
import type { SetupStep } from '../model/setup'
import { addDays, daysBetween, formatDay, formatTime, HOUR, snap, startOfWeek } from '../model/time'
import { CoverageForm, ShiftForm, UnavailableForm } from './forms'
import { Grid, type GridBlock, type GridColumn } from './Grid'
import { t } from '../i18n'
import { Icon, type IconName } from './Icon'
import { SetupChecklist } from './SetupChecklist'

export type Mode = 'shifts' | 'coverage' | 'off'

const MODES: Mode[] = ['shifts', 'coverage', 'off']
const MODE_ICONS: Record<Mode, IconName> = { shifts: 'person', coverage: 'layers', off: 'off' }

type Editing =
  | { type: 'shift'; item: Omit<Shift, 'id'> & { id?: string } }
  | { type: 'coverage'; item: Omit<Coverage, 'id'> & { id?: string } }
  | { type: 'off'; item: Omit<Unavailable, 'id'> & { id?: string } }

interface Props {
  workspace: Workspace
  update: Update
  now: number
  wide: boolean
  /** The shifts to show, including an unaccepted plan. */
  shifts: Shift[]
  draftIds: Set<string>
  uncoverable: Uncoverable[]
  onGoTo: (screen: 'team' | 'settings') => void
  onPlan: () => void
  /** The getting-started checklist, while it is shown. */
  setup?: { done: Record<SetupStep, boolean>; onDismiss: () => void }
  view: ScheduleView
  setView: Dispatch<SetStateAction<ScheduleView>>
}

/** What the schedule shows; kept by the app so it survives switching screens. */
export interface ScheduleView {
  day: number
  mode: Mode
  /** Height of an hour in pixels, or 'fit' to show whole days; the default depends on the layout. */
  zoom?: number | 'fit'
}

/** Slots stay tall enough to tap on fine grids. */
const defaultHourPx = (stepMinutes: number) => (stepMinutes >= 60 ? 44 : stepMinutes >= 30 ? 64 : 112)
const MIN_HOUR_PX = 12
const MAX_HOUR_PX = 160

export function ScheduleScreen({ workspace, update, now, wide, shifts, draftIds, uncoverable, onGoTo, onPlan, setup, view, setView }: Props) {
  const { mode } = view
  const { people, positions, rules, period } = workspace
  const day = clampDay(workspace, view.day)
  const setDay = (change: (day: number) => number) => setView(v => ({ ...v, day: clampDay(workspace, change(clampDay(workspace, v.day))) }))
  const setMode = (mode: Mode) => setView(v => ({ ...v, mode }))
  const [editing, setEditing] = useState<Editing>()

  // Week views start fitted to the screen; the phone day view starts with slots big enough to tap.
  const [viewport, setViewport] = useState(0)
  const zoom = view.zoom ?? (wide ? 'fit' : defaultHourPx(rules.stepMinutes))
  const clampZoom = (px: number) => Math.min(MAX_HOUR_PX, Math.max(MIN_HOUR_PX, px))
  const hourPx = zoom !== 'fit' ? zoom : viewport > 0 ? clampZoom(Math.floor((viewport / 24) * 4) / 4) : defaultHourPx(rules.stepMinutes)
  const zoomBy = (factor: number) => setView(v => ({ ...v, zoom: clampZoom(Math.round(hourPx * factor)) }))
  const fit = () => setView(v => ({ ...v, zoom: 'fit' }))

  // A range being picked by tapping; the toolbar shows it, and Cancel ends it in the grid.
  const [picking, setPicking] = useState<number>()
  const [pickReset, setPickReset] = useState(0)

  // With a period, weeks are counted from its first day, so a week-long project fits on one page.
  const first = !wide ? day : period ? addDays(period.start, 7 * Math.floor(daysBetween(period.start, day) / 7)) : startOfWeek(day)
  const days = Array.from({ length: wide ? 7 : 1 }, (_, i) => addDays(first, i)).filter(d => !period || d < period.end)
  const page = wide ? 7 : 1
  const canGo = (direction: number) => !period || (direction < 0 ? first > period.start : addDays(first, page) < period.end)
  const go = (direction: number) => canGo(direction) && setDay(d => addDays(d, direction * page))

  const personById = new Map(people.map(p => [p.id, p]))
  const positionById = new Map(positions.map(p => [p.id, p]))
  const columns: GridColumn[] = mode === 'off'
    ? people.map(p => ({ id: p.id, label: p.name, color: p.color }))
    : positions.map(p => ({ id: p.id, label: p.name, color: p.color }))

  const shiftBlock = (s: Shift): GridBlock => {
    const draft = draftIds.has(s.id)
    return {
      key: s.id, columnId: s.positionId, start: s.start, end: s.end,
      kind: draft ? 'draft' : s.fixed && s.end > now ? 'pinned' : 'shift',
      color: personById.get(s.personId)?.color, label: personById.get(s.personId)?.name,
      onSelect: draft ? undefined : () => setEditing({ type: 'shift', item: s }),
    }
  }
  const blocks: GridBlock[] = mode === 'shifts' ? [
    ...workspace.coverage.map(c => ({ key: c.id, columnId: c.positionId, start: c.start, end: c.end, kind: 'coverage' as const })),
    ...shifts.map(shiftBlock),
    ...uncoverable.map(u => ({ key: `u${u.positionId}${u.start}`, columnId: u.positionId, start: u.start, end: u.end, kind: 'problem' as const, label: t().schedule.nobodyAvailable })),
  ] : mode === 'coverage' ? workspace.coverage.map(c => ({
    key: c.id, columnId: c.positionId, start: c.start, end: c.end, kind: 'shift', color: positionById.get(c.positionId)?.color, label: c.seriesId ? t().schedule.neededSeries : t().schedule.needed,
    onSelect: () => setEditing({ type: 'coverage', item: c }),
  })) : [
    ...shifts.map(s => ({ key: s.id, columnId: s.personId, start: s.start, end: s.end, kind: 'muted' as const, label: positionById.get(s.positionId)?.name })),
    ...workspace.unavailable.map(u => ({
      key: u.id, columnId: u.personId, start: u.start, end: u.end, kind: 'off' as const, label: u.note ?? t().schedule.timeOff,
      onSelect: () => setEditing({ type: 'off', item: u }),
    })),
  ]

  const open = (columnId: string, start: number, end: number) => {
    if (mode === 'shifts') setEditing({ type: 'shift', item: { personId: '', positionId: columnId, start, end, fixed: true } })
    else if (mode === 'coverage') setEditing({ type: 'coverage', item: { positionId: columnId, start, end } })
    else setEditing({ type: 'off', item: { personId: columnId, start, end } })
  }
  const defaultStart = () => snap(Math.max(day, Math.min(now, addDays(day, 1) - HOUR)), rules.stepMinutes, 'ceil')
  // Coverage usually spans the whole project, so it starts out as the whole period.
  const addCoverage = () => {
    const start = period?.start ?? defaultStart()
    setMode('coverage')
    setEditing({ type: 'coverage', item: { positionId: positions[0].id, start, end: period?.end ?? start + 8 * HOUR } })
  }
  const add = () => {
    if (mode === 'coverage') return addCoverage()
    const start = defaultStart()
    open(columns[0].id, start, start + 8 * HOUR)
  }
  const setupAction = (step: SetupStep) => {
    if (step === 'rules') onGoTo('settings')
    else if (step === 'people' || step === 'positions') onGoTo('team')
    else if (step === 'coverage') addCoverage()
    else onPlan()
  }

  const missing = mode === 'off' ? !people.length : !positions.length
  const canAdd = !missing && !(mode === 'shifts' && !people.length)
  const formProps = { workspace, update, onClose: () => setEditing(undefined) }

  return (
    <div className="schedule">
      <div className="toolbar">
        {picking !== undefined ? (
          // While a range is being picked, the toolbar says so instead of covering the grid.
          <div className="picking" role="status">
            <span>{t().schedule.pickStart(formatTime(picking))}</span>
            <button onClick={() => setPickReset(n => n + 1)}>{t().common.cancel}</button>
          </div>
        ) : wide ? (
          <>
            <div className="nav">
              <button className="icon" aria-label={t().schedule.previousWeek} disabled={!canGo(-1)} onClick={() => go(-1)}><Icon name="left" /></button>
              <button onClick={() => setDay(() => now)}>{t().schedule.today}</button>
              <button className="icon" aria-label={t().schedule.nextWeek} disabled={!canGo(1)} onClick={() => go(1)}><Icon name="right" /></button>
              <span className="date">{t().common.range(formatDay(days[0]), formatDay(days[days.length - 1]))}</span>
            </div>
            {!missing && <div className="zoom" role="group" aria-label={t().schedule.zoom}>
              <button className="icon" aria-label={t().schedule.zoomOut} disabled={hourPx <= MIN_HOUR_PX} onClick={() => zoomBy(1 / 1.25)}><Icon name="minus" /></button>
              <button className="fit" aria-pressed={zoom === 'fit'} title={t().schedule.fitTitle} onClick={fit}>
                <Icon name="fit" size={16} />{t().schedule.fit}
              </button>
              <button className="icon" aria-label={t().schedule.zoomIn} disabled={hourPx >= MAX_HOUR_PX} onClick={() => zoomBy(1.25)}><Icon name="plus" /></button>
            </div>}
            <div className="segmented" role="tablist" aria-label={t().schedule.show}>
              {MODES.map(m => (
                <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}>{t().schedule.modes[m]}</button>
              ))}
            </div>
            <button className="add" disabled={!canAdd} onClick={add}><Icon name="plus" size={16} />{t().common.add}</button>
          </>
        ) : (
          // Phones: one row. The date goes to today; zoom lives in the menu; Add floats over the grid.
          <>
            <div className="nav">
              <button className="icon" aria-label={t().schedule.previousDay} disabled={!canGo(-1)} onClick={() => go(-1)}><Icon name="left" /></button>
              <button className="date" title={t().schedule.goToday} onClick={() => setDay(() => now)}>{formatDay(day)}</button>
              <button className="icon" aria-label={t().schedule.nextDay} disabled={!canGo(1)} onClick={() => go(1)}><Icon name="right" /></button>
            </div>
            <span className="spacer" />
            <div className="segmented icons" role="tablist" aria-label={t().schedule.show}>
              {MODES.map(m => (
                <button key={m} role="tab" aria-selected={mode === m} aria-label={t().schedule.modes[m]} title={t().schedule.modes[m]} onClick={() => setMode(m)}>
                  <Icon name={MODE_ICONS[m]} />
                </button>
              ))}
            </div>
            {!missing && (
              <MoreMenu items={[
                { label: t().schedule.today, icon: 'calendar', onSelect: () => setDay(() => now) },
                { label: t().schedule.zoomIn, icon: 'plus', disabled: hourPx >= MAX_HOUR_PX, keepOpen: true, onSelect: () => zoomBy(1.25) },
                { label: t().schedule.zoomOut, icon: 'minus', disabled: hourPx <= MIN_HOUR_PX, keepOpen: true, onSelect: () => zoomBy(1 / 1.25) },
                { label: t().schedule.fitTitle, icon: 'fit', pressed: zoom === 'fit', onSelect: fit },
              ]} />
            )}
          </>
        )}
      </div>

      {setup && <SetupChecklist workspace={workspace} now={now} done={setup.done} onAction={setupAction} onDismiss={setup.onDismiss} compact={!wide && !missing} />}

      {missing ? (
        // With the checklist showing, it already says what to do next.
        !setup && (
          <div className="empty">
            <p>{mode === 'off' ? t().schedule.noPeopleForTimeOff : t().schedule.noPositions}</p>
            <button className="primary" onClick={() => onGoTo('team')}>{t().common.goToTeam}</button>
          </div>
        )
      ) : (
        <Grid
          days={days}
          columns={columns}
          blocks={blocks}
          stepMinutes={rules.stepMinutes}
          hourPx={hourPx}
          onViewportHeight={setViewport}
          now={now}
          onRange={mode === 'shifts' && !people.length ? undefined : open}
          onSwipe={wide ? undefined : go}
          onPicking={setPicking}
          pickReset={pickReset}
        />
      )}

      {!wide && canAdd && picking === undefined && (
        <button className="fab primary" aria-label={t().common.add} onClick={add}><Icon name="plus" size={24} /></button>
      )}

      {editing?.type === 'shift' && <ShiftForm {...formProps} item={editing.item} now={now} />}
      {editing?.type === 'coverage' && <CoverageForm {...formProps} item={editing.item} />}
      {editing?.type === 'off' && <UnavailableForm {...formProps} item={editing.item} />}
    </div>
  )
}

interface MenuItem {
  label: string
  icon: IconName
  disabled?: boolean
  /** Shown as switched on. */
  pressed?: boolean
  /** Stay open after choosing, for steps such as zooming in again. */
  keepOpen?: boolean
  onSelect: () => void
}

/** A ⋯ button with a small menu below it, closed by choosing or by pressing elsewhere. */
function MoreMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  return (
    <div className="menu-wrap" ref={ref}>
      <button className="icon" aria-label={t().schedule.more} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}><Icon name="more" /></button>
      {open && (
        <div className="menu" role="menu">
          {items.map(item => (
            <button key={item.label} role="menuitem" disabled={item.disabled} aria-pressed={item.pressed} onClick={() => { item.onSelect(); if (!item.keepOpen) setOpen(false) }}>
              <Icon name={item.icon} size={16} />{item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
