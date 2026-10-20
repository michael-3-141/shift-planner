import { useState, type CSSProperties } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import type { Interval, Shift, Workspace } from '../engine/types'
import { t } from '../i18n'
import { isRtl } from '../i18n/locale'
import { addDays, formatDay, formatHour, formatTime, HOUR, hoursIntoDay, startOfWeek, toInputValue } from '../model/time'
import { Sheet } from './Sheet'

// Exports the accepted schedule for the workspace's dates (or the week on screen when it has none), as a
// timeline image or an Excel workbook. Both libraries load only when used.

/** What gets exported: the workspace's dates, or the week containing `day`. */
function exportRange(workspace: Workspace, day: number): Interval {
  if (workspace.period) return workspace.period
  const start = startOfWeek(day)
  return { start, end: addDays(start, 7) }
}

const shiftsIn = (workspace: Workspace, range: Interval) =>
  workspace.shifts.filter(s => s.start < range.end && s.end > range.start).sort((a, b) => a.start - b.start)

const dateValue = (t: number) => toInputValue(t).slice(0, 10)
const fileName = (range: Interval, extension: string) =>
  `${t().export.fileName}-${dateValue(range.start)}-${dateValue(addDays(range.end, -1))}.${extension}`

function download(url: string, name: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
}

/** Spreadsheet column letters: 1 → A, 27 → AA. */
function columnLetter(n: number) {
  let s = ''
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

/**
 * A person's colour softened halfway to white, for spreadsheet fills. The default palette then comes out as
 * the Office pastels of the old reports (light blue, peach, pink, light green, pale yellow) with black text.
 */
function pastel(color: string) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color)
  if (!m) return color
  return `#${m.slice(1).map(h => Math.round((parseInt(h, 16) + 255) / 2).toString(16).padStart(2, '0')).join('')}`
}

/** Black or white, whichever reads better on a #rrggbb fill. */
function textOn(fill: string) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(fill)
  if (!m) return '#000000'
  const [r, g, b] = m.slice(1).map(h => parseInt(h, 16))
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#000000' : '#ffffff'
}

// Colours and borders of the timeline reports the planner's first, script-based version produced.
const NAVY = '#1F3864'
const GRID = '#808080'
const header = { fontWeight: 'bold' as const, textColor: '#ffffff', backgroundColor: NAVY, align: 'center' as const, alignVertical: 'center' as const, borderStyle: 'thin' as const, borderColor: GRID }
const cellBase = { align: 'center' as const, alignVertical: 'center' as const, borderStyle: 'thin' as const, borderColor: GRID }
const dayStart = { leftBorderStyle: 'thick' as const, leftBorderColor: '#000000' }
const dayEnd = { rightBorderStyle: 'thick' as const, rightBorderColor: '#000000' }

/**
 * A timeline workbook: one row per planning step, a column per position on each day, each cell holding the
 * person on duty in their colour. A summary sheet counts the cells with formulas, so it follows edits.
 */
