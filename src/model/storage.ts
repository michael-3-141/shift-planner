import { useCallback, useEffect, useRef, useState } from 'react'
import type { Workspace } from '../engine/types'
import { t } from '../i18n'
import { defaultRules, emptyWorkspace } from './workspace'

// The workspace lives in IndexedDB as one record.

const DB_NAME = 'shift-planner'
const STORE = 'workspace'
const KEY = 'current'

function request<T>(r: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

let db: Promise<IDBDatabase> | undefined
function openDb() {
  db ??= (() => {
    const r = indexedDB.open(DB_NAME, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    return request(r)
  })()
  return db
}

async function load(): Promise<Workspace | undefined> {
  const store = (await openDb()).transaction(STORE).objectStore(STORE)
  return request<Workspace | undefined>(store.get(KEY))
}

async function save(workspace: Workspace) {
  const store = (await openDb()).transaction(STORE, 'readwrite').objectStore(STORE)
  await request(store.put(workspace, KEY))
}

export type Update = (change: (w: Workspace) => Workspace) => void

/** The stored workspace (undefined while loading), an updater, and the last storage error if any. */
export function useStoredWorkspace(): [Workspace | undefined, Update, string | undefined] {
  const [workspace, setWorkspace] = useState<Workspace>()
  const [error, setError] = useState<string>()
  const loaded = useRef(false)

  useEffect(() => {
    load()
      // Workspaces saved before rules became a list of constraints get the default rules.
      .then(w => setWorkspace(!w ? emptyWorkspace() : Array.isArray(w.rules?.constraints) ? w : { ...w, rules: defaultRules() }))
      .catch(e => {
        setError(t().app.storageUnavailable(String(e)))
        setWorkspace(emptyWorkspace())
      })
  }, [])

  useEffect(() => {
    if (!workspace) return
    // Skip saving what was just loaded.
    if (!loaded.current) {
      loaded.current = true
      return
    }
    // Saved on every change: the record is small and IndexedDB applies writes in order.
    save(workspace).then(() => setError(undefined), e => setError(t().app.savingFailed(String(e))))
  }, [workspace])

  const update = useCallback<Update>(change => setWorkspace(w => (w ? change(w) : w)), [])
  return [workspace, update, error]
}
