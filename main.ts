import * as THREE from 'three'
import './styles/main.css'
import { B, BLOCKS, CH, I, ITEMS, blockDrop, breakTime, itemName } from './core/blocks'
import type { Dimension } from './core/worldgen'
import { buildAtlas, type Atlas } from './core/atlas'
import { World } from './game/world'
import { Player, type Mode } from './game/player'
import { Input } from './game/input'
import { Inventory, type Slot } from './game/inventory'
import { Sky } from './game/sky'
import { GameAudio } from './game/audio'
import { MobManager } from './game/mobs'
import { BlockHighlight, Drops, Hand, Particles } from './game/effects'
import { NetClient } from './game/net'
import { CONFIG } from './game/config'
import { UI } from './ui/ui'
import { loadSettings, loadWorld, saveSettings, saveWorld, type SavedWorld, type Settings } from './game/save'

type State = 'menu' | 'loading' | 'playing' | 'paused' | 'inventory' | 'chat' | 'dead'

const SLOT = 'main'
const ERR: Record<string, string> = {
  timeout: 'انتهت مهلة الاتصال بالخادم',
  connect: 'تعذّر الاتصال بالخادم، تأكد من العنوان',
  closed: 'أُغلق الاتصال بالخادم',
  bad_url: 'عنوان الخادم غير صالح',
  version: 'إصدار اللعبة قديم، أعد تحميل الصفحة',
  room_full: 'الغرفة ممتلئة',
  full: 'الخادم ممتلئ حالياً',
}

class Game {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  hand!: Hand
  atlas: Atlas
  settings: Settings
  input: Input
  audio = new GameAudio()
  ui!: UI
  sky: Sky
  net: NetClient
  highlight: BlockHighlight
  particles: Particles
  world: World | null = null
  drops: Drops | null = null
  mobs: MobManager | null = null
  player = new Player()
  inv = new Inventory()
  state: State = 'menu'
  mode: Mode = 'survival'
  online = false
  dimension: Dimension = 'overworld'
  private returnWorldSave: SavedWorld | null = null
  private chestContents = new Map<string, (Slot | null)[]>()
  private boatGroup: THREE.Group | null = null
  private boatRiding = false
  private portalCooldown = 0
  saveExists = false
  private ambient = new THREE.AmbientLight(0xffffff, 0.8)
  private sun = new THREE.DirectionalLight(0xffffff, 0.6)
  private last = performance.now()
  private fpsFrames = 0
  private fpsTime = 0
  private fps = 0
  private hotbarDirty = true
  private statsOn = false
  private mineKey = ''
  private mineProgress = 0
  private mineSound = 0
  private attackCd = 0
  private placeCd = 0
  private autosave = 0
  private playedSeconds = 0
  private menuAngle = Math.random() * 6.28
  private menuSpawn = { x: 0, y: 70, z: 0 }
  private loadTarget: { x: number; z: number } | null = null
  private pendingStart: (() => void) | null = null
  private bootstrapUrl = ''
  private pendingEdits: number[] = []
  private lastSelected = -1
  private roomName = ''
  private blockedUntil = 0

