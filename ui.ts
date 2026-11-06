import { ATLAS_COLS, B, CREATIVE_BLOCKS, ITEMS, I, RECIPES, matchRecipe, itemName } from '../core/blocks'
import { buildHudIcons, darkTileDataUrl, drawItemIcon, type Atlas } from '../core/atlas'
import { T } from '../core/blocks'
import type { Input } from '../game/input'
import type { Inventory, Slot } from '../game/inventory'
import type { SavedServer, Settings } from '../game/save'
import { DEFAULT_BINDINGS, DEFAULT_GAMEPAD_BINDINGS, type ControlAction, type ControllerAction } from '../game/input'

void ATLAS_COLS
void RECIPES

export type ScreenName = 'title' | 'newworld' | 'online' | 'settings' | 'help' | 'pause' | 'death' | 'loading' | 'confirm' | null

export interface UIHandlers {
  hasSave(): boolean
  onContinue(): void
  onNewWorld(mode: 'survival' | 'creative', seed: string): void
  onOnline(opts: { name: string; room: string; url: string }): void
  onResume(): void
  onSaveNow(): void
  onQuit(): void
  onRespawn(): void
  onSettings(s: Settings): void
  onChat(text: string): void
  onDrop(slot: Slot): void
  onCraft(): void
  onInventoryClosed(): void
  onTouchInventory(): void
  onTouchPause(): void
  onTouchChat(): void
  onChatClosed(): void
  onPlace(): void
  onSelectSlot(i: number): void
  onTouchFly(): void
  getBootstrapUrl(): string
  getRoomCode(): string
  onServersChanged(servers: SavedServer[]): void
  isOnlineAvailable(): boolean
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html) e.innerHTML = html
  return e
}

export class UI {
  readonly root: HTMLElement
  private hud = h('div')
  private screenEl: HTMLElement | null = null
  screen: ScreenName = null
  private hotbarEl = h('div', 'hotbar')
  private heartsEl = h('div', 'hearts')
  private foodEl = h('div', 'food')
  private bubblesEl = h('div', 'bubbles')
  private nameEl = h('div', 'itemname')
  private toastEl = h('div', 'toast')
  private statsEl = h('div', 'stats')
  private badgeEl = h('div', 'badge')
  private vignette = h('div', 'vignette')
  private water = h('div', 'water-overlay')
  private chatLog = h('div', 'chatlog')
  private chatBox: HTMLElement | null = null
  private rosterEl = h('div', 'roster hidden')
  private hintEl = h('div', 'toast show hidden')
  private touchEl: HTMLElement | null = null
  private nameTimer = 0
  private toastTimer = 0
  private icons: Record<string, string>
  private iconCache = new Map<number, string>()
  private lastVitals = ''
  settings: Settings
  private invEl: HTMLElement | null = null
  private cursorEl: HTMLElement | null = null
  private cursor: Slot | null = null
  private craftGrid: (Slot | null)[] = []
  private craftW = 2
  private inventory: Inventory | null = null
  private pointerMove = (e: PointerEvent) => {
    if (this.cursorEl) { this.cursorEl.style.left = `${e.clientX}px`; this.cursorEl.style.top = `${e.clientY}px` }
  }

  constructor(rootId: string, private atlas: Atlas, private input: Input, private handlers: UIHandlers, settings: Settings) {
    this.root = document.getElementById(rootId)!
    this.settings = settings
    this.icons = buildHudIcons()
    const stone = darkTileDataUrl(atlas, T.STONE, 4)
    const dirt = darkTileDataUrl(atlas, T.DIRT, 6)
    document.documentElement.style.setProperty('--stone', `url(${stone})`)
    document.documentElement.style.setProperty('--dirt', `url(${dirt})`)
    this.buildHud()
    this.buildTouch()
    window.addEventListener('pointermove', this.pointerMove)
  }

  icon(id: number): string {
    let u = this.iconCache.get(id)
    if (!u) { u = drawItemIcon(id, this.atlas, 32).toDataURL(); this.iconCache.set(id, u) }
    return u
  }

  // ------------------------------------------------------------ HUD

  private buildHud(): void {
    this.hud.id = 'hud'
    this.hud.append(this.water, this.vignette)
    const cross = h('div', 'crosshair')
    const wrap = h('div', 'hotbar-wrap')
    const vit = h('div', 'vitals')
    vit.append(this.heartsEl, this.foodEl)
    wrap.append(vit, this.hotbarEl)
    this.hud.append(cross, this.hintEl, this.bubblesEl, this.nameEl, this.toastEl, this.statsEl, this.badgeEl, this.chatLog, this.rosterEl, wrap)
    this.root.append(this.hud)
    this.hud.classList.add('hidden')
    this.hotbarEl.classList.add('tappable')
    this.hotbarEl.addEventListener('pointerdown', e => {
      const t = (e.target as HTMLElement).closest('.slot') as HTMLElement | null
      if (!t) return
      e.preventDefault()
      this.handlers.onSelectSlot(Number(t.dataset.i))
    })
    this.hotbarEl.addEventListener('wheel', e => e.stopPropagation())
  }

  showHud(on: boolean): void {
    this.hud.classList.toggle('hidden', !on)
    this.touchEl?.classList.toggle('hidden', !(on && this.input.isTouch))
  }

  refreshHotbar(inv: Inventory): void {
    this.hotbarEl.innerHTML = ''
    for (let i = 0; i < 9; i += 1) {
      const s = h('div', 'slot' + (i === inv.selected ? ' sel' : ''))
      s.dataset.i = String(i)
      this.fillSlot(s, inv.slots[i], false)
      const k = h('span', 'key', String(i + 1))
      s.append(k)
      this.hotbarEl.append(s)
    }
    const vitals = this.hud.querySelector('.vitals') as HTMLElement
    vitals.style.setProperty('--s0', '9')
  }

  private fillSlot(el: HTMLElement, s: Slot | null, showCount = true): void {
    el.querySelectorAll('img,.cnt,.dur').forEach(n => n.remove())
    if (!s) return
    const img = h('img') as HTMLImageElement
    img.src = this.icon(s.id)
    img.draggable = false
    el.append(img)
    if (s.n > 1 && showCount) el.append(h('span', 'cnt', String(s.n)))
    else if (s.n > 1) el.append(h('span', 'cnt', String(s.n)))
    const def = ITEMS[s.id]
    if (def?.tool && s.dur !== undefined && s.dur < def.tool.durability) {
      const f = s.dur / def.tool.durability
      const d = h('div', 'dur')
      const i = h('i')
      i.style.width = `${f * 100}%`
      i.style.background = f > 0.5 ? '#6f6' : f > 0.2 ? '#fd4' : '#f55'
      d.append(i)
      el.append(d)
    }
  }

