import * as THREE from 'three'
import { buildHumanoid, type Humanoid } from './mobs'
import type { World } from './world'

export const PROTOCOL = 'blocklands-3'

export type NetStatus = 'idle' | 'connecting' | 'online' | 'error'

export interface Welcome { id: string; name: string; seed: number; room: string; time: number }

interface RemotePlayer {
  id: string
  name: string
  model: Humanoid
  tag: THREE.Sprite
  target: THREE.Vector3
  vel: THREE.Vector3
  yaw: number
  pitch: number
  targetYaw: number
  phase: number
  flags: number
  lastPose: number
}

function nameTag(name: string): THREE.Sprite {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 48
  const g = c.getContext('2d')!
  g.font = 'bold 26px ReemKufi, sans-serif'
  const w = Math.min(244, g.measureText(name).width + 24)
  g.fillStyle = 'rgba(0,0,0,0.55)'
  g.fillRect((256 - w) / 2, 6, w, 36)
  g.fillStyle = '#fff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.direction = 'rtl'
  g.fillText(name, 128, 25)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, fog: false }))
  s.scale.set(1.5, 0.28, 1)
  s.renderOrder = 10
  return s
}

const hueColor = (id: string, l: number) => {
  let h = 0
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 360
  return `hsl(${h},55%,${l}%)`
}

export class NetClient {
  status: NetStatus = 'idle'
  me: Welcome | null = null
  ws: WebSocket | null = null
  latency = 0
  players = new Map<string, RemotePlayer>()
  onChat: ((name: string, text: string, system: boolean) => void) | null = null
  onStatus: ((s: NetStatus, reason?: string) => void) | null = null
  onBlock: ((x: number, y: number, z: number, id: number) => void) | null = null
  onRoster: (() => void) | null = null
  private pingTimer = 0
  private lastSent = 0
  private lastPos = new THREE.Vector3()

  constructor(private scene: THREE.Scene) {}

  get online(): boolean { return this.status === 'online' }

  async loadBootstrap(): Promise<string> {
    try {
      const r = await fetch('./multiplayer/bootstrap.json', { cache: 'no-store' })
      if (!r.ok) return ''
      const j = await r.json()
      return typeof j.signalingUrl === 'string' ? j.signalingUrl : ''
    } catch { return '' }
  }

  connect(url: string, room: string, name: string, onEdits: (flat: number[]) => void): Promise<Welcome> {
    this.disconnect()
    this.setStatus('connecting')
    return new Promise((resolve, reject) => {
      let ws: WebSocket
      try { ws = new WebSocket(url) } catch { this.setStatus('error', 'bad_url'); reject(new Error('bad_url')); return }
      this.ws = ws
      let settled = false
      const fail = (reason: string) => {
        if (settled) return
        settled = true
        this.setStatus('error', reason)
        try { ws.close() } catch { /* ignore */ }
        reject(new Error(reason))
      }
      const timer = window.setTimeout(() => fail('timeout'), 10000)
      ws.onopen = () => ws.send(JSON.stringify({ t: 'join', v: PROTOCOL, name, room }))
      ws.onerror = () => fail('connect')
      let welcome: Welcome | null = null
      let roster: { id: string; name: string; x: number; y: number; z: number; yaw: number; pitch: number; f: number }[] = []
      ws.onmessage = ev => {
        let m: Record<string, unknown>
        try { m = JSON.parse(ev.data as string) } catch { return }
        switch (m.t) {
          case 'welcome':
            welcome = { id: m.id as string, name: m.name as string, seed: m.seed as number, room: m.room as string, time: m.time as number }
            roster = m.players as typeof roster
            break
          case 'edits':
            onEdits(m.d as number[])
            if (m.last && welcome && !settled) {
              settled = true
              window.clearTimeout(timer)
              this.me = welcome
              this.setStatus('online')
              for (const p of roster) this.addPlayer(p.id, p.name, p.x, p.y, p.z, p.yaw, p.pitch)
              this.startPing()
              resolve(welcome)
            }
            break
          case 'error': fail(String(m.reason)); break
          default: this.handle(m)
        }
      }
      ws.onclose = () => {
        window.clearTimeout(timer)
        if (!settled) { fail('closed'); return }
        if (this.status === 'online') { this.cleanup(); this.setStatus('error', 'lost') }
      }
    })
  }

  private handle(m: Record<string, unknown>): void {
    switch (m.t) {
      case 'join': this.addPlayer(m.id as string, m.name as string, 0, -100, 0, 0, 0); this.onChat?.(m.name as string, 'انضم إلى العالم', true); break
      case 'leave': this.removePlayer(m.id as string); this.onChat?.(m.name as string, 'غادر العالم', true); break
      case 'pose': {
        const p = this.players.get(m.id as string)
        if (!p) return
        const now = performance.now()
        const first = p.lastPose === 0
        const nx = m.x as number, ny = m.y as number, nz = m.z as number
        const dt = Math.max(0.016, (now - p.lastPose) / 1000)
        if (!first) p.vel.set((nx - p.target.x) / dt, (ny - p.target.y) / dt, (nz - p.target.z) / dt)
        p.target.set(nx, ny, nz)
        p.targetYaw = m.yaw as number
        p.pitch = m.pitch as number
        p.flags = (m.f as number) | 0
        p.lastPose = now
        if (first) { p.model.group.position.set(nx, ny, nz); p.yaw = p.targetYaw }
        break
      }
      case 'block': this.onBlock?.(m.x as number, m.y as number, m.z as number, m.id as number); break
      case 'chat': this.onChat?.(m.name as string, m.text as string, false); break
      case 'pong': this.latency = Math.round(performance.now() - (m.ts as number)); break
      default:
    }
  }

