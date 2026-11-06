import * as THREE from 'three'
import { B, I } from '../core/blocks'
import { Body } from './physics'
import type { Player } from './player'
import type { World } from './world'
import type { GameAudio } from './audio'
import type { Input } from './input'
import { mulberry32 } from '../core/noise'
import { CONFIG } from './config'

// ------------------------------------------------------------------ textures & parts

function tex(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = size
  draw(c.getContext('2d')!, size)
  const t = new THREE.CanvasTexture(c)
  t.magFilter = THREE.NearestFilter
  t.minFilter = THREE.NearestFilter
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function noisy(color: string, seed: number, amount = 0.14): THREE.CanvasTexture {
  return tex(16, (c, s) => {
    const rnd = mulberry32(seed)
    c.fillStyle = color
    c.fillRect(0, 0, s, s)
    for (let y = 0; y < s; y += 1) for (let x = 0; x < s; x += 1) {
      c.fillStyle = rnd() < 0.5 ? `rgba(0,0,0,${rnd() * amount})` : `rgba(255,255,255,${rnd() * amount * 0.6})`
      c.fillRect(x, y, 1, 1)
    }
  })
}

const lam = (map: THREE.Texture) => new THREE.MeshLambertMaterial({ map })

function box(w: number, h: number, d: number, mats: THREE.Material | THREE.Material[], ox = 0, oy = 0, oz = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats)
  m.position.set(ox, oy, oz)
  return m
}

export interface HumanoidColors { skin: string; shirt: string; pants: string; hair?: string; eye: string; mouth: string }

export interface Humanoid {
  group: THREE.Group
  head: THREE.Group
  armL: THREE.Group
  armR: THREE.Group
  legL: THREE.Group
  legR: THREE.Group
  mats: THREE.MeshLambertMaterial[]
}

export function buildHumanoid(c: HumanoidColors, seed: number): Humanoid {
  const mats: THREE.MeshLambertMaterial[] = []
  const mk = (t: THREE.Texture) => { const m = lam(t); mats.push(m); return m }
  const skinTex = noisy(c.skin, seed)
  const hairTex = noisy(c.hair ?? c.skin, seed + 1, 0.2)
  const face = tex(16, (g, s) => {
    g.fillStyle = c.skin; g.fillRect(0, 0, s, s)
    if (c.hair) { g.fillStyle = c.hair; g.fillRect(0, 0, s, 4); g.fillRect(0, 4, 2, 4); g.fillRect(14, 4, 2, 4) }
    g.fillStyle = '#ffffff'; g.fillRect(3, 8, 3, 2); g.fillRect(10, 8, 3, 2)
    g.fillStyle = c.eye; g.fillRect(4, 8, 2, 2); g.fillRect(10, 8, 2, 2)
    g.fillStyle = c.mouth; g.fillRect(6, 12, 4, 1)
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(7, 10, 2, 2)
  })
  const shirt = mk(noisy(c.shirt, seed + 2))
  const pants = mk(noisy(c.pants, seed + 3))
  const sleeve = tex(16, (g, s) => {
    g.fillStyle = c.skin; g.fillRect(0, 0, s, s)
    g.fillStyle = c.shirt; g.fillRect(0, 0, s, 5)
    g.fillStyle = 'rgba(0,0,0,0.08)'
    for (let i = 0; i < 20; i += 1) g.fillRect((i * 7) % s, (i * 5) % s, 1, 1)
  })
  const headMats = [mk(skinTex), mk(skinTex), mk(hairTex), mk(skinTex), mk(face), mk(c.hair ? hairTex : skinTex)]
  const group = new THREE.Group()
  const head = new THREE.Group()
  head.position.y = 1.5
  head.add(box(0.5, 0.5, 0.5, headMats, 0, 0.25, 0))
  const body = box(0.5, 0.75, 0.25, shirt, 0, 1.125, 0)
  const mkArm = (x: number) => {
    const g = new THREE.Group()
    g.position.set(x, 1.5, 0)
    g.add(box(0.25, 0.75, 0.25, mk(sleeve), 0, -0.375 + 0.03, 0))
    return g
  }
  const mkLeg = (x: number) => {
    const g = new THREE.Group()
    g.position.set(x, 0.75, 0)
    g.add(box(0.25, 0.75, 0.25, pants, 0, -0.375, 0))
    return g
  }
  const armL = mkArm(0.375), armR = mkArm(-0.375)
  const legL = mkLeg(0.125), legR = mkLeg(-0.125)
  group.add(head, body, armL, armR, legL, legR)
  return { group, head, armL, armR, legL, legR, mats }
}

interface Quad { group: THREE.Group; head: THREE.Group; legs: THREE.Group[]; mats: THREE.MeshLambertMaterial[] }

