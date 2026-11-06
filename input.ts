export type ControlAction = 'forward' | 'backward' | 'left' | 'right' | 'jump' | 'sprint' | 'sneak' | 'pause' | 'inventory' | 'chat' | 'drop'
export const DEFAULT_BINDINGS: Record<ControlAction, string> = {
  forward: 'KeyW', backward: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', sprint: 'ControlLeft', sneak: 'ShiftLeft',
  pause: 'Escape', inventory: 'KeyE', chat: 'KeyT', drop: 'KeyQ',
}

export type ControllerAction = 'jump' | 'sprint' | 'sneak' | 'attack' | 'place' | 'pause' | 'inventory' | 'chat' | 'drop' | 'slot1' | 'slot2' | 'slot3' | 'slot4' | 'slot5' | 'slot6' | 'slot7' | 'slot8' | 'slot9'
export const DEFAULT_GAMEPAD_BINDINGS: Record<ControllerAction, number> = {
  jump: 0, sprint: 10, sneak: 8, attack: 7, place: 6, pause: 9, inventory: 3, chat: 2, drop: 1,
  slot1: 12, slot2: 13, slot3: 14, slot4: 15, slot5: 4, slot6: 5, slot7: -1, slot8: -1, slot9: -1,
}

export class Input {
  keys = new Set<string>()
  lookDX = 0
  lookDY = 0
  attackHeld = false
  placePressed = false
  touchMoveX = 0
  touchMoveY = 0
  touchJump = false
  touchAttack = false
  touchSprint = false
  /** Normalized controller movement axes; positive forward is up on the stick. */
  gamepadMoveX = 0
  gamepadMoveY = 0
  /** Controller look deltas, accumulated until consumeLook() is called. */
  gamepadLookDX = 0
  gamepadLookDY = 0
  gamepadJump = false
  gamepadSprint = false
  gamepadSneak = false
  gamepadAttack = false
  gamepadPlace = false
  sensitivity = 1
  locked = false
  isTouch = false
  enabled = false
  bindings: Record<ControlAction, string> = { ...DEFAULT_BINDINGS }
  controllerBindings: Record<ControllerAction, number> = { ...DEFAULT_GAMEPAD_BINDINGS }
  onKey: ((code: string, e: KeyboardEvent) => void) | null = null
  onWheel: ((dir: number) => void) | null = null
  onLockChange: ((locked: boolean) => void) | null = null
  onMiddle: (() => void) | null = null
  /** Called once on each controller button down transition. */
  onControllerAction: ((action: ControllerAction) => void) | null = null
  /** Called for the next controller button pressed; useful for rebinding UI. */
  onControllerBinding: ((buttonIndex: number) => void) | null = null
  private previousButtons = new Set<number>()
  private captureControllerBinding = false
  private readonly deadzone = 0.16

  constructor(private canvas: HTMLCanvasElement) {
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window
    window.addEventListener('keydown', e => {
      if (this.keyboardCaptureActive(e.target)) return
      if (!e.repeat) {
        this.keys.add(e.code)
        this.onKey?.(e.code, e)
      } else this.keys.add(e.code)
      if (this.enabled && ['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'F3', 'F5'].includes(e.code)) e.preventDefault()
    })
    window.addEventListener('keyup', e => { this.keys.delete(e.code) })
    window.addEventListener('blur', () => { this.keys.clear(); this.attackHeld = false; this.placePressed = false; this.clearControllerState() })
    document.addEventListener('mousemove', e => {
      if (!this.locked) return
      this.lookDX += e.movementX
      this.lookDY += e.movementY
    })
    canvas.addEventListener('mousedown', e => {
      if (!this.locked) return
      if (e.button === 0) this.attackHeld = true
      else if (e.button === 2) this.placePressed = true
      else if (e.button === 1) { this.onMiddle?.(); e.preventDefault() }
    })
    window.addEventListener('mouseup', e => { if (e.button === 0) this.attackHeld = false })
    canvas.addEventListener('contextmenu', e => e.preventDefault())
    canvas.addEventListener('wheel', e => {
      if (!this.enabled) return
      this.onWheel?.(Math.sign(e.deltaY))
      e.preventDefault()
    }, { passive: false })
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas
      if (!this.locked) this.attackHeld = false
      this.onLockChange?.(this.locked)
    })
    window.addEventListener('gamepaddisconnected', e => {
      const disconnected = (e as GamepadEvent).gamepad
      if (this.previousGamepadIndex === disconnected.index) this.clearControllerState()
    })
  }

  private previousGamepadIndex: number | null = null