  private addPlayer(id: string, name: string, x: number, y: number, z: number, yaw: number, pitch: number): void {
    if (this.players.has(id)) return
    const model = buildHumanoid({ skin: '#d9a273', shirt: hueColor(id, 45), pants: hueColor(id + 'p', 30), hair: '#4a3020', eye: '#2a4aa8', mouth: '#7a3b2b' }, id.length * 977)
    const tag = nameTag(name)
    tag.position.y = 2.1
    model.group.add(tag)
    model.group.position.set(x, y, z)
    this.scene.add(model.group)
    this.players.set(id, { id, name, model, tag, target: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), yaw, pitch, targetYaw: yaw, phase: 0, flags: 0, lastPose: 0 })
    this.onRoster?.()
  }

  private removePlayer(id: string): void {
    const p = this.players.get(id)
    if (!p) return
    this.scene.remove(p.model.group)
    this.players.delete(id)
    this.onRoster?.()
  }

  private startPing(): void {
    window.clearInterval(this.pingTimer)
    this.pingTimer = window.setInterval(() => this.send({ t: 'ping', ts: performance.now() }), 2000)
  }

  private send(o: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(o))
  }

  sendPose(pos: THREE.Vector3, yaw: number, pitch: number, flags: number, force = false): void {
    if (!this.online) return
    const now = performance.now()
    const moved = pos.distanceToSquared(this.lastPos) > 0.0004
    if (!force && now - this.lastSent < (moved ? 50 : 500)) return
    this.lastSent = now
    this.lastPos.copy(pos)
    this.send({ t: 'pose', x: +pos.x.toFixed(3), y: +pos.y.toFixed(3), z: +pos.z.toFixed(3), yaw: +yaw.toFixed(3), pitch: +pitch.toFixed(3), f: flags, lat: this.latency })
  }

  sendBlock(x: number, y: number, z: number, id: number): void { this.send({ t: 'block', x, y, z, id }) }
  sendChat(text: string): void { this.send({ t: 'chat', text }) }

  update(dt: number, camPos: THREE.Vector3): void {
    for (const p of this.players.values()) {
      const g = p.model.group
      // project the last known pose forward by its age (capped) so players are drawn in the present
      const age = Math.min(0.2, (performance.now() - p.lastPose) / 1000 + this.latency / 2000)
      const tx = p.target.x + p.vel.x * age * 0.6, tz = p.target.z + p.vel.z * age * 0.6, ty = p.target.y
      if (Math.hypot(tx - g.position.x, tz - g.position.z) > 6) g.position.set(tx, ty, tz)
      else {
        const a = 1 - Math.exp(-14 * dt)
        g.position.x += (tx - g.position.x) * a
        g.position.y += (ty - g.position.y) * a
        g.position.z += (tz - g.position.z) * a
      }
      let dy = p.targetYaw - p.yaw
      dy = Math.atan2(Math.sin(dy), Math.cos(dy))
      p.yaw += dy * (1 - Math.exp(-14 * dt))
      g.rotation.y = p.yaw + Math.PI
      p.model.head.rotation.x = -p.pitch * 0.8
      const hv = Math.hypot(p.vel.x, p.vel.z) * (performance.now() - p.lastPose < 400 ? 1 : 0)
      p.phase += hv * dt * 2.4
      const sw = Math.sin(p.phase) * Math.min(1, hv / 3) * 0.9
      p.model.legL.rotation.x = sw; p.model.legR.rotation.x = -sw
      p.model.armL.rotation.x = -sw; p.model.armR.rotation.x = sw
      const d = g.position.distanceTo(camPos)
      p.tag.visible = d < 48
    }
  }

  setBrightness(v: number): void {
    for (const p of this.players.values()) for (const m of p.model.mats) m.color.setScalar(Math.max(0.35, v))
  }

  roster(): string[] { return [...this.players.values()].map(p => p.name) }

  private setStatus(s: NetStatus, reason?: string): void {
    this.status = s
    this.onStatus?.(s, reason)
  }

  private cleanup(): void {
    window.clearInterval(this.pingTimer)
    for (const id of [...this.players.keys()]) this.removePlayer(id)
  }

  disconnect(): void {
    window.clearInterval(this.pingTimer)
    if (this.ws) {
      this.ws.onclose = null
      this.ws.onerror = null
      try { this.ws.close() } catch { /* ignore */ }
      this.ws = null
    }
    this.cleanup()
    this.me = null
    if (this.status !== 'idle') this.setStatus('idle')
  }

  /** Apply remote edits to the world, tolerant of unloaded chunks. */
  static applyEdits(world: World, flat: number[]): void {
    for (let i = 0; i + 3 < flat.length; i += 4) world.stageEdit(flat[i], flat[i + 1], flat[i + 2], flat[i + 3])
  }
}
