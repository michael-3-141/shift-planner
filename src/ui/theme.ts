// Light or dark, chosen per device; until chosen, it follows the operating system, even while the app is open.
// index.html applies the saved choice before the first paint, so pages don't flash the wrong theme.

export type ThemeChoice = 'system' | 'light' | 'dark'

const KEY = 'theme'
const prefersLight = matchMedia('(prefers-color-scheme: light)')

export function loadTheme(): ThemeChoice {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // Storage may be unavailable; fall back to the system.
  }
  return 'system'
}

function apply(choice: ThemeChoice) {
  const light = choice === 'light' || (choice === 'system' && prefersLight.matches)
  document.documentElement.dataset.theme = light ? 'light' : 'dark'
}

export function setTheme(choice: ThemeChoice) {
  try {
    localStorage.setItem(KEY, choice)
  } catch {
    // Remembering the theme is only a convenience.
  }
  apply(choice)
}

prefersLight.addEventListener('change', () => apply(loadTheme()))
apply(loadTheme())