async function exportExcel(workspace: Workspace, range: Interval) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const m = t().export
  const { people, positions, rules } = workspace
  const step = rules.stepMinutes
  const shifts = shiftsIn(workspace, range)
  const days: number[] = []
  for (let day = range.start; day < range.end; day = addDays(day, 1)) days.push(day)
  const P = positions.length
  const lastColumn = 1 + days.length * P
  const pad = (n: number) => String(n).padStart(2, '0')
  const clock = (minutes: number) => (step >= 60 ? pad(Math.floor(minutes / 60) % 24) : `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`)
  // Slots follow the wall clock from midnight, as the schedule does.
  const slotTime = (day: number, slot: number) => { const d = new Date(day); d.setMinutes(slot * step); return d.getTime() }
  const slots = (24 * 60) / step
  // A thick line where each day starts, and one closing the last day; none between a day's positions.
  // Excel mirrors borders itself in right-to-left sheets, so the left border is right in either direction.
  const edge = (d: number, i: number) => ({ ...(i === 0 ? dayStart : {}), ...(d === days.length - 1 && i === P - 1 ? dayEnd : {}) })

  const legend = [{ ...header, value: m.columns.key }, ...people.map(p => ({ ...cellBase, fontWeight: 'bold' as const, value: p.name, backgroundColor: pastel(p.color), textColor: textOn(pastel(p.color)) }))]
  const dayRow = [
    { ...header, value: m.columns.time, rowSpan: 2 },
    ...days.flatMap((day, d) => positions.map((_, i) => (i === 0 ? { ...header, ...edge(d, i), value: formatDay(day), columnSpan: P } : null))),
  ]
  const positionRow = [null, ...days.flatMap((_, d) => positions.map((p, i) => ({ ...header, ...edge(d, i), value: p.name })))]
  const timeRows = Array.from({ length: slots }, (_, slot) => [
    { ...header, value: `${clock(slot * step)}–${clock((slot + 1) * step)}` },
    ...days.flatMap((day, d) => positions.map((p, i) => {
      const at = slotTime(day, slot)
      const border = edge(d, i)
      const shift = shifts.find(s => s.positionId === p.id && s.start <= at && at < s.end)
      const who = shift && people.find(x => x.id === shift.personId)
      if (who) return { ...cellBase, ...border, value: who.name, backgroundColor: pastel(who.color), textColor: textOn(pastel(who.color)) }
      const needed = workspace.coverage.some(c => c.positionId === p.id && c.start <= at && at < c.end)
      return needed ? { ...cellBase, ...border, value: '—', textColor: '#666666', backgroundColor: '#E7E6E6' } : { ...cellBase, ...border, value: '' }
    })),
  ])
  const note = [{ value: m.note(t().settings.stepLabel(step)), fontStyle: 'italic' as const, textColor: '#555555', columnSpan: lastColumn, wrap: true }]

  // The summary counts timeline cells, as the old reports did: hours per position, then weighted load.
  // Formulas are written without the leading "=", as the file format stores them.
  const firstRow = 5
  const area = `'${m.sheets.timeline.replace(/'/g, "''")}'!$B$${firstRow}:$${columnLetter(lastColumn)}$${firstRow + slots - 1}`
  const perCell = step / 60
  const summaryRows = people.map((p, i) => {
    const row = i + 2
    const byPosition = positions.map((_, k) => ({
      type: 'Formula' as const, value: `SUMPRODUCT((${area}=$A${row})*(MOD(COLUMN(${area})-2,${P})=${k}))*${perCell}`, align: 'center' as const,
    }))
    const load = positions.map((pos, k) => `${columnLetter(3 + k)}${row}*${pos.weight}`).join('+')
    return [
      { ...cellBase, value: p.name, backgroundColor: pastel(p.color), textColor: textOn(pastel(p.color)), fontWeight: 'bold' as const },
      { type: 'Formula' as const, value: `COUNTIF(${area},$A${row})*${perCell}`, align: 'center' as const },
      ...byPosition,
      { type: 'Formula' as const, value: `${load || 0}`, align: 'center' as const },
    ]
  })

  const sheetDirection = { rightToLeft: isRtl() }
  await writeXlsxFile([
    {
      ...sheetDirection, sheet: m.sheets.timeline, showGridLines: false, orientation: 'landscape', stickyRowsCount: 4, stickyColumnsCount: 1,
      data: [legend, [], dayRow, positionRow, ...timeRows, [], note],
      columns: [{ width: 12 }, ...Array.from({ length: lastColumn - 1 }, () => ({ width: 10 }))],
    },
    {
      ...sheetDirection, sheet: m.sheets.summary, stickyRowsCount: 1,
      data: [[m.columns.person, m.columns.hours, ...positions.map(p => m.columns.positionHours(p.name)), m.columns.workload].map(value => ({ ...header, value })), ...summaryRows],
      columns: [{ width: 18 }, { width: 10 }, ...positions.map(() => ({ width: 14 })), { width: 12 }],
    },
  ], { features: [RECALCULATE_ON_OPEN] }).toFile(fileName(range, 'xlsx'))
}

/** The formulas carry no saved results, so spreadsheet apps are asked to work them out when the file opens. */
const RECALCULATE_ON_OPEN = {
  files: {
    transform: {
      'xl/workbook.xml': {
        transform: (xml: string) => xml.includes('<calcPr')
          ? xml.replace('<calcPr', '<calcPr fullCalcOnLoad="1"')
          : xml.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>'),
      },
    },
  },
}

const HOUR_PX = 20

