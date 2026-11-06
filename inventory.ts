import { ITEMS } from '../core/blocks'

export interface Slot { id: number; n: number; dur?: number }

const slotOf = (value: unknown): Slot | null => {
  if (!Array.isArray(value) || !Number.isInteger(value[0]) || !Number.isInteger(value[1]) || value[1] <= 0 || !ITEMS[value[0]]) return null
  const id = value[0] as number
  return { id, n: Math.min(ITEMS[id].stack, value[1] as number), dur: ITEMS[id].tool ? Math.max(1, Number(value[2]) || ITEMS[id].tool!.durability) : undefined }
}

export class Inventory {
  slots: (Slot | null)[] = new Array(36).fill(null)
  armor: (Slot | null)[] = new Array(4).fill(null)
  selected = 0
  onChange: (() => void) | null = null

  get held(): Slot | null { return this.slots[this.selected] }
  get heldId(): number { return this.slots[this.selected]?.id ?? 0 }
  get armorValue(): number { return this.armor.reduce((sum, slot) => sum + (slot ? ITEMS[slot.id]?.armor ?? 0 : 0), 0) }

  add(id: number, n: number): number {
    const def = ITEMS[id]
    if (!def) return n
    const max = def.stack
    for (let i = 0; i < 36 && n > 0; i += 1) {
      const s = this.slots[i]
      if (s && s.id === id && s.n < max && !def.tool) {
        const take = Math.min(max - s.n, n)
        s.n += take
        n -= take
      }
    }
    for (let i = 0; i < 36 && n > 0; i += 1) {
      if (!this.slots[i]) {
        const take = Math.min(max, n)
        this.slots[i] = { id, n: take, dur: def.tool?.durability }
        n -= take
      }
    }
    this.onChange?.()
    return n
  }

  count(id: number): number {
    let c = 0
    for (const s of this.slots) if (s && s.id === id) c += s.n
    return c
  }

  consumeHeld(n = 1): void {
    const s = this.slots[this.selected]
    if (!s) return
    s.n -= n
    if (s.n <= 0) this.slots[this.selected] = null
    this.onChange?.()
  }

  consume(id: number, n = 1): boolean {
    if (this.count(id) < n) return false
    let left = n
    for (let i = 0; i < this.slots.length && left > 0; i += 1) {
      const s = this.slots[i]
      if (!s || s.id !== id) continue
      const take = Math.min(s.n, left)
      s.n -= take; left -= take
      if (s.n <= 0) this.slots[i] = null
    }
    this.onChange?.()
    return left === 0
  }

  /** Use up tool durability; returns true when the selected tool broke. */
  wearHeld(amount = 1): boolean {
    const s = this.slots[this.selected]
    if (!s || s.dur === undefined) return false
    s.dur -= amount
    if (s.dur <= 0) { this.slots[this.selected] = null; this.onChange?.(); return true }
    this.onChange?.()
    return false
  }

  wearArmor(amount = 1): void {
    let changed = false
    for (let i = 0; i < this.armor.length; i += 1) {
      const slot = this.armor[i]
      if (!slot || slot.dur === undefined) continue
      slot.dur -= amount
      if (slot.dur <= 0) this.armor[i] = null
      changed = true
    }
    if (changed) this.onChange?.()
  }

  serialize(): unknown {
    const pack = (s: Slot | null) => s ? [s.id, s.n, s.dur ?? 0] : null
    return { sel: this.selected, slots: this.slots.map(pack), armor: this.armor.map(pack) }
  }

  load(data: { sel?: number; slots?: (number[] | null)[]; armor?: (number[] | null)[] } | undefined): void {
    if (!data) return
    this.selected = Math.max(0, Math.min(8, Number(data.sel) || 0))
    this.slots = new Array(36).fill(null)
    for (const [i, value] of (data.slots ?? []).entries()) if (i < 36) this.slots[i] = slotOf(value)
    this.armor = new Array(4).fill(null)
    for (const [i, value] of (data.armor ?? []).entries()) {
      if (i >= 4) break
      const slot = slotOf(value)
      const expected = ['head', 'chest', 'legs', 'feet'][i]
      if (slot && ITEMS[slot.id]?.armorSlot === expected) this.armor[i] = slot
    }
    this.onChange?.()
  }
}
