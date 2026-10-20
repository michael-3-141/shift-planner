import { getDisplayVersion, getHourCycle, language, locale } from '../i18n/locale'

// The engine works in epoch milliseconds; the UI shows and enters local time.

export const MINUTE = 60_000
export const HOUR = 60 * MINUTE

export function startOfDay(t: number) {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Adds calendar days, so a day across a daylight-saving change is still midnight to midnight. */
export function addDays(t: number, days: number) {
  const d = new Date(t)
  d.setDate(d.getDate() + days)
  return d.getTime()
}

interface WeekInfo { firstDay: number; weekend: number[] }

/** The language's first day of the week and weekend, as Date.getDay() numbers (0 = Sunday). */
export function week() {
  // Not every browser has week info yet; Monday-first with a Saturday–Sunday weekend is the fallback,
  // except for Hebrew, whose week starts on Sunday with a Friday–Saturday weekend.
  const lang = new Intl.Locale(locale()) as Intl.Locale & { getWeekInfo?(): WeekInfo; weekInfo?: WeekInfo }
  const fallback = language() === 'he' ? { firstDay: 7, weekend: [5, 6] } : { firstDay: 1, weekend: [6, 7] }
  const info = lang.getWeekInfo?.() ?? lang.weekInfo ?? fallback
  const firstDay = info.firstDay % 7
  const weekend = info.weekend.map(d => d % 7)
  const days = Array.from({ length: 7 }, (_, i) => (firstDay + i) % 7)
  return { firstDay, days, workdays: days.filter(d => !weekend.includes(d)) }
}

/** The first day of the language's week containing t. */
export function startOfWeek(t: number) {
  const day = startOfDay(t)
  return addDays(day, -((new Date(day).getDay() - week().firstDay + 7) % 7))
}

/** Short weekday name for a Date.getDay() number. */
export const weekdayName = (day: number) => formats().weekday.format(new Date(2026, 0, 4 + day))

/** Snap to the step grid, counted from local midnight. */
export function snap(t: number, stepMinutes: number, mode: 'round' | 'floor' | 'ceil' = 'round') {
  const day = startOfDay(t)
  const step = stepMinutes * MINUTE
  return day + Math[mode]((t - day) / step) * step
}

export const onGrid = (t: number, stepMinutes: number) => snap(t, stepMinutes) === t

const pad = (n: number) => String(n).padStart(2, '0')

/** Value for <input type="datetime-local">. */
export function toInputValue(t: number) {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Parses a datetime-local value as local time; NaN when empty or invalid. */
export const fromInputValue = (value: string) => (value ? new Date(value).getTime() : NaN)

// Formats follow the interface language and clock choice, rebuilt only when those change.

/** Whether the language writes times in 24-hour form. */
export const localeUses24h = () => /h2[34]/.test(new Intl.DateTimeFormat(locale(), { hour: 'numeric' }).resolvedOptions().hourCycle ?? '')

function buildFormats() {
  const cycle = getHourCycle()
  const h24 = cycle === '24' || (cycle === 'auto' && localeUses24h())
  const clock = h24
    ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } as const
    : { hour: 'numeric', minute: '2-digit', hourCycle: 'h12' } as const
  const lang = locale()
  return {
    day: new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'short' }),
    weekday: new Intl.DateTimeFormat(lang, { weekday: 'short' }),
    time: new Intl.DateTimeFormat(lang, clock),
    // Hour labels: "06:00" in 24-hour form, "6 AM" in 12-hour form.
    hour: new Intl.DateTimeFormat(lang, h24 ? clock : { hour: 'numeric', hourCycle: 'h12' }),
    dateTime: new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'short', ...clock }),
    hours: new Intl.NumberFormat(lang, { style: 'unit', unit: 'hour', unitDisplay: 'short', maximumFractionDigits: 1 }),
  }
}

let built: { version: number; formats: ReturnType<typeof buildFormats> } | undefined
const formats = () => {
  if (built?.version !== getDisplayVersion()) built = { version: getDisplayVersion(), formats: buildFormats() }
  return built.formats
}

export const formatDay = (t: number) => formats().day.format(t)
export const formatTime = (t: number) => formats().time.format(t)
export const formatHour = (t: number) => formats().hour.format(t)
export const formatDateTime = (t: number) => formats().dateTime.format(t)
export const formatRange = (start: number, end: number) => formats().dateTime.formatRange(start, end)

/** Minutes as hours, e.g. "12.5 hr" or "12.5 ש׳". */
export const formatHours = (minutes: number) => formats().hours.format(minutes / 60)


/** Whole calendar days from the day of a to the day of b. */
export const daysBetween = (a: number, b: number) => Math.round((startOfDay(b) - startOfDay(a)) / (24 * HOUR))

/**
 * Hours on the wall clock from the start of the day to t, which lies within the day ending at `end`.
 * Schedules lay out rows by the clock, so days with a daylight-saving change still line up with the hour labels.
 */
export function hoursIntoDay(t: number, end: number) {
  if (t >= end) return 24
  const d = new Date(t)
  return d.getHours() + d.getMinutes() / 60
}
