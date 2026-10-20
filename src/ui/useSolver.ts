import { useCallback, useRef, useState } from 'react'
import { defaultTimeLimitSeconds, solve } from '../engine/solve'
import type { SolveResult, Stage, Workspace } from '../engine/types'
import { planInput } from '../model/plan'

export type SolveState =
  | { phase: 'idle' }
  | { phase: 'running'; from: number; started: number; seconds: number; stage: Stage; best?: number }
  | { phase: 'done'; from: number; result?: SolveResult; error?: string }

/** Runs one solve at a time and keeps its progress and result, so planning continues while the panel is closed. */
export function useSolver() {
  const [state, setState] = useState<SolveState>({ phase: 'idle' })
  const abort = useRef<AbortController>(undefined)

  const start = useCallback(async (workspace: Workspace, from: number, seconds?: number) => {
    abort.current?.abort()
    const controller = (abort.current = new AbortController())
    const total = seconds ?? defaultTimeLimitSeconds(workspace.rules)
    setState({ phase: 'running', from, started: performance.now(), seconds: total, stage: 'balance' })
    let done: SolveState
    try {
      const result = await solve(planInput(workspace, from), {
        from,
        timeLimitSeconds: total,
        // Without cross-origin isolation the WASM build cannot start threads.
        numWorkers: crossOriginIsolated ? Math.min(8, navigator.hardwareConcurrency || 4) : 1,
        signal: controller.signal,
        onProgress: p => setState(s => (s.phase === 'running' ? { ...s, stage: p.stage, best: p.stage !== s.stage ? p.objective : p.objective ?? s.best } : s)),
      })
      done = { phase: 'done', from, result }
    } catch (e) {
      done = controller.signal.aborted ? { phase: 'idle' } : { phase: 'done', from, error: e instanceof Error ? e.message : String(e) }
    }
    if (abort.current === controller) setState(done)
  }, [])

  const cancel = useCallback(() => abort.current?.abort(), [])
  const clear = useCallback(() => {
    abort.current?.abort()
    abort.current = undefined
    setState({ phase: 'idle' })
  }, [])

  return { state, start, cancel, clear }
}
