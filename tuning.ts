import { CONFIG, DEFAULT_CONFIG } from './config'

type Mode = 'LIVE' | 'NEXT_ACTION' | 'NEXT_RUN'
type Control = {
  id: string; type: 'number'; category: string; label: string; description: string; unit: string
  default: number; min: number; max: number; step: number; applyMode: Mode; integrity: 'COSMETIC' | 'GAMEPLAY'
}
type Binding = { control: Control; read(): number; write(value: number): void }

const bindings: Binding[] = []
const CATEGORY: Record<string, string> = { player: 'الحركة', camera: 'الكاميرا', world: 'العالم', mobs: 'الكائنات' }

function number<S extends keyof typeof CONFIG>(section: S, key: keyof typeof CONFIG[S] & string,
  label: string, min: number, max: number, step: number, unit: string): void {
  const values = CONFIG[section] as unknown as Record<string, number>
  const defaults = DEFAULT_CONFIG[section] as unknown as Record<string, number>
  bindings.push({
    control: Object.freeze({
      id: `${section}.${key}`, type: 'number', category: CATEGORY[section], label, description: 'يتحدّث في المعاينة فوراً.', unit,
      default: defaults[key], min, max, step, applyMode: 'LIVE', integrity: section === 'camera' ? 'COSMETIC' : 'GAMEPLAY',
    }),
    read: () => values[key], write: value => { values[key] = value },
  })
}

number('player', 'walkSpeed', 'سرعة المشي', 1, 12, 0.5, 'م/ث')
number('player', 'sprintSpeed', 'سرعة الجري', 1, 16, 0.5, 'م/ث')
number('player', 'jumpSpeed', 'قوة القفز', 4, 16, 0.5, 'م/ث')
number('player', 'gravity', 'الجاذبية', 12, 50, 1, '')
number('player', 'flySpeed', 'سرعة الطيران', 4, 40, 1, 'م/ث')
number('player', 'reach', 'مدى الوصول', 3, 8, 0.5, 'مكعب')
number('camera', 'fov', 'زاوية الرؤية', 50, 110, 1, '°')
number('world', 'dayLength', 'طول اليوم', 60, 3600, 60, 'ث')
number('mobs', 'maxHostile', 'أقصى عدد للوحوش', 0, 15, 1, '')
number('mobs', 'maxPassive', 'أقصى عدد للحيوانات', 0, 20, 1, '')

const byId = new Map(bindings.map(b => [b.control.id, b]))
let requested = Object.fromEntries(bindings.map(({ control }) => [control.id, control.default]))
const valid = (v: Record<string, number>) => v['player.walkSpeed'] <= v['player.sprintSpeed']
let unranked = false
const modified = () => bindings.some(b => b.control.integrity === 'GAMEPLAY' && b.read() !== b.control.default)

export const tuning = {
  get unranked(): boolean { return unranked },
  controls: Object.freeze(bindings.map(b => b.control)),
  read() {
    return { requested: { ...requested }, active: Object.fromEntries(bindings.map(b => [b.control.id, b.read()])) }
  },
  apply(patch: unknown): void {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid patch')
    const entries = Object.entries(patch)
    if (entries.length > bindings.length) throw new Error('Invalid patch')
    for (const [id, value] of entries) {
      const control = byId.get(id)?.control
      if (!control || typeof value !== 'number' || !Number.isFinite(value) || value < control.min || value > control.max) throw new Error('Invalid value')
      const steps = (value - control.min) / control.step
      if (value !== control.default && Math.abs(steps - Math.round(steps)) > 1e-7) throw new Error('Invalid increment')
    }
    const candidate = { ...requested, ...patch } as Record<string, number>
    const nextActive = this.read().active as Record<string, number>
    for (const [id, value] of entries) nextActive[id] = value as number
    if (!valid(candidate) || !valid(nextActive)) throw new Error('سرعة المشي يجب ألا تتجاوز سرعة الجري')
    requested = candidate
    for (const [id, value] of entries) byId.get(id)!.write(value as number)
    unranked ||= modified()
  },
}