  private keyboardCaptureActive(target: EventTarget | null): boolean {
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)) return true
    return !!document.querySelector('[data-input-capture="active"], [data-key-capture="active"], input:focus, textarea:focus, select:focus, [contenteditable="true"]:focus')
  }

  /** Listen for one controller button press for rebinding, returning a disposer. */
  listenForNextControllerButton(callback: (buttonIndex: number) => void): () => void {
    this.onControllerBinding = callback
    this.captureControllerBinding = true
    return () => { if (this.onControllerBinding === callback) this.onControllerBinding = null; this.captureControllerBinding = false }
  }

  private clearControllerState(): void {
    this.gamepadMoveX = this.gamepadMoveY = this.gamepadLookDX = this.gamepadLookDY = 0
    this.gamepadJump = this.gamepadSprint = this.gamepadSneak = this.gamepadAttack = this.gamepadPlace = false
    this.previousButtons.clear()
    this.previousGamepadIndex = null
  }

  private axis(value: number): number {
    const magnitude = Math.abs(value)
    if (magnitude <= this.deadzone) return 0
    return Math.sign(value) * Math.min(1, (magnitude - this.deadzone) / (1 - this.deadzone))
  }

  /** Poll once per frame. Uses standard Gamepad button indexes/axes (not browser-specific names). */
  pollGamepad(): void {
    let pads: (Gamepad | null)[] | null = null
    try { pads = typeof navigator !== 'undefined' && navigator.getGamepads ? Array.from(navigator.getGamepads()) : null } catch { pads = null }
    const pad = pads?.find((candidate): candidate is Gamepad => !!candidate && candidate.connected) ?? null
    if (!pad) { this.clearControllerState(); return }
    if (this.previousGamepadIndex !== null && this.previousGamepadIndex !== pad.index) this.clearControllerState()
    this.previousGamepadIndex = pad.index

    this.gamepadMoveX = this.axis(pad.axes[0] ?? 0)
    this.gamepadMoveY = -this.axis(pad.axes[1] ?? 0)
    this.gamepadLookDX += this.axis(pad.axes[2] ?? 0) * 12 * this.sensitivity
    this.gamepadLookDY += this.axis(pad.axes[3] ?? 0) * 12 * this.sensitivity

    const current = new Set<number>()
    for (let i = 0; i < pad.buttons.length; i++) {
      const button = pad.buttons[i]
      if (!button?.pressed && (button?.value ?? 0) < 0.5) continue
      current.add(i)
      if (!this.previousButtons.has(i)) {
        if (this.captureControllerBinding) {
          this.captureControllerBinding = false
          this.onControllerBinding?.(i)
          this.onControllerBinding = null
        } else {
          for (const action of Object.keys(this.controllerBindings) as ControllerAction[]) {
            if (this.controllerBindings[action] === i) this.onControllerAction?.(action)
          }
        }
      }
    }
    const isDown = (action: ControllerAction) => current.has(this.controllerBindings[action])
    this.gamepadJump = isDown('jump')
    this.gamepadSprint = isDown('sprint')
    this.gamepadSneak = isDown('sneak')
    this.gamepadAttack = isDown('attack')
    this.gamepadPlace = isDown('place')
    if (this.gamepadPlace && !this.previousButtons.has(this.controllerBindings.place)) this.placePressed = true
    this.previousButtons = current
  }

  lock(): void {
    if (this.isTouch) return
    try {
      const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined
      p?.catch?.(() => undefined)
    } catch { /* ignored */ }
  }

  unlock(): void {
    if (document.pointerLockElement) document.exitPointerLock()
  }

  down(code: string): boolean { return this.keys.has(code) }

  get forward(): number {
    let v = this.touchMoveY + this.gamepadMoveY
    if (this.down(this.bindings.forward) || this.down('ArrowUp')) v += 1
    if (this.down(this.bindings.backward) || this.down('ArrowDown')) v -= 1
    return Math.max(-1, Math.min(1, v))
  }

  get strafe(): number {
    let v = this.touchMoveX + this.gamepadMoveX
    if (this.down(this.bindings.right) || this.down('ArrowRight')) v += 1
    if (this.down(this.bindings.left) || this.down('ArrowLeft')) v -= 1
    return Math.max(-1, Math.min(1, v))
  }

  get jump(): boolean { return this.down(this.bindings.jump) || this.touchJump || this.gamepadJump }
  get sneak(): boolean { return this.down(this.bindings.sneak) || this.down('ShiftRight') || this.gamepadSneak }
  get sprintKey(): boolean { return this.down(this.bindings.sprint) || this.down('ControlRight') || this.touchSprint || this.gamepadSprint }
  get attack(): boolean { return this.attackHeld || this.touchAttack || this.gamepadAttack }

  consumeLook(): [number, number] {
    const r: [number, number] = [this.lookDX + this.gamepadLookDX, this.lookDY + this.gamepadLookDY]
    this.lookDX = this.lookDY = this.gamepadLookDX = this.gamepadLookDY = 0
    return r
  }

  consumePlace(): boolean {
    const p = this.placePressed || (this.gamepadPlace && !this.previousButtons.has(this.controllerBindings.place))
    this.placePressed = false
    return p
  }
}
