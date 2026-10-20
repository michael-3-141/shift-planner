import { en, type Messages } from './en'
import { he } from './he'
import { language } from './locale'

/** The interface text in the current language. Components call it while rendering, so it follows changes. */
export const t = (): Messages => (language() === 'he' ? he : en)