  constructor() {
    this.settings = loadSettings()
    const canvas = document.getElementById('game') as HTMLCanvasElement
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, matchMedia('(pointer: coarse)').matches ? 1.5 : 2))
    this.renderer.autoClear = false
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.05, 1200)
    this.scene.add(this.camera, this.ambient, this.sun, this.sun.target)
    this.scene.fog = new THREE.Fog(0xaaccff, 40, 90)
    this.atlas = buildAtlas()
    this.hand = new Hand(this.atlas)
    this.sky = new Sky(this.scene)
    this.highlight = new BlockHighlight(this.scene)
    this.particles = new Particles(this.scene, this.atlas)
    this.net = new NetClient(this.scene)
    this.input = new Input(canvas)
    this.input.sensitivity = this.settings.sensitivity
    this.input.bindings = { ...this.input.bindings, ...this.settings.controls }
    this.input.controllerBindings = { ...this.input.controllerBindings, ...this.settings.controllerBindings }
    this.audio.volume = this.settings.volume
    this.audio.musicOn = this.settings.music
    this.statsOn = this.settings.showStats
    CONFIG.camera.fov = this.settings.fov
    this.statsOn = this.settings.showStats
    CONFIG.camera.fov = this.settings.fov

    this.ui = new UI('ui', this.atlas, this.input, this.makeHandlers(), this.settings)
    this.inv.onChange = () => { this.hotbarDirty = true }
    this.wirePlayer()
    this.wireNet()
    this.wireInput()
    this.input.onControllerAction = action => this.handleControllerAction(action)
    window.addEventListener('resize', () => this.resize())
    this.resize()
    document.addEventListener('visibilitychange', () => { if (document.hidden) { void this.saveNow(); if (this.state === 'playing') this.pause() } })
    window.addEventListener('pagehide', () => { void this.saveNow() })
    window.addEventListener('pointerdown', () => this.audio.unlock(), { capture: true })
    window.addEventListener('keydown', () => this.audio.unlock(), { capture: true })
    document.addEventListener('visibilitychange', () => { if (document.hidden) { void this.saveNow(); if (this.state === 'playing') this.pause() } })
    window.addEventListener('pagehide', () => { void this.saveNow() })
    window.addEventListener('pointerdown', () => this.audio.unlock(), { capture: true })
    window.addEventListener('keydown', () => this.audio.unlock(), { capture: true })
  }

  // ------------------------------------------------------------ setup

  private makeHandlers() {
    return {
      hasSave: () => this.saveExists,
      onContinue: () => { void this.continueSaved() },
      onNewWorld: (mode: Mode, seed: string) => { void this.startNew(mode, seed) },
      onOnline: (o: { name: string; room: string; url: string }) => { void this.connectOnline(o) },
      onResume: () => this.resume(),
      onSaveNow: () => { void this.saveNow().then(() => this.ui.toast('تم حفظ العالم')) },
      onQuit: () => { void this.quitToMenu() },
      onRespawn: () => this.respawn(),
      onSettings: (s: Settings) => this.applySettings(s),
      onChat: (t: string) => this.handleChat(t),
      onDrop: (s: { id: number; n: number; dur?: number }) => this.dropStack(s),
      onCraft: () => this.audio.craft(),
      onInventoryClosed: () => this.closeInventory(),
      onTouchInventory: () => { if (this.state === 'inventory') this.ui.closeInventory(true); else this.openInventory(false) },
      onTouchPause: () => { if (this.state === 'playing') this.pause() },
      onTouchChat: () => { if (this.state === 'chat') { this.ui.closeChat(); this.endChat() } else this.openChat() },
      onChatClosed: () => this.endChat(),
      onPlace: () => { if (this.state === 'playing') this.doPlace() },
      onSelectSlot: (i: number) => this.selectSlot(i),
      onTouchFly: () => { if (this.mode === 'creative') { this.player.flying = !this.player.flying; this.player.body.vel.y = 0; this.ui.toast(this.player.flying ? 'الطيران مفعّل' : 'الطيران متوقف') } },
      getBootstrapUrl: () => this.bootstrapUrl,
      getRoomCode: () => this.roomName,
      onServersChanged: (servers: import('./game/save').SavedServer[]) => { this.settings.servers = servers; saveSettings(this.settings) },
      isOnlineAvailable: () => true,
    }
  }

  private wirePlayer(): void {
    const p = this.player
    p.ev.hurt = () => { this.audio.hurt(); this.inv.wearArmor(1) }
    p.ev.step = m => this.audio.step(m as never)
    p.ev.splash = () => this.audio.splash()
    p.ev.die = () => this.onDeath()
  }

  private wireNet(): void {
    this.net.onChat = (n, t, sys) => this.ui.addChat(n, t, sys)
    this.net.onBlock = (x, y, z, id) => { this.world?.stageEdit(x, y, z, id) }
    this.net.onRoster = () => { if (this.input.down('Tab')) this.ui.showRoster([this.settings.playerName || 'أنت', ...this.net.roster()]) }
    this.net.onStatus = (s, reason) => {
      if (s === 'error' && reason === 'lost' && this.online) {
        this.online = false
        this.ui.toast('انقطع الاتصال بالخادم، تكمل اللعب محلياً', 4000)
      }
    }
  }

  private wireInput(): void {
    const inp = this.input
    inp.onKey = (code, e) => this.onKey(code, e)
    inp.onWheel = d => { if (this.state === 'playing') this.selectSlot((this.inv.selected + d + 9) % 9) }
    inp.onLockChange = locked => {
      if (!locked && this.state === 'playing') this.pause()
      this.ui.setHint(this.state === 'playing' && !locked && !inp.isTouch ? 'انقر على الشاشة للتحكم' : null)
    }
    inp.onMiddle = () => {
      const w = this.world
      if (!w || this.state !== 'playing') return
      const e = this.player.eyePos, d = this.player.dir
      const hit = w.raycast(e.x, e.y, e.z, d.x, d.y, d.z, CONFIG.player.reach)
      if (hit && this.mode === 'creative') {
        const idx = this.inv.slots.slice(0, 9).findIndex(s => s?.id === hit.id)
        if (idx >= 0) this.selectSlot(idx)
        else { this.inv.slots[this.inv.selected] = { id: hit.id, n: 64 }; this.inv.onChange?.() }
      }
    }
    const canvas = document.getElementById('game')!
    canvas.addEventListener('click', () => {
      if (this.state === 'playing' && !inp.locked && !inp.isTouch) inp.lock()
    })
    window.addEventListener('keyup', e => { if (e.code === 'Tab') this.ui.showRoster(null) })
  }

  private onKey(code: string, e: KeyboardEvent): void {
    if (this.ui.chatOpen) return
    if (code === 'F3') { this.statsOn = !this.statsOn; this.settings.showStats = this.statsOn; saveSettings(this.settings); e.preventDefault(); return }
    if (code === this.input.bindings.pause || code === 'Escape') {
      if (this.state === 'inventory') this.ui.closeInventory(true)
      else if (this.state === 'paused' && this.ui.screen === 'pause') this.resume()
      else if (this.state === 'playing') this.pause()
      return
    }
    if (this.state === 'inventory' && code === this.input.bindings.inventory) { this.ui.closeInventory(true); return }
    if (this.state !== 'playing') return
    if (code.startsWith('Digit')) {
      const n = Number(code.slice(5))
      if (n >= 1 && n <= 9) this.selectSlot(n - 1)
      return
    }
    switch (code) {
      default:
        if (code === this.input.bindings.inventory) this.openInventory(false)
        else if (code === this.input.bindings.chat || code === 'Enter' || code === 'Slash') { e.preventDefault(); this.openChat() }
        else if (code === this.input.bindings.drop) this.dropHeld(e.ctrlKey)
        else if (code === 'Tab') { if (this.online) this.ui.showRoster([this.settings.playerName || 'أنت', ...this.net.roster()]) }
        break
    }
  }

  private handleControllerAction(action: import('./game/input').ControllerAction): void {
    if (this.ui.chatOpen) return
    if (action === 'pause') {
      if (this.state === 'playing') this.pause()
      else if (this.state === 'paused' && this.ui.screen === 'pause') this.resume()
      else if (this.state === 'inventory') this.ui.closeInventory(true)
      return
    }
    if (action === 'inventory') {
      if (this.state === 'playing') this.openInventory(false)
      else if (this.state === 'inventory') this.ui.closeInventory(true)
      return
    }
    if (action === 'chat' && this.state === 'playing') { this.openChat(); return }
    if (action === 'drop' && this.state === 'playing') { this.dropHeld(false); return }
    if (this.state !== 'playing') return
    if (action.startsWith('slot')) this.selectSlot(Number(action.slice(4)) - 1)
  }

  private resize(): void {
    const w = window.innerWidth, h = window.innerHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.hand.resize(w / h)
  }

  private applySettings(s: Settings): void {
    this.settings = s
    saveSettings(s)
    this.input.sensitivity = s.sensitivity
    this.input.bindings = { ...this.input.bindings, ...s.controls }
    this.input.controllerBindings = { ...this.input.controllerBindings, ...s.controllerBindings }
    this.audio.setVolume(s.volume)
    this.audio.musicOn = s.music
    this.statsOn = s.showStats
    CONFIG.camera.fov = s.fov
    if (this.world) this.world.renderDistance = s.renderDistance
    this.statsOn = s.showStats
    CONFIG.camera.fov = s.fov
    if (this.world) this.world.renderDistance = s.renderDistance
  }

  // ------------------------------------------------------------ boot / menu

  async boot(): Promise<void> {
    this.bootstrapUrl = await this.net.loadBootstrap()
    const saved = await loadWorld(SLOT)
    this.saveExists = !!saved
    this.enterMenu(saved?.seed)
    document.getElementById('boot')?.remove()
    if (import.meta.env.DEV) {
      try {
        const [{ registerGameTuning }, { tuning }] = await Promise.all([import('../scripts/manus-tuning/adapter.js'), import('./game/tuning')])
        await registerGameTuning(tuning)
      } catch { /* tuning is development-only */ }
    }
    requestAnimationFrame(t => this.frame(t))
  }

  private ensureWorld(seed: number, dimension: Dimension = this.dimension): World {
    if (this.world && this.world.seed === seed && this.world.dimension === dimension) return this.world
    this.destroyWorld()
    this.world = new World(this.scene, this.atlas, seed, { renderDistance: this.settings.renderDistance, dimension })
    this.drops = new Drops(this.scene, this.atlas, this.world)
    this.mobs = new MobManager(this.world, this.scene, this.player, this.audio, {
      drop: (id, n, x, y, z) => this.drops?.spawn(id, n, x, y, z),
    })
    this.world.onEdit = (x, y, z, id) => { if (this.online) this.net.sendBlock(x, y, z, id) }
    return this.world
  }

  private destroyWorld(): void {
    this.mobs?.clear()
    this.drops?.clear()
    this.world?.dispose()
    this.world = null
    this.drops = null
    this.mobs = null
  }

  private enterMenu(seedHint?: number): void {
    this.stopBoat()
    this.state = 'menu'
    this.online = false
    this.dimension = 'overworld'
    this.returnWorldSave = null
    this.net.disconnect()
    this.input.unlock()
    this.ui.closeInventory()
    this.ui.showHud(false)
    this.ui.setTouchVisible(false)
    this.ui.setHint(null)
    this.ui.setUnderwater(false)
    this.ui.setDamage(0)
    const seed = seedHint ?? Math.floor(Math.random() * 2e9) + 1
    const w = this.ensureWorld(seed, 'overworld')
    w.renderDistance = Math.min(6, this.settings.renderDistance)
    this.menuSpawn = w.findSpawn()
    this.sky.time = 0.08
    this.ui.showScreen('title')
  }

  // ------------------------------------------------------------ start flows

  private parseSeed(text: string): number {
    if (!text) return Math.floor(Math.random() * 2e9) + 1
    if (/^-?\d+$/.test(text)) return (Math.abs(parseInt(text, 10)) % 2e9) + 1
    let h = 2166136261
    for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) }
    return (Math.abs(h) % 2e9) + 1
  }

  private async startNew(mode: Mode, seedText: string): Promise<void> {
    this.dimension = 'overworld'
    this.returnWorldSave = null
    this.chestContents.clear()
    this.stopBoat()
    const seed = this.parseSeed(seedText)
    this.online = false
    this.net.disconnect()
    this.mode = mode
    this.player.mode = mode
    this.inv = this.freshInventory(mode)
    if (this.world && this.world.editCount > 0) this.destroyWorld()
    this.beginLoading(seed, null, () => {
      this.sky.time = 0.04
      this.playedSeconds = 0
      this.ui.toast(mode === 'survival' ? 'اكسر شجرة للحصول على الخشب!' : 'اضغط على القفز مرتين للطيران', 4000)
    })
    this.audio.unlock()
  }

  private freshInventory(mode: Mode): Inventory {
    const inv = new Inventory()
    inv.onChange = () => { this.hotbarDirty = true }
    if (mode === 'creative') {
      const ids = [B.STONE, B.DIRT, B.GRASS, B.PLANKS, B.LOG, B.GLASS, B.BRICK, B.LAMP, B.SAND]
      ids.forEach((id, i) => { inv.slots[i] = { id, n: 64 } })
    }
    return inv
  }

  private async continueSaved(): Promise<void> {
    const saved = await loadWorld(SLOT)
    if (!saved) { this.ui.toast('لا يوجد عالم محفوظ'); return }
    this.online = false
    this.dimension = saved.dimension ?? 'overworld'
    this.returnWorldSave = saved.returnWorld ?? null
    this.net.disconnect()
    this.mode = saved.mode
    this.player.mode = saved.mode
    this.inv = new Inventory()
    this.inv.onChange = () => { this.hotbarDirty = true }
    this.inv.load(saved.inventory as never)
    this.beginLoading(saved.seed, saved, () => {
      this.sky.time = saved.time
      this.playedSeconds = saved.playedSeconds
    })
    this.audio.unlock()
  }

  private beginLoading(seed: number, saved: SavedWorld | null, after: () => void, edits?: number[], dimension: Dimension = this.dimension): void {
    this.dimension = dimension
    this.stopBoat()
    this.chestContents.clear()
    for (const [key, packed] of saved?.containers ?? []) {
      const slots = Array.from({ length: 27 }, (_, i) => {
        const s = packed[i]
        return s && Number.isInteger(s[0]) && Number.isInteger(s[1]) && s[1] > 0 && ITEMS[s[0]]
          ? { id: s[0], n: Math.min(ITEMS[s[0]].stack, s[1]), dur: ITEMS[s[0]].tool ? Math.max(1, s[2] || ITEMS[s[0]].tool!.durability) : undefined }
          : null
      })
      this.chestContents.set(key, slots)
    }
    this.state = 'loading'
    this.ui.showScreen('loading')
    this.ui.showHud(false)
    if (saved || (edits && edits.length)) this.destroyWorld()
    const w = this.ensureWorld(seed, dimension)
    w.renderDistance = this.settings.renderDistance
    if (saved) w.importEdits(saved.edits)
    if (edits) NetClient.applyEdits(w, edits)
    const sp = saved ? saved.spawn : w.findSpawn()
    this.player.spawn.set(sp.x, sp.y, sp.z)
    const at = saved ? saved.player : sp
    this.loadTarget = { x: at.x, z: at.z }
    this.pendingStart = () => {
      const p = this.player
      p.dead = false
      p.respawn()
      if (saved) {
        const q = saved.player
        p.body.pos.set(q.x, q.y, q.z)
        p.yaw = q.yaw; p.pitch = q.pitch
        p.health = q.health; p.hunger = q.hunger
        p.flying = q.flying && this.mode === 'creative'
      } else {
        const y = this.surfaceY(sp.x, sp.z)
        p.body.pos.set(sp.x, y, sp.z)
        p.yaw = Math.random() * 6.28; p.pitch = 0
      }
      p.body.vel.set(0, 0, 0)
      if (saved?.pets?.length) this.mobs?.restorePets(saved.pets)
      this.hotbarDirty = true
      this.lastSelected = -1
      after()
      this.enterPlaying()
    }
  }

  private surfaceY(x: number, z: number): number {
    const w = this.world!
    const ix = Math.floor(x), iz = Math.floor(z)
    for (let y = CH - 2; y > 1; y -= 1) {
      const id = w.getBlock(ix, y, iz)
      if (id > 0 && BLOCKS[id].solid && id !== B.LEAVES && !w.isSolidAt(ix, y + 1, iz) && !w.isSolidAt(ix, y + 2, iz) && w.getBlock(ix, y + 1, iz) !== B.WATER) return y + 1.01
    }
    return w.topAt(ix, iz) + 2
  }

  private enterPlaying(): void {
    this.state = 'playing'
    this.ui.showScreen(null)
    this.ui.showHud(true)
    this.ui.setTouchVisible(true)
    this.ui.refreshHotbar(this.inv)
    this.mobs!.enabled = !this.online && this.dimension === 'overworld'
    this.input.enabled = true
    this.input.lock()
    this.ui.setHint(!this.input.isTouch && !this.input.locked ? 'انقر على الشاشة للتحكم' : null)
    this.loadTarget = null
    this.autosave = 0
  }

  private async connectOnline(o: { name: string; room: string; url: string }): Promise<void> {
    this.settings.playerName = o.name
    this.settings.room = o.room
    this.settings.serverUrl = o.url
    saveSettings(this.settings)
    this.pendingEdits = []
    this.ui.setOnlineStatus('جارٍ الاتصال...', false)
    try {
      const welcome = await this.net.connect(o.url, o.room, o.name, flat => { for (const v of flat) this.pendingEdits.push(v) })
      this.online = true
      this.dimension = 'overworld'
      this.returnWorldSave = null
      this.roomName = welcome.room
      this.mode = 'creative'
      this.player.mode = 'creative'
      this.inv = this.freshInventory('creative')
      this.beginLoading(welcome.seed, null, () => { this.sky.time = welcome.time; this.ui.toast(`أنت في الغرفة «${welcome.room}»`, 3500) }, this.pendingEdits, 'overworld')
      this.audio.unlock()
    } catch (e) {
      this.online = false
      const reason = (e as Error).message
      this.ui.setOnlineStatus(ERR[reason] ?? 'فشل الاتصال', true)
    }
  }

  // ------------------------------------------------------------ state transitions

  private pause(): void {
    if (this.state !== 'playing') return
    this.state = 'paused'
    this.input.unlock()
    this.input.attackHeld = false
    this.input.touchAttack = false
    this.input.touchJump = false
    this.input.touchMoveX = this.input.touchMoveY = 0
    this.ui.setHint(null)
    this.ui.showScreen('pause', { online: this.online, room: this.roomName })
    void this.saveNow()
  }

  private resume(): void {
    if (this.state !== 'paused') return
    this.state = 'playing'
    this.ui.showScreen(null)
    this.input.lock()
    this.blockedUntil = performance.now() + 200
    this.last = performance.now()
  }

  private openInventory(table: boolean): void {
    if (this.state !== 'playing') return
    this.state = 'inventory'
    this.input.unlock()
    this.input.attackHeld = false
    this.input.touchAttack = false
    this.ui.setHint(null)
    this.ui.openInventory(this.inv, this.mode, table)
  }

  private openChest(x: number, y: number, z: number): void {
    if (this.online) { this.ui.toast('محتوى الصناديق محلي في هذا الإصدار.'); return }
    const key = `${x},${y},${z}`
    let slots = this.chestContents.get(key)
    if (!slots) { slots = new Array(27).fill(null); this.chestContents.set(key, slots) }
    this.state = 'inventory'
    this.input.unlock()
    this.input.attackHeld = false
    this.input.touchAttack = false
    this.ui.setHint(null)
    this.ui.openInventory(this.inv, this.mode, false, { slots, onChange: () => { this.chestContents.set(key, slots!); this.hotbarDirty = true } })
  }

  private openFurnace(): void {
    this.state = 'inventory'
    this.input.unlock()
    this.input.attackHeld = false
    this.input.touchAttack = false
    this.ui.openFurnace(kind => {
      const ore = kind === 'iron' ? I.IRON : I.GOLD
      const ingot = kind === 'iron' ? I.IRON_INGOT : I.GOLD_INGOT
      if (this.inv.count(ore) < 1 || this.inv.count(I.COAL) < 1) return false
      this.inv.consume(ore, 1)
      this.inv.consume(I.COAL, 1)
      this.inv.add(ingot, 1)
      this.audio.furnace()
      return true
    }, () => this.closeInventory())
  }

  private closeInventory(): void {
    if (this.state !== 'inventory') return
    this.state = 'playing'
    this.input.lock()
    this.blockedUntil = performance.now() + 200
    this.hotbarDirty = true
    void this.saveNow()
  }

  private openChat(): void {
    if (this.state !== 'playing') return
    this.state = 'chat'
    this.input.unlock()
    this.input.keys.clear()
    this.ui.openChat()
  }

  private endChat(): void {
    if (this.state !== 'chat') return
    this.state = 'playing'
    this.input.lock()
    this.blockedUntil = performance.now() + 200
  }

  private onDeath(): void {
    this.audio.death()
    this.stopBoat()
    if (this.mode === 'survival' && this.world) {
      const p = this.player.pos
      this.inv.slots.forEach((s, i) => {
        if (s) this.drops?.spawn(s.id, s.n, p.x, p.y + 1, p.z)
        this.inv.slots[i] = null
      })
      for (const s of this.inv.armor) if (s) this.drops?.spawn(s.id, s.n, p.x, p.y + 1, p.z)
      this.inv.armor.fill(null)
      this.inv.onChange?.()
    }
    window.setTimeout(() => {
      if (this.state === 'playing' || this.state === 'chat') {
        this.ui.closeChat()
        this.state = 'dead'
        this.input.unlock()
        this.ui.setHint(null)
        this.ui.showScreen('death')
      }
    }, 900)
  }

  private respawn(): void {
    const w = this.world!
    const sp = this.player.spawn
    this.player.respawn()
    const y = w.getChunk(Math.floor(sp.x) >> 4, Math.floor(sp.z) >> 4) ? this.surfaceY(sp.x, sp.z) : sp.y
    this.player.body.pos.set(sp.x, y, sp.z)
    this.state = 'playing'
    this.ui.showScreen(null)
    this.input.lock()
    this.hotbarDirty = true
    this.last = performance.now()
  }

  private async quitToMenu(): Promise<void> {
    await this.saveNow()
    const saved = await loadWorld(SLOT)
    this.saveExists = !!saved
    this.net.disconnect()
    this.destroyWorld()
    this.enterMenu(saved?.seed)
  }

  private snapshotWorld(): SavedWorld {
    const p = this.player, w = this.world!
    return {
      seed: w.seed, mode: this.mode, time: this.sky.time,
      player: { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch, health: Math.max(1,p.health), hunger: p.hunger, flying: p.flying },
      spawn: { x: p.spawn.x, y: p.spawn.y, z: p.spawn.z }, inventory: this.inv.serialize(), edits: w.exportEdits(),
      playedSeconds: this.playedSeconds, savedAt: Date.now(), dimension: this.dimension,
      containers: [...this.chestContents.entries()].map(([key, slots]): [string, (number[] | null)[]] => [key, slots.map(s => s ? [s.id, s.n, s.dur ?? 0] : null)]),
      pets: this.mobs?.snapshotPets() ?? [],
    }
  }

  async saveNow(): Promise<void> {
    if (this.online || !this.world || (this.state !== 'playing' && this.state !== 'paused' && this.state !== 'inventory' && this.state !== 'chat')) return
    const data: SavedWorld = {
      ...this.snapshotWorld(),
      returnWorld: this.returnWorldSave ?? undefined,
    }
    this.saveExists = (await saveWorld(SLOT, data)) || this.saveExists
  }

  private portalInterior(x:number,y:number,z:number): [number,number,number][] | null {
    const w=this.world; if(!w) return null
    for(const [width,depth] of [[4,5],[5,4]]) for(let sx=x-width+1;sx<=x;sx+=1) for(let sz=z-depth+1;sz<=z;sz+=1) {
      let matches=true
      for(let dz=0;dz<depth && matches;dz+=1) for(let dx=0;dx<width;dx+=1) {
        const edge=dx===0||dz===0||dx===width-1||dz===depth-1
        const id=w.getBlock(sx+dx,y,sz+dz)
        if(edge ? id!==B.PORTAL_FRAME : (id!==B.AIR&&id!==B.WATER&&id!==B.END_PORTAL)) { matches=false; break }
      }
      if(matches) { const cells:[number,number,number][]=[]; for(let dz=1;dz<depth-1;dz+=1) for(let dx=1;dx<width-1;dx+=1) cells.push([sx+dx,y,sz+dz]); return cells }
    }
    return null
  }

  private lightPortal(x:number,y:number,z:number): boolean {
    if(this.online || this.dimension!=='overworld') return false
    const cells=this.portalInterior(x,y,z); if(!cells) return false
    for(const [px,py,pz] of cells) this.world!.setBlock(px,py,pz,B.END_PORTAL)
    this.inv.consumeHeld(1); this.ui.toast('بوابة الأند فُتحت! ادخل إلى مركزها.'); return true
  }

  private buildReturnPortal(): void {
    const w=this.world; if(!w || this.dimension!=='end') return
    const y=w.gen.groundHeight(0,0)+1
    for(let dz=-2;dz<=2;dz+=1) for(let dx=5;dx<=8;dx+=1) {
      const edge=dx===5||dx===8||dz===-2||dz===2
      w.setBlock(dx,y,dz,edge?B.PORTAL_FRAME:B.END_PORTAL)
    }
  }

  private enterEnd(): void {
    if(this.online || this.dimension!=='overworld' || !this.world) return
    this.returnWorldSave=this.snapshotWorld()
    const seed=(Math.abs(Math.imul(this.world.seed ^ 0x5f3759df, 1664525))%2_000_000_000)+1
    this.dimension='end'
    this.beginLoading(seed,null,()=>{
      this.sky.time=0.72
      this.buildReturnPortal()
      const h=this.world!.gen.groundHeight(0,0)
      this.mobs!.spawn('dragon',0.5,h+2,0.5)
      this.ui.toast('الأند: اهزم التنين أو ادخل بوابة العودة.',5000)
    },undefined,'end')
  }

  private leaveEnd(): void {
    if(this.online || this.dimension!=='end' || !this.returnWorldSave) return
    const prior=this.returnWorldSave, p=this.player
    const restored: SavedWorld={...prior,dimension:'overworld',returnWorld:undefined,inventory:this.inv.serialize(),player:{...prior.player,health:Math.max(1,p.health),hunger:p.hunger}}
    this.returnWorldSave=null
    this.dimension='overworld'
    this.beginLoading(restored.seed,restored,()=>{this.sky.time=restored.time;this.ui.toast('عدت إلى العالم الرئيسي.')},undefined,'overworld')
  }

  private updatePortal(dt:number): void {
    this.portalCooldown=Math.max(0,this.portalCooldown-dt)
    if(this.online || this.portalCooldown>0 || this.state!=='playing' || !this.world) return
    const p=this.player.pos, x=Math.floor(p.x), y=Math.floor(p.y+0.1), z=Math.floor(p.z)
    if(this.world.getBlock(x,y,z)!==B.END_PORTAL) return
    this.portalCooldown=2.5
    if(this.dimension==='overworld') this.enterEnd(); else this.leaveEnd()
  }

  // ------------------------------------------------------------ gameplay actions

  private selectSlot(i: number): void {
    if (this.state !== 'playing' && this.state !== 'inventory') return
    this.inv.selected = i
    this.hotbarDirty = true
  }

  private dropStack(s: { id: number; n: number; dur?: number }): void {
    if (!this.drops) return
    const e = this.player.eyePos, d = this.player.dir
    this.drops.spawn(s.id, s.n, e.x + d.x * 0.5, e.y - 0.3, e.z + d.z * 0.5, new THREE.Vector3(d.x * 5, 3 + d.y * 3, d.z * 5))
    if (this.drops.list.length) this.drops.list[this.drops.list.length - 1].age = -0.6
  }

  private stopBoat(): void {
    if (this.boatGroup) {
      this.scene.remove(this.boatGroup)
      this.boatGroup.traverse(o => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose()
          const mats = Array.isArray(o.material) ? o.material : [o.material]
          for (const m of mats) m.dispose()
        }
      })
    }
    this.boatGroup = null
    this.boatRiding = false
    this.player.boatRiding = false
  }

  private mountBoat(surfaceY: number): void {
    this.stopBoat()
    const group = new THREE.Group()
    const wood = new THREE.MeshLambertMaterial({ color: 0x9a7040 })
    const dark = new THREE.MeshLambertMaterial({ color: 0x684626 })
    const part = (w: number, h: number, d: number, x: number, y: number, z: number, material = wood) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
      mesh.position.set(x, y, z); group.add(mesh)
    }
    part(1.28, 0.16, 0.82, 0, 0, 0, dark)
    part(1.34, 0.22, 0.12, 0, 0.04, 0.38)
    part(1.34, 0.22, 0.12, 0, 0.04, -0.38)
    part(0.12, 0.22, 0.66, 0.61, 0.04, 0)
    part(0.12, 0.22, 0.66, -0.61, 0.04, 0)
    this.boatGroup = group
    this.scene.add(group)
    this.player.body.pos.y = surfaceY
    this.player.body.vel.set(0, 0, 0)
    this.player.boatRiding = true
    this.boatRiding = true
    this.syncBoat()
    this.audio.boat()
  }

  private syncBoat(): void {
    if (!this.boatRiding || !this.boatGroup) return
    if (!this.player.boatRiding) { this.stopBoat(); return }
    this.boatGroup.position.set(this.player.pos.x, this.player.pos.y - 0.42, this.player.pos.z)
    this.boatGroup.rotation.y = this.player.yaw
  }

  private dropHeld(all: boolean): void {
    const s = this.inv.held
    if (!s) return
    const n = all ? s.n : 1
    this.dropStack({ id: s.id, n })
    this.inv.consumeHeld(n)
  }

  private doPlace(): void {
    const w = this.world
    if (!w || this.placeCd > 0) return
    const e = this.player.eyePos, d = this.player.dir
    const reach = CONFIG.player.reach
    const hit = w.raycast(e.x, e.y, e.z, d.x, d.y, d.z, reach)
    const held = this.inv.held
    this.placeCd = 0.2
    if (this.boatRiding) { this.stopBoat(); this.ui.toast('تركت القارب.'); return }
    const mobHit = this.mobs?.raycast(e, d, Math.min(reach, 4))
    if (mobHit?.mob.kind === 'petDragon') {
      const result = this.mobs!.interactPetDragon(e.x, e.y, e.z, held?.id ?? 0)
      if (result.action !== 'not-found' && result.action !== 'too-far') {
        if ('consume' in result) this.inv.consumeHeld(result.consume)
        this.ui.toast(result.message, 3500)
        this.hand.swingNow()
        return
      }
    }
    if (hit && held?.id === I.DRAGON_EGG) {
      const px = hit.x + hit.nx, py = hit.y + hit.ny, pz = hit.z + hit.nz
      if (py > 0 && py < CH - 1 && (w.getBlock(px, py, pz) === B.AIR || w.getBlock(px, py, pz) === B.WATER)) {
        this.mobs?.spawnPetDragon(px + 0.5, py + 0.1, pz + 0.5)
        if (this.mode === 'survival') this.inv.consumeHeld(1)
        this.ui.toast('فقست بيضة التنين الصغير. أطعمه باللحم أو التفاح ليروض وينمو.')
        this.audio.mobCall('dragon')
      }
      return
    }
    if (hit && held?.id === I.BOAT) {
      const px = hit.x + hit.nx, py = hit.y + hit.ny, pz = hit.z + hit.nz
      const cell = w.getBlock(px, py, pz)
      if (cell === B.WATER || this.player.inWater) {
        const y = cell === B.WATER ? py + 0.96 : this.player.pos.y
        if (cell === B.WATER) this.player.body.pos.set(px + 0.5, y, pz + 0.5)
        this.mountBoat(y)
        if (this.mode === 'survival') this.inv.consumeHeld(1)
      } else this.ui.toast('استخدم القارب عند الماء.')
      return
    }
    if (hit && hit.id === B.PORTAL_FRAME && held?.id === I.PORTAL_KEY) { this.lightPortal(hit.x,hit.y,hit.z); return }
    if (hit && hit.id === B.TABLE && !this.player.sneaking) {
      this.openInventory(true)
      return
    }
    if (hit && hit.id === B.CHEST) { this.openChest(hit.x, hit.y, hit.z); return }
    if (hit && hit.id === B.FURNACE) { this.openFurnace(); return }
    if (hit && hit.id === B.BED) {
      this.player.spawn.set(hit.x + 0.5, hit.y + 0.1, hit.z + 0.5)
      if (this.sky.isNight) { this.sky.time = 0.04; this.ui.toast('نمت حتى الصباح وتم حفظ نقطة العودة.') }
      else this.ui.toast('نقطة العودة الجديدة حُفظت عند السرير.')
      this.audio.click()
      return
    }
    if (hit && (hit.id === B.TV || hit.id === B.TV_ON)) {
      w.setBlock(hit.x, hit.y, hit.z, hit.id === B.TV ? B.TV_ON : B.TV)
      this.audio.click()
      this.ui.toast(hit.id === B.TV ? 'شغّلت التلفاز.' : 'أطفأت التلفاز.')
      return
    }
    if (hit && (hit.id === B.DOOR || hit.id === B.DOOR_OPEN)) {
      let y0 = hit.y
      const below = w.getBlock(hit.x, y0 - 1, hit.z)
      if (below === B.DOOR || below === B.DOOR_OPEN) y0 -= 1
      const next = w.getBlock(hit.x, y0, hit.z) === B.DOOR ? B.DOOR_OPEN : B.DOOR
      w.setBlock(hit.x, y0, hit.z, next)
      const top = w.getBlock(hit.x, y0 + 1, hit.z)
      if (top === B.DOOR || top === B.DOOR_OPEN) w.setBlock(hit.x, y0 + 1, hit.z, next)
      this.audio.door(next === B.DOOR_OPEN)
      return
    }
    // eat food when pointing at nothing placeable
    if (held && ITEMS[held.id]?.food) {
      if (this.mode === 'survival' && this.player.hunger < 20) {
        this.player.feed(ITEMS[held.id].food!)
        this.inv.consumeHeld(1)
        this.audio.eat()
        this.hand.swingNow()
      }
      return
    }
    if (!hit || !held || !ITEMS[held.id]?.block) return
    const px = hit.x + hit.nx, py = hit.y + hit.ny, pz = hit.z + hit.nz
    if (py < 0 || py >= CH) return
    const cur = w.getBlock(px, py, pz)
    if (cur !== B.AIR && cur !== B.WATER) return
    const def = BLOCKS[held.id]
    if (held.id === B.DOOR) {
      if (py + 1 >= CH || (w.getBlock(px, py + 1, pz) !== B.AIR && w.getBlock(px, py + 1, pz) !== B.WATER)) return
      if (this.player.body.pos.x > px - 0.35 && this.player.body.pos.x < px + 1.35 && this.player.body.pos.z > pz - 0.35 && this.player.body.pos.z < pz + 1.35 && this.player.body.pos.y < py + 2 && this.player.body.pos.y + this.player.body.h > py) return
      if (!w.setBlock(px, py, pz, B.DOOR)) return
      if (!w.setBlock(px, py + 1, pz, B.DOOR)) { w.setBlock(px, py, pz, B.AIR); return }
      this.audio.placeBlock(def.sound); this.hand.swingNow()
      if (this.mode === 'survival') this.inv.consumeHeld(1)
      return
    }
    if (def.solid) {
      // don't entomb the player
      const b = this.player.body, hw = b.w / 2
      if (px + 1 > b.pos.x - hw && px < b.pos.x + hw && pz + 1 > b.pos.z - hw && pz < b.pos.z + hw && py + 1 > b.pos.y && py < b.pos.y + b.h) return
    }
    if (w.setBlock(px, py, pz, held.id)) {
      this.audio.placeBlock(def.sound)
      this.hand.swingNow()
      if (this.mode === 'survival') this.inv.consumeHeld(1)
    }
  }

  private updateMining(dt: number): void {
    const w = this.world!
    const e = this.player.eyePos, d = this.player.dir
    const reach = CONFIG.player.reach
    const hit = w.raycast(e.x, e.y, e.z, d.x, d.y, d.z, reach)
    const mobHit = this.mobs ? this.mobs.raycast(e, d, Math.min(reach, 3.6)) : null
    const useMob = mobHit && (!hit || mobHit.dist < hit.dist)
    this.attackCd = Math.max(0, this.attackCd - dt)
    this.placeCd = Math.max(0, this.placeCd - dt)
    const attacking = this.input.attack
    if (useMob && mobHit) {
      this.highlight.hide()
      this.mineKey = ''
      this.mineProgress = 0
      if (attacking && this.attackCd <= 0) {
        this.attackCd = 0.45
        const tool = ITEMS[this.inv.heldId]?.tool
        let dmg = tool ? tool.damage : 1
        if (this.mode === 'creative') dmg = 100
        this.mobs!.hurt(mobHit.mob, dmg, this.player.pos)
        this.hand.swingNow()
        if (tool && this.mode === 'survival') this.inv.wearHeld(1)
        this.particles.burst(B.LEAVES, mobHit.mob.body.pos.x, mobHit.mob.body.pos.y + 0.8, mobHit.mob.body.pos.z, 4, 0.2)
      }
      return
    }
    if (!hit) {
      this.highlight.hide()
      this.mineKey = ''
      this.mineProgress = 0
      if (attacking && this.attackCd <= 0) { this.attackCd = 0.3; this.hand.swingNow() }
      return
    }
    this.highlight.show(hit.x, hit.y, hit.z)
    if (!attacking) {
      this.mineKey = ''
      this.mineProgress = 0
      this.highlight.setProgress(0, 0, 0, 0)
      return
    }
    const key = `${hit.x},${hit.y},${hit.z}`
    if (key !== this.mineKey) { this.mineKey = key; this.mineProgress = 0; this.mineSound = 0 }
    const def = BLOCKS[hit.id]
    const creative = this.mode === 'creative'
    if (creative) {
      if (hit.id === B.BEDROCK && false) return
      if (this.attackCd <= 0) {
        this.attackCd = 0.22
        this.breakBlock(hit.x, hit.y, hit.z, hit.id)
      }
      return
    }
    const t = breakTime(hit.id, this.inv.heldId)
    if (!isFinite(t)) { this.highlight.setProgress(0, 0, 0, 0); return }
    this.mineProgress += dt / t
    this.mineSound -= dt
    if (this.mineSound <= 0) { this.mineSound = 0.24; this.audio.hit(def.sound, hit.id); this.hand.swingNow() }
    if (Math.random() < dt * 8) this.particles.burst(hit.id, hit.x + 0.5 + hit.nx * 0.5, hit.y + 0.5 + hit.ny * 0.5, hit.z + 0.5 + hit.nz * 0.5, 1, 0.3)
    this.highlight.setProgress(hit.x, hit.y, hit.z, this.mineProgress)
    if (this.mineProgress >= 1) {
      this.breakBlock(hit.x, hit.y, hit.z, hit.id)
      this.mineProgress = 0
      this.mineKey = ''
      this.highlight.setProgress(0, 0, 0, 0)
    }
  }

  private breakBlock(x: number, y: number, z: number, id: number): void {
    const w = this.world!
    if (id === B.BEDROCK && this.mode === 'survival') return
    const heldId = this.inv.heldId
    const door = id === B.DOOR || id === B.DOOR_OPEN
    let doorY = y
    if (door && (w.getBlock(x, y - 1, z) === B.DOOR || w.getBlock(x, y - 1, z) === B.DOOR_OPEN)) doorY -= 1
    if (door) {
      w.setBlock(x, doorY, z, B.AIR)
      const top = w.getBlock(x, doorY + 1, z)
      if (top === B.DOOR || top === B.DOOR_OPEN) w.setBlock(x, doorY + 1, z, B.AIR)
    } else if (!w.setBlock(x, y, z, B.AIR)) return
    if (id === B.CHEST) {
      const key = `${x},${y},${z}`
      const contents = this.chestContents.get(key)
      if (this.mode === 'survival' && contents) for (const s of contents) if (s) this.drops?.spawn(s.id, s.n, x + 0.5, y + 0.6, z + 0.5)
      this.chestContents.delete(key)
    }
    this.particles.burst(id, x + 0.5, y + 0.5, z + 0.5, 16, 0.4)
    this.audio.breakBlock(BLOCKS[id].sound, id)
    this.hand.swingNow()
    if (this.mode === 'survival') {
      const drop = door ? B.DOOR : blockDrop(id, heldId)
      if (drop) this.drops?.spawn(drop, 1, x + 0.5, y + 0.4, z + 0.5)
      if (ITEMS[heldId]?.tool) {
        if (this.inv.wearHeld(1)) { this.audio.hit('stone'); this.ui.toast(`انكسر ${itemName(heldId)}`) }
      }
    }
  }

  private handleChat(text: string): void {
    if (text.startsWith('/')) {
      const [cmd, ...args] = text.slice(1).split(/\s+/)
      const say = (t: string) => this.ui.addChat('النظام:', t, true)
      switch (cmd.toLowerCase()) {
        case 'day': this.sky.time = 0.1; say('تم ضبط الوقت إلى النهار'); break
        case 'night': this.sky.time = 0.75; say('تم ضبط الوقت إلى الليل'); break
        case 'creative': this.setMode('creative'); say('الوضع الإبداعي'); break
        case 'survival': this.setMode('survival'); say('وضع البقاء'); break
        case 'seed': say(`بذرة العالم: ${this.world?.seed}`); break
        case 'spawn': {
          const sp = this.player.spawn
          this.player.body.pos.set(sp.x, this.surfaceY(sp.x, sp.z), sp.z)
          say('تم الانتقال إلى نقطة البداية')
          break
        }
        case 'tp': {
          const [x, y, z] = args.map(Number)
          if ([x, y, z].every(Number.isFinite)) { this.player.body.pos.set(x, y, z); say('تم الانتقال') } else say('الصيغة: /tp x y z')
          break
        }
        case 'help': say('الأوامر: /day /night /creative /survival /seed /spawn /tp x y z'); break
        default: say('أمر غير معروف، اكتب /help')
      }
      return
    }
    if (this.online) this.net.sendChat(text)
    else this.ui.addChat(this.settings.playerName || 'أنت', text, false)
  }

  private setMode(m: Mode): void {
    this.mode = m
    this.player.mode = m
    if (m === 'survival') this.player.flying = false
    this.hotbarDirty = true
    this.lastSelected = -1
  }

  // ------------------------------------------------------------ frame loop

  private frame(now: number): void {
    requestAnimationFrame(t => this.frame(t))
    const dt = Math.min(0.05, Math.max(0.0005, (now - this.last) / 1000))
    this.last = now
    this.fpsFrames += 1
    this.fpsTime += dt
    if (this.fpsTime >= 0.5) { this.fps = Math.round(this.fpsFrames / this.fpsTime); this.fpsFrames = 0; this.fpsTime = 0 }
    try { this.update(dt) } catch (e) { console.error(e) }
    this.render()
  }

  private update(dt: number): void {
    this.input.pollGamepad()
    const w = this.world
    if (!w) return
    const p = this.player
    p.armorProtection = this.inv.armorValue
    const cam = this.camera
    const running = this.state === 'playing' || this.state === 'inventory' || this.state === 'chat' || this.online
    let underwater = false

    if (this.state === 'menu') {
      this.menuAngle += dt * 0.05
      const m = this.menuSpawn
      cam.position.set(m.x, Math.max(52, w.gen.groundHeight(m.x, m.z) + 22), m.z)
      cam.rotation.set(-0.2, this.menuAngle, 0, 'YXZ')
      w.update(m.x, m.z, 6)
    } else if (this.state === 'loading') {
      const t = this.loadTarget!
      w.update(t.x, t.z, 12)
      const frac = Math.min(1, w.readiness(t.x, t.z, Math.min(3, w.renderDistance)))
      this.ui.setLoading(frac)
      cam.position.set(t.x, 80, t.z)
      cam.rotation.set(-0.3, this.menuAngle, 0, 'YXZ')
      if (frac >= 1 && this.pendingStart) { const f = this.pendingStart; this.pendingStart = null; f() }
    } else {
      const playing = this.state === 'playing'
      const loaded = !!w.getChunk(Math.floor(p.pos.x) >> 4, Math.floor(p.pos.z) >> 4)
      if (playing && performance.now() > this.blockedUntil) {
        const [lx, ly] = this.input.consumeLook()
        const sens = 0.0022 * this.input.sensitivity * (this.input.isTouch ? 1.0 : 1)
        p.yaw -= lx * sens
        p.pitch -= ly * sens * (this.settings.invertY ? -1 : 1)
        p.pitch = Math.max(-1.55, Math.min(1.55, p.pitch))
      } else this.input.consumeLook()
      if (this.state !== 'paused') {
        if (loaded) p.update(dt, this.input, w, playing && !this.mobs?.mounted)
        this.syncBoat()
        if (running || this.online) this.runWorld(dt, playing)
        if (playing) {
          if (loaded) this.updateMining(dt)
          this.updatePortal(dt)
          if (this.input.consumePlace() && performance.now() > this.blockedUntil) this.doPlace()
          else if (this.input.down('KeyG')) { /* reserved */ }
          this.playedSeconds += dt
          this.autosave += dt
          if (this.autosave > 25 && !this.online) { this.autosave = 0; void this.saveNow() }
        }
      }
      // camera
      const eye = p.eyePos
      cam.position.copy(eye)
      cam.position.y += Math.sin(p.walkBob) * 0.035
      cam.rotation.set(p.pitch, p.yaw, Math.sin(p.walkBob * 0.5) * 0.008 * (p.body.onGround ? 1 : 0), 'YXZ')
      const baseFov = CONFIG.camera.fov
      const targetFov = baseFov + (p.sprinting ? 7 : 0) + (p.flying && p.sprinting ? 8 : 0)
      cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 8)
      cam.updateProjectionMatrix()
      underwater = w.liquidAt(eye.x, eye.y, eye.z)
      if (this.online) {
        this.net.sendPose(p.pos, p.yaw, p.pitch, p.sneaking ? 1 : 0)
        this.net.update(dt, cam.position)
      }
      this.updateHud(dt, underwater)
    }

    // sky + lighting
    const sk = this.sky.update(dt, cam, underwater, running && this.state !== 'paused')
    const rd = w.renderDistance
    const fogFar = underwater ? 20 : Math.max(26, rd * 16 - 6)
    const fogNear = underwater ? 0.5 : fogFar * 0.55
    w.setLighting(sk.day, sk.fog, fogNear, fogFar, sk.tint)
    const fog = this.scene.fog as THREE.Fog
    fog.color.copy(sk.fog); fog.near = fogNear; fog.far = fogFar
    this.ambient.intensity = 0.35 + sk.day * 0.55
    this.ambient.color.copy(sk.tint)
    this.sun.intensity = 0.15 + sk.day * 0.55
    this.sun.position.copy(cam.position).addScaledVector(sk.sunY > -0.05 ? sk.sunDir : sk.sunDir.clone().negate(), 50)
    this.sun.target.position.copy(cam.position)
    this.particles.setBrightness(0.45 + sk.day * 0.55)
    this.drops?.setBrightness(0.45 + sk.day * 0.55)
    this.hand.setBrightness(0.5 + sk.day * 0.5)
    this.net.setBrightness(0.4 + sk.day * 0.6)
    this.particles.update(dt)
  }

  private runWorld(dt: number, playing: boolean): void {
    const w = this.world!
    const p = this.player
    w.update(p.pos.x, p.pos.z, 5)
    if (this.mobs && this.state !== 'paused') this.mobs.update(dt, this.sky.isNight, this.sky.isNight ? 0 : 1, this.input)
    this.drops?.update(dt, p, this.inv, () => this.audio.pop())
    const under = p.pos.y < w.topAt(Math.floor(p.pos.x), Math.floor(p.pos.z)) - 8
    this.audio.ambient(dt, this.sky.isNight, under, false)
    void playing
  }

  private updateHud(dt: number, underwater: boolean): void {
    const p = this.player
    if (this.hotbarDirty) {
      this.hotbarDirty = false
      this.ui.refreshHotbar(this.inv)
      this.hand.set(this.inv.heldId)
      if (this.lastSelected !== this.inv.selected || this.lastSelected === -1) {
        this.lastSelected = this.inv.selected
        const id = this.inv.heldId
        if (id) this.ui.flashName(itemName(id))
      }
    }
    this.ui.setVitals(Math.ceil(p.health), p.hunger, p.air, this.mode === 'survival', underwater)
    this.ui.setDamage(p.hurtFlash * 0.9 + (p.dead ? 0.6 : 0))
    this.ui.setUnderwater(underwater)
    const moving = Math.hypot(p.body.vel.x, p.body.vel.z) > 0.8 && p.body.onGround
    this.hand.update(dt, p.walkBob, moving, this.input.attack && this.state === 'playing')
    if (this.statsOn) {
      const w = this.world!
      let meshes = 0
      for (const c of w.chunks.values()) if (c.solid) meshes += 1
      this.ui.setStats(
        `الإطارات: ${this.fps}\nالموقع: ${p.pos.x.toFixed(1)} ${p.pos.y.toFixed(1)} ${p.pos.z.toFixed(1)}\nالقطع المحمّلة: ${w.chunks.size} (${meshes} مرسومة)\nالكتل المحمّلة: ${(w.chunks.size * 16 * 16 * CH).toLocaleString('en')}\nالكتل المعدّلة: ${w.editCount}${this.online ? `\nالتأخر: ${this.net.latency}ms` : ''}`,
      )
    } else this.ui.setStats(null)
    const badges: string[] = []
    badges.push(this.mode === 'creative' ? 'الوضع الإبداعي' : 'وضع البقاء')
    if(this.dimension==='end') badges.push('بُعد الأند')
    if (this.online) badges.push(`أونلاين · ${this.roomName} · ${this.net.players.size + 1} لاعب`)
    this.ui.setBadges(badges)
  }

  private render(): void {
    const r = this.renderer
    r.clear()
    r.render(this.scene, this.camera)
    if (this.state === 'playing' || this.state === 'paused' || this.state === 'inventory' || this.state === 'chat') {
      r.clearDepth()
      r.render(this.hand.scene, this.hand.camera)
    }
  }
}

const game = new Game()
void game.boot()
;(window as unknown as { __game: Game }).__game = game
void I
