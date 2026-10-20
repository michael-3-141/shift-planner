import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type TouchEvent } from 'react'
import { isRtl } from '../i18n/locale'
import { addDays, formatDay, formatHour, formatTime, HOUR, hoursIntoDay, MINUTE } from '../model/time'

// A calendar grid: days side by side, each split into columns (positions or people), time running down.
// Ranges are picked by tapping a start slot and then an end slot, or by dragging with a mouse.

export interface GridColumn {
  id: string
  label: string
  color: string
}

export type BlockKind = 'coverage' | 'shift' | 'pinned' | 'draft' | 'off' | 'muted' | 'problem'

export interface GridBlock {
  key: string
  columnId: string
  start: number
  end: number
  kind: BlockKind
  color?: string
  label?: string
  onSelect?: () => void
}

interface Props {
  days: number[]
  columns: GridColumn[]
  blocks: GridBlock[]
  stepMinutes: number
  /** Height of one hour, i.e. the vertical zoom. */
  hourPx: number
  now: number
  /** Called with a picked range; ranges are disabled without it. */
  onRange?: (columnId: string, start: number, end: number) => void
  /** Swipe left or right on phones. */
  onSwipe?: (direction: 1 | -1) => void
  /** Receives the height available below the headers, for fitting a whole day. */
  onViewportHeight?: (px: number) => void
  /** The start of a range being picked by tapping, or undefined; the screen shows the hint. */
  onPicking?: (start: number | undefined) => void
  /** Changing this cancels a range being picked. */
  pickReset?: number
}

const gap = (b: GridBlock) => (b.kind === 'coverage' ? 0 : 1)

interface Pick { scope: string; day: number; columnId: string; start: number; end: number; dragging?: boolean }