  setVitals(health: number, hunger: number, air: number, survival: boolean, underwater: boolean): void {
    const key = `${health}|${hunger}|${Math.ceil(air)}|${survival}|${underwater}`
    if (key === this.lastVitals) return
    this.lastVitals = key
    this.heartsEl.style.display = this.foodEl.style.display = survival ? 'flex' : 'none'
    if (!survival) { this.bubblesEl.innerHTML = ''; return }
    this.heartsEl.classList.toggle('low', health <= 6)
    const mk = (val: number, el: HTMLElement, full: string) => {
      el.innerHTML = ''
      for (let i = 0; i < 10; i += 1) {
        const f = Math.max(0, Math.min(2, val - i * 2))
        const wrap = h('span')
        wrap.style.cssText = 'position:relative;display:inline-block;line-height:0'
        const empty = h('img', 'empty') as HTMLImageElement
        empty.src = full
        wrap.append(empty)
        if (f > 0) {
          const fl = h('img') as HTMLImageElement
          fl.src = full
          fl.style.cssText = `position:absolute;left:0;top:0;clip-path:inset(0 ${f === 1 ? 50 : 0}% 0 0)`
          wrap.append(fl)
        }
        el.append(wrap)
      }
    }
    mk(health, this.heartsEl, this.icons.heart)
    mk(hunger, this.foodEl, this.icons.food)
    this.bubblesEl.innerHTML = ''
    if (underwater || air < 10) {
      const n = Math.ceil(air)
      for (let i = 0; i < 10; i += 1) {
        const b = h('img') as HTMLImageElement
        b.src = this.icons.bubble
        b.style.width = 'clamp(14px,3.2vw,20px)'
        b.style.imageRendering = 'pixelated'
        if (i >= n) b.style.display = 'none'
        this.bubblesEl.append(b)
      }
    }
  }

  setHint(text: string | null): void {
    this.hintEl.classList.toggle('hidden', !text)
    if (text) this.hintEl.textContent = text
    this.hintEl.style.top = '38%'
  }

  setDamage(v: number): void { this.vignette.style.opacity = String(Math.min(1, v)) }
  setUnderwater(on: boolean): void { this.water.style.opacity = on ? '1' : '0' }

  flashName(text: string): void {
    this.nameEl.textContent = text
    this.nameEl.classList.add('show')
    window.clearTimeout(this.nameTimer)
    this.nameTimer = window.setTimeout(() => this.nameEl.classList.remove('show'), 1500)
  }

