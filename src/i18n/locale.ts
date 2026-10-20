// Display preferences for this device: the interface language and the 12/24-hour clock. Both are by the
// browser's language until chosen otherwise. Changing either re-renders the app, since text and times are
// produced in place everywhere.

export type Language = 'en' | 'he'
export type LanguageChoice = 'auto' | Language
export type HourCycle = 'auto' | '12' | '24'

const LANGUAGE_KEY = 'language'
const HOUR_CYCLE_KEY = 'hour-cycle'

function load<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const saved = globalThis.localStorage?.getItem(key)
    if (saved && (allowed as readonly string[]).includes(saved)) return saved as T
  } catch {
    // Storage may be unavailable; use the browser's language.
  }
  return fallback
}

function save(key: string, value: string, fallback: string) {
  try {
    if (value === fallback) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Remembering the choice is only a convenience.
  }
}

const browserLanguage = () => globalThis.navigator?.language ?? 'en'

let languageChoice = load<LanguageChoice>(LANGUAGE_KEY, ['en', 'he'], 'auto')
let hourCycleChoice = load<HourCycle>(HOUR_CYCLE_KEY, ['12', '24'], 'auto')
let version = 0
const listeners = new Set<() => void>()

export const getLanguageChoice = () => languageChoice
export const getHourCycle = () => hourCycleChoice

/** Hebrew for a Hebrew browser (old browsers say "iw"), English otherwise. */
export const language = (): Language => (languageChoice !== 'auto' ? languageChoice : /^(he|iw)\b/i.test(browserLanguage()) ? 'he' : 'en')

/** The locale for dates and numbers: Israeli Hebrew, or the browser's own English variant. */
export const locale = () => (language() === 'he' ? 'he-IL' : /^en\b/i.test(browserLanguage()) ? browserLanguage() : 'en')

export const isRtl = () => language() === 'he'

/** Changes on every preference change, for useSyncExternalStore. */
export const getDisplayVersion = () => version

export function subscribeDisplay(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function changed() {
  version++
  applyToDocument()
  listeners.forEach(listener => listener())
}

export function setLanguageChoice(choice: LanguageChoice) {
  save(LANGUAGE_KEY, choice, 'auto')
  languageChoice = choice
  changed()
}

export function setHourCycle(choice: HourCycle) {
  save(HOUR_CYCLE_KEY, choice, 'auto')
  hourCycleChoice = choice
  changed()
}

/** The page's language and direction; index.html sets them before the first paint by the same rule. */
export function applyToDocument() {
  if (typeof document === 'undefined') return
  document.documentElement.lang = language()
  document.documentElement.dir = isRtl() ? 'rtl' : 'ltr'
}