function buildPig(seed: number): Quad {
  const mats: THREE.MeshLambertMaterial[] = []
  const mk = (t: THREE.Texture) => { const m = lam(t); mats.push(m); return m }
  const pink = mk(noisy('#f0a4ac', seed))
  const snoutTex = noisy('#e0848f', seed + 1)
  const face = tex(16, (g, s) => {
    g.fillStyle = '#f0a4ac'; g.fillRect(0, 0, s, s)
    g.fillStyle = '#ffffff'; g.fillRect(2, 5, 3, 2); g.fillRect(11, 5, 3, 2)
    g.fillStyle = '#2a1a5a'; g.fillRect(3, 5, 2, 2); g.fillRect(11, 5, 2, 2)
  })
  const snoutFace = tex(16, (g, s) => {
    g.fillStyle = '#e0848f'; g.fillRect(0, 0, s, s)
    g.fillStyle = '#7a3040'; g.fillRect(4, 6, 2, 3); g.fillRect(10, 6, 2, 3)
  })
  const group = new THREE.Group()
  group.add(box(0.625, 0.5, 1, pink, 0, 0.62, 0))
  const head = new THREE.Group()
  head.position.set(0, 0.7, 0.55)
  head.add(box(0.5, 0.5, 0.5, [pink, pink, pink, pink, mk(face), pink], 0, 0, 0.1))
  head.add(box(0.25, 0.19, 0.08, [mk(snoutTex), mk(snoutTex), mk(snoutTex), mk(snoutTex), mk(snoutFace), mk(snoutTex)], 0, -0.1, 0.39))
  group.add(head)
  const legs: THREE.Group[] = []
  for (const [x, z] of [[0.2, 0.32], [-0.2, 0.32], [0.2, -0.32], [-0.2, -0.32]]) {
    const g = new THREE.Group()
    g.position.set(x, 0.375, z)
    g.add(box(0.25, 0.375, 0.25, pink, 0, -0.1875, 0))
    group.add(g)
    legs.push(g)
  }
  return { group, head, legs, mats }
}

