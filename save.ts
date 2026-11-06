import { DEFAULT_BINDINGS, DEFAULT_GAMEPAD_BINDINGS, type ControlAction, type ControllerAction } from './input'

export interface SavedServer { name: string; url: string }

export interface Settings {
  renderDistance: number
  sensitivity: number
  volume: number
  music: boolean
  fov: number
  playerName: string
  showStats: boolean
  invertY: boolean
  serverUrl: string
  room: string
  controls: Record<ControlAction, string>
  controllerBindings: Record<ControllerAction, number>
  servers: SavedServer[]
}

export interface SavedWorld {
  seed: number
  mode: 'survival' | 'creative'
  time: number
  player: { x: number; y: number; z: number; yaw: number; pitch: number; health: number; hunger: number; flying: boolean }
  spawn: { x: number; y: number; z: number }
  inventory: unknown
  edits: [number, [number, number][]][]
  /** Chest inventories keyed by world coordinate; added without changing old saves. */
  containers?: [string, (number[] | null)[]][]
  /** Tamed hatchlings are retained across local saves. */
  pets?: { x: number; y: number; z: number; yaw: number; tamed: boolean; growth: number }[]
  playedSeconds: number
  savedAt: number
  dimension?: 'overworld' | 'end'
  returnWorld?: SavedWorld
}

const SKEY = 'blocklands.settings.v1'
const DB = 'blocklands'
const STORE = 'worlds'

export const defaultSettings = (): Settings => ({
  renderDistance: matchMedia('(pointer: coarse)').matches ? 4 : 6,
  sensitivity: 1,
  volume: 0.7,
  music: true,
  fov: 75,
  playerName: '',
  showStats: false,
  invertY: false,
  serverUrl: '',
  room: '',
  controls: { ...DEFAULT_BINDINGS },
  controllerBindings: { ...DEFAULT_GAMEPAD_BINDINGS },
  servers: [],
})

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SKEY)
    if (raw) {
      const loaded = JSON.parse(raw) as Partial<Settings>
      const base = defaultSettings()
      const controllerBindings = { ...DEFAULT_GAMEPAD_BINDINGS, ...(loaded.controllerBindings ?? {}) }
      for (const action of Object.keys(controllerBindings) as ControllerAction[]) {
        if (!Number.isInteger(controllerBindings[action]) || controllerBindings[action] < -1 || controllerBindings[action] > 31) controllerBindings[action] = DEFAULT_GAMEPAD_BINDINGS[action]
      }
      return { ...base, ...loaded, controls: { ...DEFAULT_BINDINGS, ...(loaded.controls ?? {}) }, controllerBindings, servers: Array.isArray(loaded.servers) ? loaded.servers.filter(v => v && typeof v.name === 'string' && typeof v.url === 'string') : [] }
    }
  } catch { /* ignore */ }
  return defaultSettings()
}

export function saveSettings(s: Settings): void {
  try { localStorage.setItem(SKEY, JSON.stringify(s)) } catch { /* ignore */ }
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

export async function loadWorld(slot: string): Promise<SavedWorld | null> {
  try {
    const db = await open()
    return await new Promise(resolve => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(slot)
      req.onsuccess = () => resolve((req.result as SavedWorld) ?? null)
      req.onerror = () => resolve(null)
    })
  } catch { return null }
}

export async function saveWorld(slot: string, data: SavedWorld): Promise<boolean> {
  try {
    const db = await open()
    return await new Promise(resolve => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(data, slot)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
      tx.onabort = () => resolve(false)
    })
  } catch { return false }
}

export async function deleteWorld(slot: string): Promise<void> {
  try {
    const db = await open()
    await new Promise<void>(resolve => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(slot)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch { /* ignore */ }
}