export function Grid({ days, columns, blocks, stepMinutes, hourPx, now, onRange, onSwipe, onViewportHeight, onPicking, pickReset = 0 }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const axis = useRef<HTMLDivElement>(null)
  // A pick belongs to what was on screen when it started, and ends when the screen cancels it.
  const scope = `${days.join()}|${columns.map(c => c.id).join()}|${stepMinutes}|${pickReset}`
  const [rawPick, setPick] = useState<Pick>()
  const pick = rawPick?.scope === scope ? rawPick : undefined
  const picking = pick && !pick.dragging ? Math.min(pick.start, pick.end) : undefined
  useEffect(() => onPicking?.(picking), [picking, onPicking])
  const drag = useRef<{ pick: Pick; moved: boolean }>(undefined)
  const swipe = useRef<{ x: number; y: number }>(undefined)
  const step = stepMinutes * MINUTE

  // Open at 06:00, where most days get busy; on zooming, keep the same time at the top.
  const shownHourPx = useRef<number>(undefined)
  useEffect(() => {
    const el = scroller.current!
    el.scrollTop = shownHourPx.current ? (el.scrollTop * hourPx) / shownHourPx.current : 6 * hourPx
    shownHourPx.current = hourPx
  }, [hourPx])

  useEffect(() => {
    if (!onViewportHeight) return
    const el = scroller.current!
    // The hours start below the headers, wherever the grid is scrolled to.
    const headers = () => axis.current!.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop
    // Room left below the day (for a floating button) isn't part of the day.
    const below = () => parseFloat(getComputedStyle(el).paddingBottom) || 0
    const observer = new ResizeObserver(() => onViewportHeight(el.clientHeight - headers() - below()))
    observer.observe(el)
    return () => observer.disconnect()
  }, [onViewportHeight])

  const slotAt = (e: MouseEvent<HTMLDivElement>, day: number) => {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top
    // Count slots on the wall clock, so days with a daylight-saving change still match the hour labels.
    const t = new Date(day)
    t.setMinutes(Math.floor((y / hourPx) * 60 / stepMinutes) * stepMinutes)
    return t.getTime()
  }

  const finish = (p: Pick) => {
    setPick(undefined)
    onRange?.(p.columnId, Math.min(p.start, p.end), Math.max(p.start, p.end) + step)
  }

  // A mouse drag that just ended picks its range on release; the click that follows it isn't a tap.
  const dragged = useRef(false)
  const down = (e: PointerEvent<HTMLDivElement>, day: number, columnId: string) => {
    dragged.current = false
    if (!onRange || e.pointerType !== 'mouse' || e.button !== 0) return
    const t = slotAt(e, day)
    drag.current = { pick: { scope, day, columnId, start: t, end: t, dragging: true }, moved: false }
  }
  const move = (e: PointerEvent<HTMLDivElement>, day: number, columnId: string) => {
    const d = drag.current
    if (!d || d.pick.day !== day || d.pick.columnId !== columnId) return
    const t = slotAt(e, day)
    if (t === d.pick.end) return
    d.pick = { ...d.pick, end: t }
    d.moved = true
    setPick(d.pick)
  }
  const up = () => {
    const d = drag.current
    drag.current = undefined
    if (d?.moved) {
      dragged.current = true
      finish(d.pick)
    }
  }
  // Taps are handled on click, the last event of a tap. Handling them earlier (on pointerup) opened the
  // form while the tap was still going, and its click then landed on the form's controls.
  const tap = (e: MouseEvent<HTMLDivElement>, day: number, columnId: string) => {
    if (dragged.current) {
      dragged.current = false
      return
    }
    // The first tap starts a range; a tap in the same column ends it.
    if (!onRange) return
    const t = slotAt(e, day)
    if (pick && pick.day === day && pick.columnId === columnId) finish({ ...pick, end: t })
    else setPick({ scope, day, columnId, start: t, end: t })
  }

  const touchStart = (e: TouchEvent) => {
    const el = scroller.current!
    // Only when the grid fits; otherwise a sideways swipe scrolls it.
    swipe.current = onSwipe && el.scrollWidth <= el.clientWidth ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : undefined
  }
  const touchEnd = (e: TouchEvent) => {
    const s = swipe.current
    swipe.current = undefined
    if (!s) return
    const dx = e.changedTouches[0].clientX - s.x
    const dy = e.changedTouches[0].clientY - s.y
    if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) {
      setPick(undefined)
      // Swiping against the reading direction moves forward: leftward in English, rightward in Hebrew.
      onSwipe!((dx < 0) !== isRtl() ? 1 : -1)
    }
  }

  const multiDay = days.length > 1
  const labelEvery = hourPx >= 16 ? 1 : hourPx >= 9 ? 2 : 3
  const style = {
    '--columns': days.length * columns.length,
    '--hour': `${hourPx}px`,
    '--slot': `${(hourPx * stepMinutes) / 60}px`,
  } as CSSProperties

  return (
    <div className="grid-wrap">
      <div className="grid-scroll" ref={scroller} onTouchStart={touchStart} onTouchEnd={touchEnd}>
        <div className={`grid${multiDay ? ' multi' : ''}`} style={style}>
          <div className="corner" />
          {multiDay && days.map(day => (
            <div key={day} className={`day-head${day <= now && now < addDays(day, 1) ? ' today' : ''}`} style={{ gridColumn: `span ${columns.length}` }}>
              {formatDay(day)}
            </div>
          ))}
          {days.flatMap(day => columns.map((c, i) => (
            <div key={`${day}:${c.id}`} className={`col-head${i === 0 ? ' first' : ''}`} title={c.label}>
              <span className="swatch" style={{ background: c.color }} />
              <span dir="auto">{c.label}</span>
            </div>
          )))}
          <div className="axis" ref={axis}>
            {/* Labels thin out when zoomed far out, so they don't overlap. */}
            {Array.from({ length: 24 }, (_, h) => <div key={h}>{h % labelEvery === 0 && formatHour(days[0] + h * HOUR)}</div>)}
          </div>
          {days.flatMap(day => {
            const end = addDays(day, 1)
            return columns.map((c, i) => {
              const top = (t: number) => hoursIntoDay(Math.max(t, day), end) * hourPx
              const height = (a: number, b: number) => (hoursIntoDay(Math.min(b, end), end) - hoursIntoDay(Math.max(a, day), end)) * hourPx
              const mine = blocks.filter(b => b.columnId === c.id && b.start < end && b.end > day)
              const picked = pick && pick.day === day && pick.columnId === c.id
              return (
                <div
                  key={`${day}:${c.id}`}
                  className={`col${i === 0 ? ' first' : ''}${onRange ? ' pickable' : ''}`}
                  onPointerDown={e => down(e, day, c.id)}
                  onPointerMove={e => move(e, day, c.id)}
                  onPointerUp={up}
                  onClick={e => tap(e, day, c.id)}
                >
                  {now > day && <div className="past" style={{ height: height(day, now) }} />}
                  {mine.map(b => (
                    <div
                      key={b.key}
                      className={`block ${b.kind}${b.onSelect ? ' selectable' : ''}`}
                      // Cards sit 1px apart so back-to-back shifts read as separate; coverage fills its slots.
                      style={{ top: top(b.start) + gap(b), height: height(b.start, b.end) - 2 * gap(b), '--color': b.color } as CSSProperties}
                      onPointerDown={b.onSelect ? e => e.stopPropagation() : undefined}
                      onClick={b.onSelect ? e => { e.stopPropagation(); b.onSelect!() } : undefined}
                      role={b.onSelect ? 'button' : undefined}
                      tabIndex={b.onSelect ? 0 : undefined}
                      onKeyDown={b.onSelect ? e => (e.key === 'Enter' || e.key === ' ') && b.onSelect!() : undefined}
                    >
                      {b.label && <span dir="auto">{b.label}</span>}
                      {b.label && b.end - b.start >= 2 * HOUR && <small>{formatTime(b.start)}–{formatTime(b.end)}</small>}
                    </div>
                  ))}
                  {picked && (
                    <div className="block picking" style={{ top: top(Math.min(pick.start, pick.end)), height: height(Math.min(pick.start, pick.end), Math.max(pick.start, pick.end) + step) }} />
                  )}
                  {now > day && now < end && <div className="now" style={{ top: top(now) }} />}
                </div>
              )
            })
          })}
        </div>
      </div>
    </div>
  )
}