function buildCow(seed: number): Quad {
  const mats: THREE.MeshLambertMaterial[] = []
  const mk = (t: THREE.Texture) => { const m = lam(t); mats.push(m); return m }
  const hide = tex(16, (g, s) => {
    const rnd = mulberry32(seed)
    g.fillStyle = '#4a2f1e'; g.fillRect(0, 0, s, s)
    g.fillStyle = '#f2efe6'
    for (let i = 0; i < 3; i += 1) g.fillRect(Math.floor(rnd() * 10), Math.floor(rnd() * 10), 3 + Math.floor(rnd() * 4), 3 + Math.floor(rnd() * 3))
    for (let y = 0; y < s; y += 1) for (let x = 0; x < s; x += 1) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.12})`; g.fillRect(x, y, 1, 1) }
  })
  const hideM = mk(hide)
  const dark = mk(noisy('#4a2f1e', seed + 4))
  const face = tex(16, (g, s) => {
    g.fillStyle = '#4a2f1e'; g.fillRect(0, 0, s, s)
    g.fillStyle = '#d8c3a8'; g.fillRect(3, 9, 10, 6)
    g.fillStyle = '#3a2418'; g.fillRect(5, 11, 2, 2); g.fillRect(9, 11, 2, 2)
    g.fillStyle = '#ffffff'; g.fillRect(2, 4, 3, 2); g.fillRect(11, 4, 3, 2)
    g.fillStyle = '#111'; g.fillRect(3, 4, 2, 2); g.fillRect(11, 4, 2, 2)
  })
  const group = new THREE.Group()
  group.add(box(0.75, 0.7, 1.15, hideM, 0, 1.0, 0))
  const head = new THREE.Group()
  head.position.set(0, 1.25, 0.65)
  head.add(box(0.5, 0.5, 0.4, [dark, dark, dark, dark, mk(face), dark], 0, 0, 0.12))
  const horn = mk(noisy('#e8e2cc', seed + 7))
  head.add(box(0.1, 0.18, 0.1, horn, 0.3, 0.3, 0.1), box(0.1, 0.18, 0.1, horn, -0.3, 0.3, 0.1))
  group.add(head)
  const legs: THREE.Group[] = []
  for (const [x, z] of [[0.24, 0.42], [-0.24, 0.42], [0.24, -0.42], [-0.24, -0.42]]) {
    const g = new THREE.Group()
    g.position.set(x, 0.65, z)
    g.add(box(0.25, 0.65, 0.25, dark, 0, -0.325, 0))
    group.add(g)
    legs.push(g)
  }
  return { group, head, legs, mats }
}


function buildCreeper(seed: number): Quad {
  const mats: THREE.MeshLambertMaterial[] = []
  const mk = (t: THREE.Texture) => { const m = lam(t); mats.push(m); return m }
  const green = mk(noisy('#55a83d', seed, 0.2))
  const face = tex(16, (g, s) => {
    g.fillStyle = '#57a943'; g.fillRect(0,0,s,s)
    g.fillStyle = '#172318'; g.fillRect(3,4,3,4); g.fillRect(10,4,3,4)
    g.fillRect(6,8,4,2); g.fillRect(5,10,6,3); g.fillRect(7,13,2,2)
  })
  const group = new THREE.Group()
  group.add(box(0.68,0.82,0.43,green,0,0.82,0))
  const head = new THREE.Group(); head.position.set(0,1.34,0.02)
  head.add(box(0.62,0.62,0.62,[green,green,green,green,mk(face),green],0,0.18,0))
  group.add(head)
  const legs: THREE.Group[] = []
  for (const [x,z] of [[0.22,0.17],[-0.22,0.17],[0.22,-0.17],[-0.22,-0.17]]) {
    const leg = new THREE.Group(); leg.position.set(x,0.4,z); leg.add(box(0.26,0.42,0.26,green,0,-0.2,0)); group.add(leg); legs.push(leg)
  }
  return { group, head, legs, mats }
}

function buildSkeleton(seed: number): Humanoid {
  const h = buildHumanoid({ skin: '#d8d3bd', shirt: '#d2cdb8', pants: '#b7b19a', eye: '#17171b', mouth: '#17171b' }, seed)
  const rib = new THREE.MeshLambertMaterial({ color: '#716d62' }); h.mats.push(rib)
  for (let i=0;i<3;i+=1) h.group.add(box(0.39,0.045,0.025,rib,0,1.31-i*0.16,0.145))
  return h
}

function buildDragon(seed: number): { parts: Humanoid; wings: THREE.Group[] } {
  const parts = buildHumanoid({ skin: '#211d31', shirt: '#302544', pants: '#242033', eye: '#e45cff', mouth: '#120e1c' }, seed)
  parts.group.scale.setScalar(2.7)
  const membrane = new THREE.MeshLambertMaterial({ color: '#30203e', side: THREE.DoubleSide })
  const bone = new THREE.MeshLambertMaterial({ color: '#57405f' })
  const wings: THREE.Group[] = []
  for (const side of [-1,1]) {
    const wing = new THREE.Group(); wing.position.set(side*0.68,1.55,0)
    const panel = box(1.9,0.12,2.35,membrane,side*0.85,0,-0.7)
    const spar = box(0.12,0.16,2.45,bone,side*0.9,0,-0.72)
    const tip = box(1.75,0.12,0.14,bone,side*1.65,0,-1.85)
    wing.add(panel,spar,tip); parts.group.add(wing); wings.push(wing)
  }
  const tail = new THREE.MeshLambertMaterial({ color: '#241d34' })
  for(let i=0;i<5;i+=1) parts.group.add(box(0.34-i*0.045,0.35-i*0.04,0.54,tail,0,0.7-i*0.16,-0.42-i*0.38))
  const hornMat = new THREE.MeshLambertMaterial({ color: '#b3a5c0' })
  parts.head.add(box(0.12,0.28,0.12,hornMat,0.18,0.6,0),box(0.12,0.28,0.12,hornMat,-0.18,0.6,0))
  return { parts, wings }
}

// ------------------------------------------------------------------ mobs

export type MobKind = 'zombie' | 'pig' | 'cow' | 'skeleton' | 'creeper' | 'dragon' | 'petDragon'

export interface Mob {
  kind: MobKind
  body: Body
  group: THREE.Group
  health: number
  yaw: number
  targetYaw: number
  phase: number
  walkSpeed: number
  state: 'idle' | 'wander' | 'flee'
  stateTimer: number
  hurtT: number
  attackCd: number
  dead: number
  burn: number
  soundT: number
  parts: Humanoid | Quad
  mats: THREE.MeshLambertMaterial[]
  hostile: boolean
  fuse: number
  home: THREE.Vector3
  wings?: THREE.Group[]
  tamed?: boolean
  growth?: number
}

export type PetDragonInteraction =
  | { action: 'fed'; foodId: number; consume: 1; message: string }
  | { action: 'tamed'; foodId: number; consume: 1; message: string }
  | { action: 'mounted' | 'dismounted'; message: string }
  | { action: 'not-found' | 'too-far' | 'not-ready' | 'not-food'; message: string }

export interface MobHooks {
  drop: (id: number, n: number, x: number, y: number, z: number) => void
}

const SIZES: Record<MobKind, [number, number]> = { zombie: [0.6, 1.95], pig: [0.8, 0.9], cow: [0.9, 1.4], skeleton: [0.62, 1.95], creeper: [0.82, 1.7], dragon: [3.2, 3.4], petDragon: [1.25, 1.45] }

interface Arrow { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number }

export class MobManager {
  mobs: Mob[] = []
  enabled = true
  private spawnT = 1
  private seedCounter = 1
  private arrows: Arrow[] = []
  private mountedMob: Mob | null = null

  get mounted(): boolean { return this.mountedMob !== null }

  constructor(private world: World, private scene: THREE.Scene, private player: Player, private audio: GameAudio, private hooks: MobHooks) {}

  clear(): void {
    for (const m of this.mobs) this.scene.remove(m.group)
    this.mobs = []
    for (const a of this.arrows) { this.scene.remove(a.mesh); a.mesh.geometry.dispose() }
    this.arrows = []
  }

  spawn(kind: MobKind, x: number, y: number, z: number): Mob {
    const s = this.seedCounter++ * 31
    const [w, h] = SIZES[kind]
    let parts: Humanoid | Quad
    let wings: THREE.Group[] | undefined
    if (kind === 'petDragon') {
      const d = buildDragon(s); parts = d.parts; wings = d.wings
      parts.group.scale.setScalar(0.55)
    } else if (kind === 'zombie') {
      parts = buildHumanoid({ skin: '#5a9a48', shirt: '#2b8f93', pants: '#3b3a96', eye: '#101a08', mouth: '#1a2a10' }, s)
      parts.armL.rotation.x = -Math.PI / 2.1; parts.armR.rotation.x = -Math.PI / 2.1
    } else if (kind === 'skeleton') parts = buildSkeleton(s)
    else if (kind === 'creeper') parts = buildCreeper(s)
    else if (kind === 'dragon') { const d = buildDragon(s); parts = d.parts; wings = d.wings }
    else parts = kind === 'pig' ? buildPig(s) : buildCow(s)
    const body = new Body(w, h)
    body.pos.set(x, y, z)
    const hostile = kind === 'zombie' || kind === 'skeleton' || kind === 'creeper' || kind === 'dragon'
    const mob: Mob = {
      kind, body, group: parts.group, health: kind === 'dragon' ? 200 : kind === 'zombie' || kind === 'skeleton' ? 20 : kind === 'creeper' ? 18 : 10, yaw: Math.random() * 6.28, targetYaw: 0, phase: Math.random()*6.28,
      walkSpeed: kind === 'zombie' ? 2.7 : kind === 'skeleton' ? 2.1 : kind === 'creeper' ? 2.5 : 1.3, state: 'idle', stateTimer: Math.random() * 3, hurtT: 0, attackCd: 0, dead: 0, burn: 0,
      soundT: 3 + Math.random() * 8, parts, mats: parts.mats, hostile, fuse: 0, home: new THREE.Vector3(x,y,z), wings,
      ...(kind === 'petDragon' ? { tamed: false, growth: 0 } : {}),
    }
    mob.targetYaw = mob.yaw
    this.scene.add(parts.group)
    this.mobs.push(mob)
    return mob
  }

  /** Hatch a small, untamed companion; it is never included in natural mob spawns. */
  spawnPetDragon(x: number, y: number, z: number): Mob { return this.spawn('petDragon', x, y, z) }

  snapshotPets(): { x: number; y: number; z: number; yaw: number; tamed: boolean; growth: number }[] {
    return this.mobs.filter(m => m.kind === 'petDragon' && m.dead === 0).map(m => ({ x: m.body.pos.x, y: m.body.pos.y, z: m.body.pos.z, yaw: m.yaw, tamed: !!m.tamed, growth: m.growth ?? 0 }))
  }

  restorePets(saved: { x: number; y: number; z: number; yaw: number; tamed: boolean; growth: number }[]): void {
    for (const p of saved.slice(0, 12)) {
      const m = this.spawnPetDragon(p.x, p.y, p.z)
      m.yaw = p.yaw; m.tamed = p.tamed; m.growth = Math.max(0, Math.min(3, p.growth))
      m.group.scale.setScalar(0.55 + m.growth * 0.12)
    }
  }

  /** Feed with beef, pork or apple; after taming, interact again with an empty hand to mount/dismount. */
  interactPetDragon(x: number, y: number, z: number, heldId: number): PetDragonInteraction {
    if (this.mountedMob) {
      this.dismountPetDragon()
      return { action: 'dismounted', message: 'You dismounted your dragon.' }
    }
    let target: Mob | undefined
    let best = 4 * 4
    for (const m of this.mobs) {
      if (m.kind !== 'petDragon' || m.dead > 0) continue
      const dx = m.body.pos.x - x, dy = m.body.pos.y - y, dz = m.body.pos.z - z
      const d = dx * dx + dy * dy + dz * dz
      if (d < best) { target = m; best = d }
    }
    if (!target) return { action: 'not-found', message: 'No pet dragon is close enough.' }
    const food = heldId === I.BEEF || heldId === I.PORK || heldId === I.APPLE
    if (food) {
      if (!target.tamed) {
        target.tamed = true
        target.growth = (target.growth ?? 0) + 1
        target.group.scale.setScalar(0.55 + target.growth * 0.12)
        return { action: 'tamed', foodId: heldId, consume: 1, message: 'Your dragon trusts you now. Feed it again to help it grow.' }
      }
      target.growth = Math.min(3, (target.growth ?? 0) + 1)
      target.group.scale.setScalar(0.55 + target.growth * 0.12)
      return { action: 'fed', foodId: heldId, consume: 1, message: target.growth >= 3 ? 'Your dragon has grown and is ready to ride.' : 'Your dragon grows a little; feed it a few more times.' }
    }
    if (!target.tamed) return { action: 'not-ready', message: 'Your dragon is wary. Offer it beef, pork or an apple.' }
    if ((target.growth ?? 0) < 3) return { action: 'not-ready', message: 'Your dragon is still small. Feed it beef, pork or apples to help it grow.' }
    this.mountedMob = target
    target.body.vel.set(0, 0, 0)
    return { action: 'mounted', message: 'You mounted your dragon. Move to fly, jump to climb, and sneak to descend; interact again to dismount.' }
  }

  private dismountPetDragon(): void {
    if (!this.mountedMob) return
    this.mountedMob.body.vel.set(0, 0, 0)
    this.mountedMob = null
  }

  private surfaceSpawn(px: number, pz: number, hostile: boolean, night: boolean): [number, number, number] | null {
    const a = Math.random() * Math.PI * 2
    const r = 16 + Math.random() * 20
    const x = Math.floor(px + Math.cos(a) * r), z = Math.floor(pz + Math.sin(a) * r)
    const w = this.world
    if (!w.getChunk(x >> 4, z >> 4)) return null
    let y = w.topAt(x, z)
    if (!hostile) {
      // passive: must stand on grass in daylight
      if (w.getBlock(x, y, z) !== B.GRASS || w.getBlock(x, y + 1, z) !== 0 || w.getBlock(x, y + 2, z) !== 0) return null
      return [x + 0.5, y + 1.01, z + 0.5]
    }
    if (night && Math.random() < 0.7) {
      const g = w.getBlock(x, y, z)
      if (g <= 0 || g === B.WATER || g === B.LEAVES || w.getBlock(x, y + 1, z) !== 0 || w.getBlock(x, y + 2, z) !== 0) return null
      return [x + 0.5, y + 1.01, z + 0.5]
    }
    // underground
    y = Math.floor(this.player.pos.y + (Math.random() * 20 - 12))
    if (y < 6 || y > w.topAt(x, z) - 4) return null
    if (w.getBlock(x, y, z) !== 0 || w.getBlock(x, y + 1, z) !== 0 || !w.isSolidAt(x, y - 1, z)) return null
    return [x + 0.5, y + 0.01, z + 0.5]
  }

  private mobCount(hostile: boolean): number { return this.mobs.filter(m => m.hostile === hostile && m.dead === 0).length }

  update(dt: number, night: boolean, daylight: number, input?: Input): void {
    const p = this.player
    const w = this.world
    this.updateArrows(dt)
    if (this.mountedMob && (this.mountedMob.dead > 0 || !this.mobs.includes(this.mountedMob) || p.dead)) this.dismountPetDragon()
    if (this.mountedMob) {
      const m = this.mountedMob
      const fwd = input?.forward ?? 0, str = input?.strafe ?? 0
      const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw)
      let mx = -sy * fwd + cy * str, mz = -cy * fwd - sy * str
      const len = Math.hypot(mx, mz)
      if (len > 1) { mx /= len; mz /= len }
      m.body.vel.x += (mx * 8 - m.body.vel.x) * (1 - Math.exp(-5 * dt))
      m.body.vel.z += (mz * 8 - m.body.vel.z) * (1 - Math.exp(-5 * dt))
      const vertical = (input?.jump ? 1 : 0) - (input?.sneak ? 1 : 0)
      m.body.vel.y += (vertical * 5 - m.body.vel.y) * (1 - Math.exp(-4 * dt))
      m.body.pos.addScaledVector(m.body.vel, dt)
      m.yaw = p.yaw
      m.group.position.copy(m.body.pos)
      m.group.rotation.y = m.yaw + Math.PI
      if (m.wings) { m.phase += dt * 8; m.wings[0].rotation.z = Math.sin(m.phase) * 0.55; m.wings[1].rotation.z = -Math.sin(m.phase) * 0.55 }
      p.pos.set(m.body.pos.x, m.body.pos.y + 1.55, m.body.pos.z)
      p.body.vel.set(m.body.vel.x, m.body.vel.y, m.body.vel.z)
    }
    if (this.enabled && !p.dead && w.dimension === 'overworld') {
      this.spawnT -= dt
      if (this.spawnT <= 0) {
        this.spawnT = 1.5
        const hostile = Math.random() < 0.55
        const limit = hostile ? CONFIG.mobs.maxHostile : CONFIG.mobs.maxPassive
        if (this.mobCount(hostile) < limit) {
          const pos = this.surfaceSpawn(p.pos.x, p.pos.z, hostile, night)
          if (pos) {
            if (hostile) { if (night || pos[1] < w.topAt(Math.floor(pos[0]), Math.floor(pos[2])) - 3) { const r = Math.random(); this.spawn(r < 0.45 ? 'zombie' : r < 0.78 ? 'skeleton' : 'creeper', ...pos) } }
            else if (!night) {
              const n = 1 + Math.floor(Math.random() * 3)
              const kind: MobKind = Math.random() < 0.5 ? 'pig' : 'cow'
              for (let i = 0; i < n; i += 1) this.spawn(kind, pos[0] + Math.random() * 3, pos[1], pos[2] + Math.random() * 3)
            }
          }
        }
      }
    }
    for (let i = this.mobs.length - 1; i >= 0; i -= 1) {
      const m = this.mobs[i]
      const dx = m.body.pos.x - p.pos.x, dz = m.body.pos.z - p.pos.z
      const d2 = dx * dx + dz * dz
      if ((d2 > 80 * 80 && !(m.kind === 'petDragon' && m.tamed)) || m.body.pos.y < -10) { this.remove(i); continue }
      // chunk not loaded -> freeze
      if (!w.getChunk(Math.floor(m.body.pos.x) >> 4, Math.floor(m.body.pos.z) >> 4)) continue
      if (m.dead > 0) {
        m.dead += dt
        m.group.rotation.z = Math.min(Math.PI / 2, m.dead * 6)
        m.group.position.copy(m.body.pos)
        if (m.dead > 0.7) this.remove(i)
        continue
      }
      if (m.kind === 'petDragon') {
        if (m !== this.mountedMob) {
          m.phase += dt * 1.4
          if (m.tamed && d2 > 12 * 12) m.body.pos.set(p.pos.x + Math.sin(m.phase) * 2, p.pos.y + 0.8, p.pos.z + Math.cos(m.phase) * 2)
          else if (m.tamed && d2 > 3 * 3) {
            const a = 1 - Math.exp(-1.1 * dt)
            m.body.pos.x += (p.pos.x - m.body.pos.x) * a
            m.body.pos.y += (p.pos.y - 0.3 - m.body.pos.y) * a
            m.body.pos.z += (p.pos.z - m.body.pos.z) * a
          }
          m.body.pos.y += Math.sin(m.phase) * dt * 0.18
          m.group.position.copy(m.body.pos)
          m.group.rotation.y = m.yaw + Math.PI
          if (m.wings) { m.wings[0].rotation.z = Math.sin(m.phase * 5) * 0.35; m.wings[1].rotation.z = -Math.sin(m.phase * 5) * 0.35 }
        }
        continue
      }
      this.ai(m, dt, d2, daylight)
    }
  }

  private shootArrow(origin: THREE.Vector3, target: THREE.Vector3): void {
    const start = origin.clone().add(new THREE.Vector3(0,1.25,0))
    const aim = target.clone().add(new THREE.Vector3(0,0.9,0)).sub(start)
    const dist = aim.length(); aim.normalize(); aim.y += Math.min(0.25,dist*0.012); aim.normalize()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.08,0.08,0.72), new THREE.MeshLambertMaterial({color:'#8c714d'}))
    mesh.position.copy(start); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),aim); this.scene.add(mesh)
    this.arrows.push({mesh,velocity:aim.multiplyScalar(16),life:0})
  }

  private updateArrows(dt: number): void {
    for(let i=this.arrows.length-1;i>=0;i-=1) {
      const a=this.arrows[i]; a.life+=dt; a.velocity.y-=6*dt; a.mesh.position.addScaledVector(a.velocity,dt)
      if(a.mesh.position.distanceTo(this.player.pos)<0.75 && this.player.mode==='survival') { this.player.damage(3,a.velocity.clone().setY(0).multiplyScalar(-0.2)); this.removeArrow(i); continue }
      const pos=a.mesh.position
      if(a.life>4 || this.world.collides(pos.x-0.05,pos.y-0.05,pos.z-0.05,pos.x+0.05,pos.y+0.05,pos.z+0.05)) this.removeArrow(i)
    }
  }
  private removeArrow(i:number): void { const a=this.arrows[i]; this.scene.remove(a.mesh); a.mesh.geometry.dispose(); (a.mesh.material as THREE.Material).dispose(); this.arrows.splice(i,1) }

  private remove(i: number): void {
    const m = this.mobs[i]
    this.scene.remove(m.group)
    this.mobs.splice(i, 1)
  }

  private ai(m: Mob, dt: number, d2: number, daylight: number): void {
    const p = this.player
    const w = this.world
    const b = m.body
    m.hurtT = Math.max(0, m.hurtT - dt)
    m.attackCd = Math.max(0, m.attackCd - dt)
    m.stateTimer -= dt
    m.soundT -= dt
    const dist = Math.sqrt(d2)
    let speed = 0
    if (m.kind === 'dragon') {
      m.phase += dt * 0.55
      b.pos.set(m.home.x + Math.sin(m.phase) * 15, m.home.y + 2.5 + Math.sin(m.phase*2) * 3, m.home.z + Math.cos(m.phase) * 15)
      m.targetYaw = Math.atan2(-(p.pos.x-b.pos.x), -(p.pos.z-b.pos.z))
      if (dist < 5 && m.attackCd <= 0 && p.mode === 'survival') { m.attackCd = 2.2; const kb = new THREE.Vector3(p.pos.x-b.pos.x,0,p.pos.z-b.pos.z).normalize().multiplyScalar(9); p.damage(6,kb) }
      let dy=m.targetYaw-m.yaw; dy=Math.atan2(Math.sin(dy),Math.cos(dy)); m.yaw+=dy*Math.min(1,dt*2)
      m.group.position.copy(b.pos); m.group.rotation.y=m.yaw+Math.PI
      if(m.wings) { m.wings[0].rotation.z=Math.sin(m.phase*7)*0.5; m.wings[1].rotation.z=-Math.sin(m.phase*7)*0.5 }
      for(const mt of m.mats) mt.emissive.setRGB(m.hurtT>0?0.5:0,0,0.35)
      if (m.soundT <= 0 && dist < 36) { m.soundT = 12 + Math.random() * 14; this.audio.mobCall('dragon') }
      return
    }
    if (m.hostile) {
      // only undead creatures burn in daylight
      const exposed = (m.kind === 'zombie' || m.kind === 'skeleton') && daylight > 0.8 && b.pos.y >= w.topAt(Math.floor(b.pos.x), Math.floor(b.pos.z))
      if (exposed && !w.liquidAt(b.pos.x, b.pos.y, b.pos.z)) {
        m.burn += dt
        if (m.burn >= 1) { m.burn = 0; this.hurt(m, 2, null) }
      }
      if (dist < 28 && !p.dead && p.mode === 'survival') {
        m.targetYaw = Math.atan2(-(p.pos.x - b.pos.x), -(p.pos.z - b.pos.z))
        if (m.kind === 'skeleton') {
          speed = dist > 14 ? m.walkSpeed : dist < 6 ? -m.walkSpeed*0.55 : 0
          if (dist >= 5 && dist < 20 && m.attackCd <= 0) { m.attackCd=1.8; this.shootArrow(b.pos,p.pos) }
        } else if (m.kind === 'creeper') {
          if (dist < 2.8) { m.fuse += dt; speed=0; if (m.fuse >= 1.5) { const kb=new THREE.Vector3(p.pos.x-b.pos.x,0,p.pos.z-b.pos.z).normalize().multiplyScalar(11); p.damage(9,kb); m.dead=0.001 } }
          else { m.fuse=Math.max(0,m.fuse-dt*0.7); speed=m.walkSpeed }
        } else {
          speed = dist > 1.1 ? m.walkSpeed : 0.4
          if (dist < 1.5 && Math.abs(p.pos.y - b.pos.y) < 1.8 && m.attackCd <= 0) {
            m.attackCd = 1; const kb = new THREE.Vector3(p.pos.x - b.pos.x, 0, p.pos.z - b.pos.z).normalize().multiplyScalar(5); p.damage(3, kb)
          }
        }
        if (m.soundT <= 0) { m.soundT = 6 + Math.random() * 8; if (dist < 18) this.audio.mobCall(m.kind) }
      } else if (m.stateTimer <= 0) this.wander(m)
      else speed = m.state === 'wander' ? m.walkSpeed * 0.5 : 0
    } else {
      if (m.stateTimer <= 0) {
        if (m.state === 'flee') m.state = 'idle'
        this.wander(m)
      }
      speed = m.state === 'flee' ? 3.6 : m.state === 'wander' ? m.walkSpeed : 0
      if (m.soundT <= 0) {
        m.soundT = 8 + Math.random() * 14
        if (dist < 16) (m.kind === 'pig' ? this.audio.pigOink() : this.audio.cowMoo())
      }
    }
    // turn toward target yaw
    let dy = m.targetYaw - m.yaw
    dy = Math.atan2(Math.sin(dy), Math.cos(dy))
    m.yaw += dy * Math.min(1, dt * 8)
    const inWater = w.liquidAt(b.pos.x, b.pos.y + 0.3, b.pos.z)
    const tvx = -Math.sin(m.yaw) * speed, tvz = -Math.cos(m.yaw) * speed
    const a = 1 - Math.exp(-(b.onGround ? 10 : 2) * dt)
    b.vel.x += (tvx - b.vel.x) * a
    b.vel.z += (tvz - b.vel.z) * a
    if (inWater) { b.vel.y += (1.5 - b.vel.y) * Math.min(1, dt * 4) - 6 * dt * 0 ; b.vel.y = Math.min(b.vel.y, 2.5) }
    else b.vel.y = Math.max(-50, b.vel.y - 28 * dt)
    if (b.hitWall && b.onGround && speed > 0.2) b.vel.y = 8.2
    b.step(w, dt)
    // visuals
    const g = m.group
    g.position.copy(b.pos)
    g.rotation.y = m.yaw + Math.PI
    const hv = Math.hypot(b.vel.x, b.vel.z)
    m.phase += hv * dt * 3.2
    const sw = Math.sin(m.phase) * Math.min(1, hv / 2) * 0.9
    this.animate(m, sw)
    const flash = m.hurtT > 0 ? 0.6 : m.kind === 'creeper' && m.fuse > 0 ? (Math.sin(m.fuse*28)>0?0.65:0) : 0
    for (const mt of m.mats) mt.emissive.setRGB(flash + (m.burn > 0 ? 0.25 : 0), m.fuse > 0 ? flash*0.6 : 0, 0)
  }

  private animate(m: Mob, sw: number): void {
    if ('legL' in m.parts) {
      const h = m.parts
      h.legL.rotation.x = sw
      h.legR.rotation.x = -sw
      if (m.kind !== 'zombie') { h.armL.rotation.x = -sw; h.armR.rotation.x = sw }
      else { h.armL.rotation.x = -Math.PI / 2.1 + sw * 0.15; h.armR.rotation.x = -Math.PI / 2.1 - sw * 0.15 }
      h.head.rotation.x = 0
    } else {
      const q = m.parts
      q.legs[0].rotation.x = sw; q.legs[3].rotation.x = sw
      q.legs[1].rotation.x = -sw; q.legs[2].rotation.x = -sw
    }
  }

  private wander(m: Mob): void {
    const r = Math.random()
    if (r < 0.45) { m.state = 'idle'; m.stateTimer = 1.5 + Math.random() * 4 }
    else { m.state = 'wander'; m.stateTimer = 1.5 + Math.random() * 3; m.targetYaw = Math.random() * Math.PI * 2 }
  }

  hurt(m: Mob, dmg: number, from: THREE.Vector3 | null): void {
    if (m.dead > 0) return
    m.health -= dmg
    m.hurtT = 0.4
    if (from) {
      const kx = m.body.pos.x - from.x, kz = m.body.pos.z - from.z
      const l = Math.hypot(kx, kz) || 1
      m.body.vel.x += (kx / l) * 6
      m.body.vel.z += (kz / l) * 6
      m.body.vel.y = 5
      if (!m.hostile) { m.state = 'flee'; m.stateTimer = 4; m.targetYaw = Math.atan2(-kx, -kz) }
    }
    if (m.kind === 'pig') this.audio.pigOink(); else if (m.kind === 'cow') this.audio.cowMoo(); else this.audio.hurt()
    if (m.health <= 0) {
      m.dead = 0.001
      this.audio.hit('leaves')
      const { x, y, z } = m.body.pos
      if (m.kind === 'pig') this.hooks.drop(I.PORK, 1 + Math.floor(Math.random() * 2), x, y + 0.5, z)
      else if (m.kind === 'cow') this.hooks.drop(I.BEEF, 1 + Math.floor(Math.random() * 2), x, y + 0.5, z)
      else if (m.kind === 'skeleton' && Math.random() < 0.7) this.hooks.drop(I.STICK, 1 + Math.floor(Math.random()*2), x, y + 0.5, z)
      else if (m.kind === 'dragon') {
        this.hooks.drop(I.DIAMOND, 10, x, y + 0.5, z)
        // The registry's reserved egg entry is added alongside this mob change.
        this.hooks.drop((I as unknown as Record<'DRAGON_EGG', number>).DRAGON_EGG, 1, x, y + 0.5, z)
      }
      else if (Math.random() < 0.5) this.hooks.drop(I.STICK, 1, x, y + 0.5, z)
      else if (Math.random() < 0.4) this.hooks.drop(I.COAL, 1, x, y + 0.5, z)
    }
  }

  /** Ray vs mob AABBs; returns nearest mob and distance. */
  raycast(o: THREE.Vector3, d: THREE.Vector3, maxDist: number): { mob: Mob; dist: number } | null {
    let best: { mob: Mob; dist: number } | null = null
    for (const m of this.mobs) {
      if (m.dead > 0) continue
      const hw = m.body.w / 2
      const min = [m.body.pos.x - hw, m.body.pos.y, m.body.pos.z - hw]
      const max = [m.body.pos.x + hw, m.body.pos.y + m.body.h, m.body.pos.z + hw]
      let t0 = 0, t1 = maxDist
      const oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z]
      let hit = true
      for (let k = 0; k < 3; k += 1) {
        if (Math.abs(dd[k]) < 1e-8) { if (oo[k] < min[k] || oo[k] > max[k]) { hit = false; break } continue }
        let ta = (min[k] - oo[k]) / dd[k], tb = (max[k] - oo[k]) / dd[k]
        if (ta > tb) [ta, tb] = [tb, ta]
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb)
        if (t0 > t1) { hit = false; break }
      }
      if (hit && (!best || t0 < best.dist)) best = { mob: m, dist: t0 }
    }
    return best
  }
}
