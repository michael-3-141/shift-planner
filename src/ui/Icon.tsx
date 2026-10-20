// Line icons on a 24px grid, drawn with the current text color.

const PATHS = {
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  totals: 'M3 21h18M6 17v-6M11 17V5M16 17v-9M21 17v-3',
  team: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  settings: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  sparkles: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z',
  person: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  layers: 'M12 3l9 4.5-9 4.5-9-4.5zM3 12l9 4.5 9-4.5M3 16.5l9 4.5 9-4.5',
  off: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8',
  more: 'M4.5 12a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M10.5 12a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M16.5 12a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  fit: 'M12 3v6M9 6l3 3 3-3M12 21v-6M9 18l3-3 3 3M4 12h16',
  left: 'M15 18l-6-6 6-6',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  check: 'M20 6L9 17l-5-5',
  right: 'M9 18l6-6-6-6',
  close: 'M18 6L6 18M6 6l12 12',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6',
  download: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  upload: 'M12 15V3M7 8l5-5 5 5M4 21h16',
}

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon-svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  )
}