/** The timeline drawn for the image: weeks stacked, light colours, nothing interactive. */
function ExportTimeline({ workspace, range, shifts }: { workspace: Workspace; range: Interval; shifts: Shift[] }) {
  const { positions, people } = workspace
  const person = new Map(people.map(p => [p.id, p]))
  const weeks: number[][] = []
  for (let day = range.start; day < range.end; day = addDays(day, 1)) {
    if (!weeks.length || weeks[weeks.length - 1].length === 7) weeks.push([])
    weeks[weeks.length - 1].push(day)
  }
  return (
    <div className="export" dir={isRtl() ? 'rtl' : 'ltr'}>
      <h1>{t().app.title}</h1>
      <p>{t().common.range(formatDay(range.start), formatDay(addDays(range.end, -1)))}</p>
      <div className="export-legend">
        {people.map(p => <span key={p.id}><i style={{ background: p.color }} /><span dir="auto">{p.name}</span></span>)}
      </div>
      {weeks.map(days => (
        <div key={days[0]} className="export-week multi" style={{ '--columns': days.length * positions.length, '--hour': `${HOUR_PX}px` } as CSSProperties}>
          <div className="corner" />
          {days.map(day => <div key={day} className="day-head" style={{ gridColumn: `span ${positions.length}` }}>{formatDay(day)}</div>)}
          {days.flatMap(day => positions.map((p, i) => <div key={`${day}${p.id}`} className={`col-head${i === 0 ? ' first' : ''}`} dir="auto">{p.name}</div>))}
          <div className="axis">
            {Array.from({ length: 24 }, (_, h) => <div key={h}>{h % 3 === 0 && h > 0 && formatHour(days[0] + h * HOUR)}</div>)}
          </div>
          {days.flatMap(day => {
            const end = addDays(day, 1)
            return positions.map((p, i) => (
              <div key={`${day}${p.id}`} className={`col${i === 0 ? ' first' : ''}`}>
                {shifts.filter(s => s.positionId === p.id && s.start < end && s.end > day).map(s => {
                  const top = hoursIntoDay(Math.max(s.start, day), end) * HOUR_PX
                  const height = hoursIntoDay(Math.min(s.end, end), end) * HOUR_PX - top
                  const who = person.get(s.personId)
                  return (
                    <div key={s.id} className="block" style={{ top: top + 1, height: height - 2, '--color': who?.color } as CSSProperties}>
                      <span dir="auto">{who?.name}</span>
                      {height >= 34 && <small>{formatTime(s.start)}–{formatTime(s.end)}</small>}
                    </div>
                  )
                })}
              </div>
            ))
          })}
        </div>
      ))}
    </div>
  )
}

async function exportImage(workspace: Workspace, range: Interval) {
  const { toPng } = await import('html-to-image')
  // Drawn off screen at a fixed size, captured, then removed.
  const host = document.createElement('div')
  host.style.cssText = 'position: fixed; top: 0; left: -100000px;'
  document.body.append(host)
  const root = createRoot(host)
  try {
    flushSync(() => root.render(<ExportTimeline workspace={workspace} range={range} shifts={shiftsIn(workspace, range)} />))
    const url = await toPng(host.firstElementChild as HTMLElement, { pixelRatio: 2, backgroundColor: '#ffffff', skipFonts: true })
    download(url, fileName(range, 'png'))
  } finally {
    root.unmount()
    host.remove()
  }
}

export function ExportSheet({ workspace, day, hasDraft, onClose }: { workspace: Workspace; day: number; hasDraft: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState<'image' | 'excel'>()
  const [error, setError] = useState<string>()
  const m = t().export
  const range = exportRange(workspace, day)
  const empty = shiftsIn(workspace, range).length === 0
  const run = async (kind: 'image' | 'excel') => {
    setBusy(kind)
    setError(undefined)
    try {
      await (kind === 'image' ? exportImage(workspace, range) : exportExcel(workspace, range))
    } catch (e) {
      setError(m.failed(e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(undefined)
    }
  }
  return (
    <Sheet title={m.title} onClose={onClose}>
      <div className="form">
        <p className="hint">
          {m.covers(t().common.range(formatDay(range.start), formatDay(addDays(range.end, -1))))}
          {hasDraft && ` ${m.draftNote}`}
        </p>
        {empty && <p className="error">{m.noShifts}</p>}
        <div className="export-choices">
          <button disabled={empty || !!busy} onClick={() => run('image')}>
            <b>{busy === 'image' ? m.working : m.image}</b>
            <span>{m.imageHint}</span>
          </button>
          <button disabled={empty || !!busy} onClick={() => run('excel')}>
            <b>{busy === 'excel' ? m.working : m.excel}</b>
            <span>{m.excelHint}</span>
          </button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </Sheet>
  )
}