  toast(text: string, ms = 2200): void {
    this.toastEl.textContent = text
    this.toastEl.classList.add('show')
    window.clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), ms)
  }

  setStats(text: string | null): void {
    this.statsEl.style.display = text ? 'block' : 'none'
    if (text) this.statsEl.textContent = text
  }

  setBadges(items: string[]): void {
    this.badgeEl.innerHTML = ''
    for (const t of items) this.badgeEl.append(h('span', '', t))
  }

  addChat(name: string, text: string, system: boolean): void {
    const d = h('div', system ? 'sys' : '')
    if (system) d.textContent = `${name} ${text}`
    else { const n = h('span', 'name'); n.textContent = `<${name}> `; d.append(n, document.createTextNode(text)) }
    this.chatLog.append(d)
    while (this.chatLog.children.length > 7) this.chatLog.firstChild?.remove()
    window.setTimeout(() => { d.style.opacity = '0'; window.setTimeout(() => d.remove(), 1000) }, system ? 7000 : 12000)
  }

  openChat(): void {
    if (this.chatBox) return
    const box = h('div', 'chatbox tappable')
    const inp = h('input') as HTMLInputElement
    inp.type = 'text'
    inp.maxLength = 120
    inp.placeholder = 'اكتب رسالة أو أمراً يبدأ بـ /'
    const send = h('button', 'btn small', 'إرسال')
    box.append(send, inp)
    this.hud.append(box)
    this.chatBox = box
    const close = () => { box.remove(); this.chatBox = null; this.handlers.onChatClosed() }
    const submit = () => { const v = inp.value.trim(); if (v) this.handlers.onChat(v); close() }
    send.addEventListener('click', submit)
    inp.addEventListener('keydown', e => {
      e.stopPropagation()
      if (e.key === 'Enter') submit()
      else if (e.key === 'Escape') close()
    })
    inp.addEventListener('keyup', e => e.stopPropagation())
    window.setTimeout(() => inp.focus(), 30)
  }

  get chatOpen(): boolean { return !!this.chatBox }
  closeChat(): void { this.chatBox?.remove(); this.chatBox = null }

  showRoster(names: string[] | null): void {
    if (!names) { this.rosterEl.classList.add('hidden'); return }
    this.rosterEl.classList.remove('hidden')
    this.rosterEl.innerHTML = '<h3>اللاعبون المتصلون</h3>'
    for (const n of names) { const d = h('div'); d.textContent = n; this.rosterEl.append(d) }
  }

  // ------------------------------------------------------------ touch controls

  private buildTouch(): void {
    const t = h('div', 'touch hidden')
    this.touchEl = t
    const look = h('div', 'lookpad')
    t.append(look)
    // look pad: drag to look, quick tap to place, press & hold to mine
    let lid = -1, lx = 0, ly = 0, startT = 0, moved = 0, holdTimer = 0
    look.addEventListener('pointerdown', e => {
      if (lid !== -1) return
      lid = e.pointerId; lx = e.clientX; ly = e.clientY; startT = performance.now(); moved = 0
      look.setPointerCapture(e.pointerId)
      holdTimer = window.setTimeout(() => { if (moved < 12) this.input.touchAttack = true }, 280)
    })
    look.addEventListener('pointermove', e => {
      if (e.pointerId !== lid) return
      const dx = e.clientX - lx, dy = e.clientY - ly
      lx = e.clientX; ly = e.clientY
      moved += Math.abs(dx) + Math.abs(dy)
      this.input.lookDX += dx * 1.6
      this.input.lookDY += dy * 1.6
    })
    const end = (e: PointerEvent) => {
      if (e.pointerId !== lid) return
      lid = -1
      window.clearTimeout(holdTimer)
      if (this.input.touchAttack) this.input.touchAttack = false
      else if (performance.now() - startT < 260 && moved < 12) this.handlers.onPlace()
    }
    look.addEventListener('pointerup', end)
    look.addEventListener('pointercancel', end)

    // joystick
    const stick = h('div', 'stick')
    const knob = h('i')
    stick.append(knob)
    let sid = -1
    const setStick = (e: PointerEvent) => {
      const r = stick.getBoundingClientRect()
      let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2)
      const max = r.width / 2
      const l = Math.hypot(dx, dy)
      if (l > max) { dx = (dx / l) * max; dy = (dy / l) * max }
      knob.style.transform = `translate(${dx}px,${dy}px)`
      const nx = dx / max, ny = dy / max
      this.input.touchMoveX = Math.abs(nx) < 0.15 ? 0 : nx
      this.input.touchMoveY = Math.abs(ny) < 0.15 ? 0 : -ny
      this.input.touchSprint = ny < -0.92
    }
    stick.addEventListener('pointerdown', e => { sid = e.pointerId; stick.setPointerCapture(sid); setStick(e) })
    stick.addEventListener('pointermove', e => { if (e.pointerId === sid) setStick(e) })
    const sEnd = (e: PointerEvent) => {
      if (e.pointerId !== sid) return
      sid = -1; knob.style.transform = ''; this.input.touchMoveX = this.input.touchMoveY = 0; this.input.touchSprint = false
    }
    stick.addEventListener('pointerup', sEnd)
    stick.addEventListener('pointercancel', sEnd)
    t.append(stick)

    const mkBtn = (cls: string, html: string, style: string, down: () => void, up?: () => void): HTMLElement => {
      const b = h('div', `tbtn ${cls}`, html)
      b.style.cssText = style
      b.addEventListener('pointerdown', e => { e.preventDefault(); b.classList.add('down'); b.setPointerCapture(e.pointerId); down() })
      const u = () => { b.classList.remove('down'); up?.() }
      b.addEventListener('pointerup', u)
      b.addEventListener('pointercancel', u)
      return b
    }
    const svg = (p: string) => `<svg viewBox="0 0 24 24">${p}</svg>`
    t.append(
      mkBtn('', svg('<path d="M12 19V5M6 11l6-6 6 6"/>'), 'right:calc(20px + var(--safe-r));bottom:calc(120px + var(--safe-b))', () => { this.input.touchJump = true }, () => { this.input.touchJump = false }),
      mkBtn('', svg('<path d="M4 20l9-9M9 5l6-2 6 6-2 6-4-4z"/>'), 'right:calc(100px + var(--safe-r));bottom:calc(150px + var(--safe-b))', () => { this.input.touchAttack = true }, () => { this.input.touchAttack = false }),
      mkBtn('', svg('<rect x="5" y="5" width="14" height="14"/><path d="M12 8v8M8 12h8"/>'), 'right:calc(100px + var(--safe-r));bottom:calc(224px + var(--safe-b))', () => this.handlers.onPlace()),
      mkBtn('sm', svg('<rect x="4" y="9" width="16" height="10"/><path d="M8 9V5h8v4"/>'), 'left:calc(12px + var(--safe-l));top:calc(60px + var(--safe-t))', () => this.handlers.onTouchInventory()),
      mkBtn('sm', svg('<path d="M8 5v14M16 5v14"/>'), 'left:calc(12px + var(--safe-l));top:calc(8px + var(--safe-t))', () => this.handlers.onTouchPause()),
      mkBtn('sm', svg('<path d="M4 5h16v11H9l-5 4z"/>'), 'left:calc(66px + var(--safe-l));top:calc(8px + var(--safe-t))', () => this.handlers.onTouchChat()),
      mkBtn('sm', svg('<path d="M3 14c4-6 14-6 18 0M12 6v8"/>'), 'left:calc(66px + var(--safe-l));top:calc(60px + var(--safe-t))', () => this.handlers.onTouchFly()),
    )
    this.root.append(t)
  }

  setTouchVisible(on: boolean): void { this.touchEl?.classList.toggle('hidden', !on || !this.input.isTouch) }

  // ------------------------------------------------------------ screens

  private clearScreen(): void {
    this.screenEl?.remove()
    this.screenEl = null
  }

  showScreen(name: ScreenName, data?: Record<string, unknown>): void {
    this.clearScreen()
    this.screen = name
    if (!name) return
    const s = h('div', 'screen')
    this.screenEl = s
    switch (name) {
      case 'title': this.buildTitle(s); break
      case 'newworld': this.buildNewWorld(s); break
      case 'online': this.buildOnline(s); break
      case 'settings': this.buildSettings(s, (data?.from as ScreenName) ?? 'title'); break
      case 'help': this.buildHelp(s, (data?.from as ScreenName) ?? 'title'); break
      case 'pause': this.buildPause(s, !!data?.online); break
      case 'death': this.buildDeath(s); break
      case 'loading': this.buildLoading(s, String(data?.text ?? 'جارٍ توليد العالم...')); break
      case 'confirm': this.buildConfirm(s, data as { text: string; ok: () => void; back: ScreenName }); break
    }
    this.root.append(s)
  }

  private btn(text: string, onClick: () => void, cls = ''): HTMLButtonElement {
    const b = h('button', `btn ${cls}`, text)
    b.addEventListener('click', () => { onClick() })
    return b
  }

  private buildTitle(s: HTMLElement): void {
    s.classList.add('pano')
    s.append(h('h1', 'logo', 'بلوك لاندز'), h('div', 'tagline', 'ابنِ، استكشف، وانجُ في عالم لا نهائي من المكعبات'))
    const m = h('div', 'menu')
    if (this.handlers.hasSave()) m.append(this.btn('متابعة العالم المحفوظ', () => this.handlers.onContinue(), 'green'))
    m.append(
      this.btn(this.handlers.hasSave() ? 'عالم جديد' : 'ابدأ اللعب', () => this.showScreen('newworld'), this.handlers.hasSave() ? '' : 'green'),
      this.btn('اللعب أونلاين مع الأصدقاء', () => this.showScreen('online')),
    )
    const row = h('div', 'menu row')
    const a = this.btn('الإعدادات', () => this.showScreen('settings', { from: 'title' }))
    const b = this.btn('طريقة اللعب', () => this.showScreen('help', { from: 'title' }))
    a.style.flex = b.style.flex = '1'
    row.append(a, b)
    m.append(row)
    s.append(m)
    s.append(h('div', 'panel-note', ''))
    const foot = h('div', 'note', 'يُحفظ العالم تلقائياً في متصفحك')
    foot.style.cssText = 'color:#bbb;font-size:16px;text-shadow:1px 1px 0 #000'
    s.append(foot)
  }

  private buildNewWorld(s: HTMLElement): void {
    s.classList.add('dirt')
    const p = h('div', 'panel')
    p.append(h('h2', '', 'عالم جديد'))
    let mode: 'survival' | 'creative' = 'survival'
    const seg = h('div', 'seg')
    const b1 = this.btn('بقاء', () => set('survival'), 'on')
    const b2 = this.btn('إبداعي', () => set('creative'))
    seg.append(b1, b2)
    const desc = h('p', '', '')
    const set = (m: 'survival' | 'creative') => {
      mode = m
      b1.classList.toggle('on', m === 'survival')
      b2.classList.toggle('on', m === 'creative')
      desc.textContent = m === 'survival' ? 'اجمع الموارد، اصنع الأدوات، وانجُ من الوحوش في الليل. عليك مراقبة صحتك وجوعك.' : 'كل الكتل بين يديك بلا حدود، وبإمكانك الطيران بالضغط مرتين على القفز. لا ضرر ولا جوع.'
    }
    set('survival')
    const f = h('div', 'field')
    f.innerHTML = '<label>بذرة العالم (اختياري)</label>'
    const inp = h('input') as HTMLInputElement
    inp.type = 'text'
    inp.placeholder = 'اتركها فارغة لعالم عشوائي'
    inp.maxLength = 24
    f.append(inp)
    const note = h('p', 'note', 'البذرة نفسها تعطي نفس العالم دائماً، شاركها مع أصدقائك.')
    p.append(seg, desc, f, note)
    const row = h('div', 'seg')
    row.append(this.btn('رجوع', () => this.showScreen('title')), this.btn('إنشاء العالم', () => {
      const go = () => this.handlers.onNewWorld(mode, inp.value.trim())
      if (this.handlers.hasSave()) this.showScreen('confirm', { text: 'سيتم استبدال عالمك المحفوظ بعالم جديد. هل أنت متأكد؟', ok: go, back: 'newworld' })
      else go()
    }, 'green'))
    p.append(row)
    s.append(p)
  }

  private buildConfirm(s: HTMLElement, d: { text: string; ok: () => void; back: ScreenName }): void {
    s.classList.add('dim')
    const p = h('div', 'panel')
    p.append(h('h2', '', 'تأكيد'), h('p', '', d.text))
    const row = h('div', 'seg')
    row.append(this.btn('إلغاء', () => this.showScreen(d.back)), this.btn('نعم، متأكد', () => d.ok(), 'red'))
    p.append(row)
    s.append(p)
  }

  private buildOnline(s: HTMLElement): void {
    s.classList.add('dirt')
    const p = h('div', 'panel online-panel')
    p.append(h('h2', '', 'اللعب أونلاين'))
    p.append(h('p', '', 'أنشئ غرفة برمز جديد وأرسله لصديقك، أو أدخل رمز غرفة موجودة. اختر خادماً من قائمتك أو احفظ عنواناً جديداً.'))
    const name = h('div', 'field')
    name.innerHTML = '<label>اسمك في اللعبة</label>'
    const ni = h('input') as HTMLInputElement
    ni.type = 'text'; ni.maxLength = 16; ni.value = this.settings.playerName; ni.placeholder = 'مثال: صقر'
    name.append(ni)
    const room = h('div', 'field')
    room.innerHTML = '<label>رمز الغرفة (شاركه مع صديقك)</label>'
    const ri = h('input', 'ltr') as HTMLInputElement
    const query = new URLSearchParams(location.search)
    const inviteRoom = query.get('room'), inviteServer = query.get('server')
    ri.type = 'text'; ri.maxLength = 24; ri.value = inviteRoom || this.settings.room; ri.placeholder = 'اضغط «غرفة جديدة»'
    if (inviteRoom) this.settings.room = inviteRoom
    ri.setAttribute('autocapitalize', 'off'); ri.setAttribute('autocorrect', 'off'); ri.spellcheck = false
    const roomRow = h('div', 'online-row')
    roomRow.append(ri, this.btn('غرفة جديدة', () => { ri.value = this.newRoomCode(); this.settings.room = ri.value; this.handlers.onSettings(this.settings) }, 'small'))
    room.append(roomRow)
    const srv = h('div', 'field')
    srv.innerHTML = '<label>عنوان السيرفر (WebSocket)</label>'
    const si = h('input', 'ltr') as HTMLInputElement
    si.type = 'text'; si.value = inviteServer || this.settings.serverUrl || this.handlers.getBootstrapUrl(); si.placeholder = 'wss://example.com/ws'
    if (inviteServer) this.settings.serverUrl = inviteServer
    si.setAttribute('autocapitalize', 'off'); si.setAttribute('autocorrect', 'off'); si.spellcheck = false
    const savedServers = h('select', 'server-select')
    savedServers.append(new Option('اختر سيرفراً محفوظاً…', ''))
    this.settings.servers.forEach((v, i) => savedServers.append(new Option(v.name, String(i))))
    savedServers.addEventListener('change', () => {
      if (!savedServers.value) return
      const server = this.settings.servers[Number(savedServers.value)]
      if (server) { si.value = server.url; this.settings.serverUrl = server.url; this.handlers.onSettings(this.settings) }
    })
    const serverName = h('input') as HTMLInputElement
    serverName.type = 'text'; serverName.maxLength = 24; serverName.placeholder = 'اسم السيرفر لحفظه'
    const serverRow = h('div', 'online-row')
    const saveServer = this.btn('حفظ السيرفر', () => {
      const url = si.value.trim(), name = serverName.value.trim() || `سيرفر ${this.settings.servers.length + 1}`
      if (!/^wss?:\/\/.+/i.test(url)) { st.textContent = 'أدخل عنواناً يبدأ بـ ws:// أو wss:// قبل الحفظ.'; st.className = 'status err'; return }
      const servers = this.settings.servers.filter(v => v.url !== url).concat({ name, url }).slice(-12)
      this.settings.servers = servers; this.settings.serverUrl = url; this.handlers.onServersChanged(servers); this.handlers.onSettings(this.settings)
      savedServers.innerHTML = ''; savedServers.append(new Option('اختر سيرفراً محفوظاً…', '')); servers.forEach((v, i) => savedServers.append(new Option(v.name, String(i))))
      serverName.value = ''; st.textContent = 'تم حفظ عنوان السيرفر على هذا الجهاز.'; st.className = 'status'
    }, 'small')
    const removeServer = this.btn('حذف المحدد', () => {
      const i = Number(savedServers.value)
      if (!Number.isInteger(i) || !this.settings.servers[i]) { st.textContent = 'اختر سيرفراً محفوظاً أولاً.'; st.className = 'status err'; return }
      this.settings.servers = this.settings.servers.filter((_, n) => n !== i); this.handlers.onServersChanged(this.settings.servers)
      savedServers.innerHTML = ''; savedServers.append(new Option('اختر سيرفراً محفوظاً…', '')); this.settings.servers.forEach((v, n) => savedServers.append(new Option(v.name, String(n))))
      st.textContent = 'حُذف السيرفر المحفوظ.'; st.className = 'status'
    }, 'small red')
    serverRow.append(serverName, saveServer, removeServer)
    const roomList = h('div', 'room-list')
    const browse = this.btn('استعراض الغرف النشطة', () => {
      const raw = si.value.trim()
      if (!/^wss?:\/\/.+/i.test(raw)) { st.textContent='أدخل عنوان السيرفر أولاً.'; st.className='status err'; return }
      roomList.replaceChildren(h('div','note','جارٍ تحميل الغرف…'))
      void (async()=>{
        try {
          const u=new URL(raw); u.protocol=u.protocol==='wss:'?'https:':'http:'; u.pathname='/rooms'; u.search=''; u.hash=''
          const res=await fetch(u.toString(),{cache:'no-store'}); if(!res.ok) throw new Error('rooms endpoint')
          const data=await res.json() as {rooms?:{code:string;players:number;capacity:number}[]}
          roomList.replaceChildren()
          const rooms=Array.isArray(data.rooms)?data.rooms:[]
          if(!rooms.length) roomList.append(h('div','note','لا توجد غرف نشطة الآن. أنشئ غرفة برمز جديد.'))
          for(const r of rooms) {
            const b=this.btn(`${r.code} · ${r.players}/${r.capacity} لاعب`,()=>{ri.value=r.code;this.settings.room=r.code;this.handlers.onSettings(this.settings)},'small')
            roomList.append(b)
          }
          st.textContent=`تم العثور على ${rooms.length} غرفة.`; st.className='status'
        } catch { roomList.replaceChildren(h('div','note','تعذّر استعراض الغرف. تأكد أن الخادم يدعم /rooms واتصال HTTPS.')); st.textContent='فشل جلب قائمة الغرف.'; st.className='status err' }
      })()
    }, 'small')
    const st = h('div', 'status', '')
    if (!si.value) { st.textContent = 'لا يوجد عنوان افتراضي. أدخل عنوان خادم WSS لتلعب أونلاين.'; st.classList.add('err') }
    p.append(name, room, srv, savedServers, si, serverRow, browse, roomList, st)
    const row = h('div', 'seg')
    const go = this.btn('اتصال', () => {
      const url = si.value.trim()
      if (!/^wss?:\/\/.+/i.test(url)) { st.textContent = 'عنوان الخادم يجب أن يبدأ بـ ws:// أو wss://'; st.className = 'status err'; return }
      const roomCode = ri.value.trim() || this.newRoomCode()
      ri.value = roomCode; this.settings.room = roomCode
      st.textContent = 'جارٍ الاتصال… أرسل الرمز لصديقك بعد دخول العالم.'; st.className = 'status'
      this.handlers.onOnline({ name: ni.value.trim() || 'لاعب', room: roomCode, url })
    }, 'green')
    row.append(this.btn('رجوع', () => this.showScreen('title')), go)
    p.append(row)
    s.append(p)
    this.onlineStatusEl = st
  }

  private newRoomCode(): string {
    const bytes = new Uint8Array(4)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, b => b.toString(36).padStart(2, '0')).join('').toUpperCase().slice(0, 8)
  }
  onlineStatusEl: HTMLElement | null = null
  setOnlineStatus(text: string, err: boolean): void {
    if (this.onlineStatusEl) { this.onlineStatusEl.textContent = text; this.onlineStatusEl.className = `status ${err ? 'err' : ''}` }
  }

  private buildSettings(s: HTMLElement, from: ScreenName): void {
    s.classList.add(from === 'pause' ? 'dim' : 'dirt')
    const p = h('div', 'panel')
    p.append(h('h2', '', 'الإعدادات'))
    const st = this.settings
    const slider = (label: string, min: number, max: number, step: number, val: number, fmt: (v: number) => string, on: (v: number) => void) => {
      const f = h('div', 'field')
      const lab = h('div', 'lab')
      const l1 = h('span', '', label), l2 = h('span', 'val', fmt(val))
      lab.append(l1, l2)
      const r = h('input') as HTMLInputElement
      r.type = 'range'; r.min = String(min); r.max = String(max); r.step = String(step); r.value = String(val)
      r.addEventListener('input', () => { const v = Number(r.value); l2.textContent = fmt(v); on(v); this.handlers.onSettings(st) })
      f.append(lab, r)
      p.append(f)
    }
    const toggle = (label: string, val: boolean, on: (v: boolean) => void) => {
      const t = h('div', 'toggle')
      t.append(h('span', '', label))
      const b = this.btn(val ? 'مفعّل' : 'متوقف', () => {}, 'small')
      let v = val
      b.addEventListener('click', () => { v = !v; b.textContent = v ? 'مفعّل' : 'متوقف'; b.classList.toggle('green', v); on(v); this.handlers.onSettings(st) })
      b.classList.toggle('green', v)
      t.append(b)
      p.append(t)
    }
    slider('مسافة العرض', 2, 12, 1, st.renderDistance, v => `${v} قطع`, v => { st.renderDistance = v })
    slider('حساسية النظر', 0.3, 2.5, 0.1, st.sensitivity, v => v.toFixed(1), v => { st.sensitivity = v })
    slider('زاوية الرؤية', 55, 105, 1, st.fov, v => `${v}°`, v => { st.fov = v })
    slider('مستوى الصوت', 0, 1, 0.05, st.volume, v => `${Math.round(v * 100)}%`, v => { st.volume = v })
    toggle('الموسيقى', st.music, v => { st.music = v })
    toggle('عرض الأداء والإحداثيات', st.showStats, v => { st.showStats = v })
    toggle('عكس محور النظر', st.invertY, v => { st.invertY = v })
    const binds = h('div', 'controls-config')
    binds.append(h('h3', '', 'تخصيص أزرار اللاعب'))
    const labels: [ControlAction, string][] = [['forward','تقدّم'],['backward','تراجع'],['left','يسار'],['right','يمين'],['jump','قفز'],['sprint','جري'],['sneak','تسلل'],['pause','إيقاف مؤقت'],['inventory','المخزون'],['chat','الدردشة'],['drop','رمي العنصر']]
    const pretty = (code: string) => code.replace(/^Key/, '').replace(/^Digit/, '').replace('ControlLeft','Ctrl يسار').replace('ShiftLeft','Shift يسار').replace('Space','مسافة').replace('Escape','Esc').replace('ArrowUp','↑').replace('ArrowDown','↓').replace('ArrowLeft','←').replace('ArrowRight','→')
    for (const [action, label] of labels) {
      const row = h('div', 'bind-row'); row.append(h('span', '', label))
      const button = this.btn(pretty(st.controls[action] || DEFAULT_BINDINGS[action]), () => {
        button.textContent = 'اضغط زرّاً…'; button.classList.add('green')
        const capture = (e: KeyboardEvent) => {
          if (e.code === 'Tab' || e.code === 'Escape') e.preventDefault()
          e.stopImmediatePropagation()
          st.controls[action] = e.code
          button.textContent = pretty(e.code); button.classList.remove('green')
          window.removeEventListener('keydown', capture, true)
          this.handlers.onSettings(st)
        }
        window.addEventListener('keydown', capture, true)
      }, 'small')
      row.append(button); binds.append(row)
    }
    const padLabels: [ControllerAction, string][] = [
      ['jump','قفز'],['sprint','جري'],['sneak','تسلل'],['attack','كسر / هجوم'],['place','وضع / استخدام'],['pause','إيقاف مؤقت'],['inventory','المخزون'],['chat','الدردشة'],['drop','رمي العنصر'],
      ...Array.from({ length: 9 }, (_, i) => [`slot${i + 1}`, `الخانة ${i + 1}`] as [ControllerAction, string]),
    ]
    const pad = h('div', 'controls-config')
    pad.append(h('h3', '', 'أزرار يد التحكم (Gamepad / PlayStation)'))
    for (const [action, label] of padLabels) {
      const row = h('div', 'bind-row')
      row.append(h('span', '', label))
      const btn = this.btn(st.controllerBindings[action] < 0 ? 'غير معيّن' : `زر ${st.controllerBindings[action]}`, () => {
        btn.textContent = 'اضغط زرّاً…'; btn.classList.add('green')
        this.input.listenForNextControllerButton(index => {
          st.controllerBindings[action] = index
          btn.textContent = `زر ${index}`; btn.classList.remove('green')
          this.handlers.onSettings(st)
        })
      }, 'small')
      row.append(btn); pad.append(row)
    }
    pad.append(this.btn('إعادة تعيين أزرار يد التحكم', () => {
      st.controllerBindings = { ...DEFAULT_GAMEPAD_BINDINGS }
      this.handlers.onSettings(st)
      pad.querySelectorAll<HTMLElement>('.bind-row button').forEach((b, i) => {
        const action = padLabels[i][0]
        b.textContent = st.controllerBindings[action] < 0 ? 'غير معيّن' : `زر ${st.controllerBindings[action]}`
      })
    }, 'small'))
    p.append(binds, pad)
    p.append(this.btn('تم', () => this.showScreen(from), 'green'))
    s.append(p)
  }

  private buildHelp(s: HTMLElement, from: ScreenName): void {
    s.classList.add(from === 'pause' ? 'dim' : 'dirt')
    const p = h('div', 'panel')
    p.append(h('h2', '', 'طريقة اللعب'))
    const k = h('div', 'keys')
    const rows: [string, string][] = [
      ['W A S D', 'الحركة'], ['الفأرة', 'النظر'], ['زر الفأرة الأيسر (اضغط مطولاً)', 'كسر الكتلة'], ['زر الفأرة الأيمن', 'وضع كتلة / استخدام طاولة الصناعة / أكل'],
      ['مسافة', 'قفز / سباحة للأعلى'], ['Shift', 'تسلل (لا تسقط من الحواف)'], ['Ctrl أو W مرتين', 'جري'], ['1 – 9 أو العجلة', 'اختيار الخانة'],
      ['E', 'المخزون والصناعة'], ['Q', 'رمي العنصر'], ['T', 'دردشة'], ['Tab', 'قائمة اللاعبين'], ['F3', 'الأداء والإحداثيات'], ['Esc', 'إيقاف مؤقت'],
    ]
    for (const [a, b] of rows) { const kb = h('kbd'); kb.textContent = a; k.append(kb, h('span', '', b)) }
    p.append(k)
    p.append(h('p', 'note', 'على الهاتف: العصا لليسار للحركة، اسحب على يمين الشاشة للنظر، اضغط ضغطة سريعة لوضع كتلة أو اضغط مطولاً لكسرها. في الوضع الإبداعي اضغط زر القفز مرتين للطيران.'))
    p.append(h('p', 'note', 'نصيحة: اكسر جذوع الأشجار، اصنع ألواحاً ثم طاولة صناعة، ومنها المعاول والفؤوس. الليل خطير، فابنِ مأوى قبل الغروب!'))
    p.append(this.btn('رجوع', () => this.showScreen(from), 'green'))
    s.append(p)
  }

  private buildPause(s: HTMLElement, online: boolean): void {
    s.classList.add('dim')
    const ph = h('h2', '', 'اللعبة متوقفة')
    ph.style.cssText = 'font-size:36px;margin:0;text-shadow:3px 3px 0 #000'
    s.append(ph)
    const m = h('div', 'menu')
    if (online) {
      const code = this.handlers.getRoomCode()
      const invite = h('div', 'room-invite')
      invite.append(h('span', '', 'رمز دعوة صديقك'))
      const value = h('strong', 'room-code')
      value.textContent = code || '—'
      invite.append(value)
      const copy = this.btn('نسخ الرمز', () => {
        if (!code) return
        if (navigator.clipboard) void navigator.clipboard.writeText(code).then(() => this.toast('تم نسخ رمز الغرفة')).catch(() => this.toast(`رمز الغرفة: ${code}`, 5000))
        else this.toast(`رمز الغرفة: ${code}`, 5000)
      }, 'small green')
      const copyLink = this.btn('نسخ رابط الدعوة', () => {
        if (!code) return
        const url = new URL(location.href)
        url.searchParams.set('server', this.settings.serverUrl || this.handlers.getBootstrapUrl())
        url.searchParams.set('room', code)
        if (navigator.clipboard) void navigator.clipboard.writeText(url.toString()).then(() => this.toast('تم نسخ رابط الدعوة')).catch(() => this.toast(url.toString(), 7000))
        else this.toast(url.toString(), 7000)
      }, 'small')
      invite.append(copy, copyLink)
      m.append(invite)
    } else m.append(h('div', 'room-invite muted', 'ادخل إلى خادم أونلاين أولاً لإنشاء رمز غرفة ومشاركته.'))
    m.append(
      this.btn('متابعة اللعب', () => this.handlers.onResume(), 'green'),
      this.btn('الإعدادات', () => this.showScreen('settings', { from: 'pause' })),
      this.btn('طريقة اللعب', () => this.showScreen('help', { from: 'pause' })),
    )
    if (!online) m.append(this.btn('حفظ العالم الآن', () => this.handlers.onSaveNow()))
    m.append(this.btn(online ? 'قطع الاتصال والعودة للقائمة' : 'حفظ والخروج للقائمة', () => this.handlers.onQuit(), 'red'))
    s.append(m)
  }

  private buildDeath(s: HTMLElement): void {
    s.style.background = 'rgba(120,0,0,0.55)'
    const t = h('h1', 'logo', 'لقد متّ!')
    t.style.fontSize = 'clamp(48px,12vw,96px)'
    const m = h('div', 'menu')
    m.append(this.btn('إعادة الإحياء', () => this.handlers.onRespawn(), 'green'), this.btn('الخروج للقائمة', () => this.handlers.onQuit(), 'red'))
    s.append(t, m)
  }

  private buildLoading(s: HTMLElement, text: string): void {
    s.classList.add('dirt')
    const fav = h('img', 'px') as HTMLImageElement
    fav.src = './favicon.svg'
    fav.width = fav.height = 72
    s.append(fav, h('h1', 'logo', 'بلوك لاندز'))
    const t = h('div', 'tagline', text)
    t.id = 'loadtext'
    const bar = h('div', 'loadbar')
    const fill = h('div')
    fill.id = 'loadfill'
    bar.append(fill)
    s.append(t, bar)
  }

  setLoading(frac: number, text?: string): void {
    const f = document.getElementById('loadfill')
    if (f) f.style.width = `${Math.round(frac * 100)}%`
    if (text) { const t = document.getElementById('loadtext'); if (t) t.textContent = text }
  }

  // ------------------------------------------------------------ inventory

  get inventoryOpen(): boolean { return !!this.invEl }

  openInventory(inv: Inventory, mode: 'survival' | 'creative', table: boolean, container?: { slots: (Slot | null)[]; onChange?: () => void }): void {
    if (this.invEl) return
    this.inventory = inv
    this.craftW = table ? 3 : 2
    this.craftGrid = new Array(this.craftW * this.craftW).fill(null)
    this.cursor = null
    const wrap = h('div', 'screen dim')
    const panel = h('div', 'inv')
    wrap.append(panel)
    const tip = h('div', 'tip', '&nbsp;')
    this.invEl = wrap
    const cursorEl = h('div', 'cursor-item')
    this.cursorEl = cursorEl
    document.body.append(cursorEl)

    const render = () => {
      panel.innerHTML = ''
      panel.append(h('h3', '', mode === 'creative' ? 'المخزون الإبداعي' : table ? 'طاولة الصناعة' : 'المخزون والصناعة'))
      if (mode === 'creative') {
        const pal = h('div', 'grid palette')
        pal.style.gridTemplateColumns = 'repeat(9, auto)'
        const ids = [...CREATIVE_BLOCKS, ...Object.keys(ITEMS).map(Number).filter(i => i >= 100)]
        for (const id of ids) {
          const e = this.slotEl(`s:${id}`)
          const s: Slot = { id, n: ITEMS[id].stack === 1 ? 1 : 64, dur: ITEMS[id].tool?.durability }
          this.fillSlot(e, s)
          e.addEventListener('pointerdown', ev => {
            ev.preventDefault()
            tip.textContent = itemName(id)
            const give: Slot = { id, n: s.n, dur: s.dur }
            // put in the first free hotbar slot, else replace the selected one
            let placed = false
            for (let i = 0; i < 9; i += 1) {
              const cur = inv.slots[i]
              if (cur && cur.id === id && !ITEMS[id].tool) { cur.n = Math.min(ITEMS[id].stack, cur.n + 16); placed = true; break }
            }
            for (let i = 0; i < 9 && !placed; i += 1) if (!inv.slots[i]) { inv.slots[i] = give; placed = true }
            if (!placed) inv.slots[inv.selected] = give
            inv.onChange?.()
            render()
          })
          pal.append(e)
        }
        panel.append(pal)
      } else {
        const craft = h('div', 'craft')
        const grid = h('div', 'grid')
        grid.style.gridTemplateColumns = `repeat(${this.craftW}, auto)`
        this.craftGrid.forEach((s, i) => {
          const e = this.slotEl(`c:${i}`)
          this.fillSlot(e, s)
          this.bindSlot(e, () => this.craftGrid[i], v => { this.craftGrid[i] = v }, tip, render)
          grid.append(e)
        })
        const arrow = h('div', 'arrow', '➜')
        const res = this.slotEl('r')
        const recipe = matchRecipe(this.craftGrid.map(s => s?.id ?? 0), this.craftW, this.craftW)
        if (recipe) this.fillSlot(res, { id: recipe.out, n: recipe.count, dur: ITEMS[recipe.out].tool?.durability })
        res.style.cursor = recipe ? 'pointer' : 'default'
        res.addEventListener('pointerdown', ev => {
          ev.preventDefault()
          if (!recipe) return
          tip.textContent = itemName(recipe.out)
          if (this.cursor && (this.cursor.id !== recipe.out || this.cursor.n + recipe.count > ITEMS[recipe.out].stack || ITEMS[recipe.out].tool)) return
          for (let i = 0; i < this.craftGrid.length; i += 1) {
            const c = this.craftGrid[i]
            if (c) { c.n -= 1; if (c.n <= 0) this.craftGrid[i] = null }
          }
          if (this.cursor) this.cursor.n += recipe.count
          else this.cursor = { id: recipe.out, n: recipe.count, dur: ITEMS[recipe.out].tool?.durability }
          this.handlers.onCraft()
          render()
        })
        craft.append(grid, arrow, res)
        panel.append(craft)
      }
      if (container) {
        panel.append(h('h3', '', 'الصندوق'))
        const chest = h('div', 'grid chest-grid')
        chest.style.gridTemplateColumns = 'repeat(9, auto)'
        container.slots.forEach((_, i) => {
          const e = this.slotEl(`b:${i}`)
          this.fillSlot(e, container.slots[i])
          this.bindSlot(e, () => container.slots[i], v => { container.slots[i] = v; container.onChange?.() }, tip, render)
          chest.append(e)
        })
        panel.append(chest)
      }
      if (mode !== 'creative') {
        panel.append(h('h3', '', 'الدروع'))
        const armor = h('div', 'grid armor-grid')
        armor.style.gridTemplateColumns = 'repeat(4, auto)'
        const armorSlots: [number, string, string][] = [[0,'الرأس','head'],[1,'الصدر','chest'],[2,'الساقان','legs'],[3,'القدمان','feet']]
        for (const [i, label, expected] of armorSlots) {
          const group = h('div', 'armor-cell')
          group.append(h('span', '', label))
          const e = this.slotEl(`a:${i}`)
          this.fillSlot(e, inv.armor[i])
          this.bindSlot(e, () => inv.armor[i], v => { inv.armor[i] = v }, tip, render, expected)
          group.append(e); armor.append(group)
        }
        panel.append(armor)
      }
      // main inventory (slots 9..35) then hotbar (0..8)
      const main = h('div', 'grid')
      main.style.gridTemplateColumns = 'repeat(9, auto)'
      for (let i = 9; i < 36; i += 1) {
        const e = this.slotEl(`i:${i}`)
        this.fillSlot(e, inv.slots[i])
        this.bindSlot(e, () => inv.slots[i], v => { inv.slots[i] = v }, tip, render)
        main.append(e)
      }
      const bar = h('div', 'grid')
      bar.style.gridTemplateColumns = 'repeat(9, auto)'
      bar.style.marginTop = '8px'
      for (let i = 0; i < 9; i += 1) {
        const e = this.slotEl(`i:${i}`)
        this.fillSlot(e, inv.slots[i])
        this.bindSlot(e, () => inv.slots[i], v => { inv.slots[i] = v }, tip, render)
        if (i === inv.selected) e.style.outline = '3px solid #fff'
        bar.append(e)
      }
      panel.append(main, bar, tip)
      const row = h('div', 'row')
      if (mode === 'creative') row.append(this.btn('حذف العنصر الحالي', () => { this.cursor = null; render() }, 'small'))
      row.append(this.btn('إغلاق', () => this.closeInventory(true), 'small green'))
      panel.append(row)
      this.updateCursor()
      inv.onChange?.()
    }
    render()
    // dropping outside the panel throws the held stack
    wrap.addEventListener('pointerdown', e => {
      if (e.target === wrap && this.cursor) {
        const slot = e.button === 2 && this.cursor.n > 1 ? { ...this.cursor, n: 1 } : this.cursor
        this.handlers.onDrop(slot)
        if (slot === this.cursor) this.cursor = null; else this.cursor.n -= 1
        this.updateCursor()
      }
    })
    wrap.addEventListener('contextmenu', e => e.preventDefault())
    this.root.append(wrap)
  }

  openFurnace(onSmelt: (kind: 'iron' | 'gold') => boolean, onClose: () => void): void {
    const wrap = h('div', 'screen dim')
    const panel = h('div', 'panel furnace-panel')
    panel.append(h('h2', '', 'الفرن'))
    const status = h('div', 'status', 'اختر المعدن المراد صهره.')
    let closed = false
    const close = () => { if (closed) return; closed = true; wrap.remove(); onClose() }
    const row = h('div', 'seg')
    for (const [kind, label] of [['iron','صهر الحديد'],['gold','صهر الذهب']] as const) {
      row.append(this.btn(label, () => {
        const ok = onSmelt(kind)
        status.textContent = ok ? `تم صهر ${kind === 'iron' ? 'الحديد' : 'الذهب'} بنجاح.` : `تعذّر صهر ${kind === 'iron' ? 'الحديد' : 'الذهب'}؛ تحقق من المواد.`
        status.className = `status ${ok ? 'ok' : 'err'}`
      }, 'small green'))
    }
    panel.append(row, status, this.btn('إغلاق', close, 'small'))
    wrap.append(panel)
    wrap.addEventListener('pointerdown', e => { if (e.target === wrap) close() })
    this.root.append(wrap)
  }

  private slotEl(id: string): HTMLElement {
    const e = h('div', 'slot')
    e.dataset.ref = id
    return e
  }

  private bindSlot(el: HTMLElement, get: () => Slot | null, set: (s: Slot | null) => void, tip: HTMLElement, render: () => void, armorSlot?: string): void {
    el.addEventListener('pointerdown', ev => {
      ev.preventDefault()
      const right = ev.button === 2
      const cur = get()
      if (cur) tip.textContent = itemName(cur.id)
      const c = this.cursor
      if (armorSlot && c && ITEMS[c.id]?.armorSlot !== armorSlot) { tip.textContent = 'هذا الدرع لا يناسب هذه الخانة'; return }
      if (!c) {
        if (!cur) return
        if (right && cur.n > 1) {
          const take = Math.ceil(cur.n / 2)
          this.cursor = { ...cur, n: take }
          cur.n -= take
        } else { this.cursor = cur; set(null) }
      } else if (!cur) {
        if (right && c.n > 1) { set({ ...c, n: 1 }); c.n -= 1 } else { set(c); this.cursor = null }
      } else if (cur.id === c.id && !ITEMS[c.id].tool) {
        const max = ITEMS[c.id].stack
        const amount = right ? 1 : c.n
        const move = Math.min(amount, max - cur.n)
        cur.n += move
        c.n -= move
        if (c.n <= 0) this.cursor = null
      } else { set(c); this.cursor = cur }
      render()
    })
    el.addEventListener('contextmenu', e => e.preventDefault())
  }

  private updateCursor(): void {
    const el = this.cursorEl
    if (!el) return
    el.innerHTML = ''
    if (this.cursor) {
      const img = h('img') as HTMLImageElement
      img.src = this.icon(this.cursor.id)
      el.append(img)
      if (this.cursor.n > 1) el.append(h('span', 'cnt', String(this.cursor.n)))
    }
  }

  closeInventory(notify = false): void {
    if (!this.invEl) return
    const inv = this.inventory!
    // return crafting grid + cursor contents to inventory (drop overflow)
    const back = (s: Slot | null) => {
      if (!s) return
      const left = inv.add(s.id, s.n)
      if (left > 0) this.handlers.onDrop({ ...s, n: left })
    }
    this.craftGrid.forEach(back)
    back(this.cursor)
    this.craftGrid = []
    this.cursor = null
    this.invEl.remove()
    this.invEl = null
    this.cursorEl?.remove()
    this.cursorEl = null
    inv.onChange?.()
    if (notify) this.handlers.onInventoryClosed()
  }
}

void B
void I
