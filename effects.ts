import * as THREE from 'three'
import { BLOCKS, ITEMS } from '../core/blocks'
import { buildCrackTexture, type Atlas } from '../core/atlas'
import { Body, itemMesh } from './physics'
import type { Player } from './player'
import type { World } from './world'
import type { Inventory } from './inventory'

// ------------------------------------------------------------------ particles

interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; size: number }

export class Particles {
  private mesh: THREE.InstancedMesh
  private list: Particle[] = []
  private dummy = new THREE.Object3D()
  readonly max = 220
  constructor(scene: THREE.Scene, private atlas: Atlas) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), this.max)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.frustumCulled = false
    this.mesh.count = 0
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 3), 3)
    scene.add(this.mesh)
  }

  setBrightness(v: number): void { (this.mesh.material as THREE.MeshBasicMaterial).color.setScalar(v) }

  burst(id: number, x: number, y: number, z: number, count = 14, spread = 0.5): void {
    const def = BLOCKS[id]
    if (!def) return
    for (let i = 0; i < count; i += 1) {
      if (this.list.length >= this.max) break
      const tile = def.tiles[Math.floor(Math.random() * 3)]
      const c = this.atlas.avg[tile]
      this.list.push({
        x: x + (Math.random() - 0.5) * spread * 2, y: y + (Math.random() - 0.5) * spread * 2, z: z + (Math.random() - 0.5) * spread * 2,
        vx: (Math.random() - 0.5) * 4, vy: Math.random() * 4 + 1, vz: (Math.random() - 0.5) * 4,
        life: 0.5 + Math.random() * 0.5, size: 0.07 + Math.random() * 0.07,
      })
      const col = this.mesh.instanceColor!
      const idx = this.list.length - 1
      col.setXYZ(idx, (c[0] / 255) * (0.8 + Math.random() * 0.4), (c[1] / 255) * (0.8 + Math.random() * 0.4), (c[2] / 255) * (0.8 + Math.random() * 0.4))
    }
    this.mesh.instanceColor!.needsUpdate = true
  }

  update(dt: number): void {
    let n = 0
    const col = this.mesh.instanceColor!
    for (let i = 0; i < this.list.length; i += 1) {
      const p = this.list[i]
      p.life -= dt
      if (p.life <= 0) {
        // swap-remove, keeping colours aligned
        const last = this.list.length - 1
        this.list[i] = this.list[last]
        col.setXYZ(i, col.getX(last), col.getY(last), col.getZ(last))
        this.list.pop()
        i -= 1
        col.needsUpdate = true
        continue
      }
      p.vy -= 18 * dt
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt
      this.dummy.position.set(p.x, p.y, p.z)
      this.dummy.scale.setScalar(p.size)
      this.dummy.rotation.set(0, 0, 0)
      this.dummy.updateMatrix()
      this.mesh.setMatrixAt(n, this.dummy.matrix)
      n += 1
    }
    this.mesh.count = n
    this.mesh.instanceMatrix.needsUpdate = true
  }
}

// ------------------------------------------------------------------ drops

interface Drop { id: number; n: number; body: Body; mesh: THREE.Mesh; age: number; spin: number }

export class Drops {
  list: Drop[] = []
  private mat = new THREE.MeshBasicMaterial({ vertexColors: true, map: null as THREE.Texture | null })
  private flat = new THREE.MeshBasicMaterial({ transparent: true })
  constructor(private scene: THREE.Scene, private atlas: Atlas, private world: World) {
    this.mat.map = atlas.texture
    this.mat.alphaTest = 0.4
  }

  setBrightness(v: number): void {
    this.mat.color.setScalar(v)
    for (const d of this.list) { const m = d.mesh.material as THREE.MeshBasicMaterial; if (m !== this.mat) m.color.setScalar(v) }
  }

  spawn(id: number, n: number, x: number, y: number, z: number, throwVel?: THREE.Vector3): void {
    if (!ITEMS[id]) return
    if (this.list.length > 120) this.remove(0)
    const mesh = itemMesh(id, this.atlas, 0.28, this.mat, this.flat)
    const body = new Body(0.25, 0.25)
    body.pos.set(x, y, z)
    if (throwVel) body.vel.copy(throwVel)
    else body.vel.set((Math.random() - 0.5) * 3, 3.5, (Math.random() - 0.5) * 3)
    this.scene.add(mesh)
    this.list.push({ id, n, body, mesh, age: 0, spin: Math.random() * 6 })
  }

  private remove(i: number): void {
    const d = this.list[i]
    this.scene.remove(d.mesh)
    const m = d.mesh.material as THREE.Material
    if (m !== this.mat) m.dispose()
    this.list.splice(i, 1)
  }

  clear(): void { while (this.list.length) this.remove(0) }

  update(dt: number, player: Player, inv: Inventory, onPickup: () => void): void {
    const pp = player.pos
    for (let i = this.list.length - 1; i >= 0; i -= 1) {
      const d = this.list[i]
      d.age += dt
      d.spin += dt * 1.6
      const b = d.body
      if (d.age > 300 || b.pos.y < -10) { this.remove(i); continue }
      const dx = pp.x - b.pos.x, dy = pp.y + 0.9 - b.pos.y, dz = pp.z - b.pos.z
      const dist = Math.hypot(dx, dy, dz)
      if (d.age > 0.6 && !player.dead && dist < 2.4) {
        const pull = 9 / Math.max(0.4, dist)
        b.vel.x += (dx / dist) * pull * dt * 4
        b.vel.y += (dy / dist) * pull * dt * 4 + 0
        b.vel.z += (dz / dist) * pull * dt * 4
        if (dist < 0.9) {
          const left = inv.add(d.id, d.n)
          if (left < d.n) { onPickup(); if (left <= 0) { this.remove(i); continue } d.n = left }
        }
      }
      if (this.world.getChunk(Math.floor(b.pos.x) >> 4, Math.floor(b.pos.z) >> 4)) {
        b.vel.y -= 22 * dt
        b.step(this.world, dt)
        if (b.onGround) { b.vel.x *= 0.82; b.vel.z *= 0.82 }
      }
      d.mesh.position.set(b.pos.x, b.pos.y + 0.15 + Math.sin(d.spin * 2) * 0.04, b.pos.z)
      d.mesh.rotation.y = d.spin
    }
  }
}

// ------------------------------------------------------------------ selection box + crack overlay

export class BlockHighlight {
  readonly outline: THREE.LineSegments
  readonly crack: THREE.Mesh
  private crackTex: THREE.CanvasTexture
  constructor(scene: THREE.Scene) {
    const g = new THREE.BoxGeometry(1.004, 1.004, 1.004)
    this.outline = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.7 }))
    this.outline.visible = false
    scene.add(this.outline)
    this.crackTex = buildCrackTexture()
    this.crack = new THREE.Mesh(new THREE.BoxGeometry(1.006, 1.006, 1.006), new THREE.MeshBasicMaterial({ map: this.crackTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }))
    this.crack.visible = false
    this.crack.renderOrder = 3
    scene.add(this.crack)
  }

  show(x: number, y: number, z: number): void {
    this.outline.position.set(x + 0.5, y + 0.5, z + 0.5)
    this.outline.visible = true
  }

  hide(): void { this.outline.visible = false; this.crack.visible = false }

  setProgress(x: number, y: number, z: number, p: number): void {
    if (p <= 0) { this.crack.visible = false; return }
    const stage = Math.min(9, Math.floor(p * 10))
    this.crackTex.offset.x = stage / 10
    this.crack.position.set(x + 0.5, y + 0.5, z + 0.5)
    this.crack.visible = true
  }
}

// ------------------------------------------------------------------ held item (first person)

export class Hand {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.05, 10)
  private holder = new THREE.Group()
  private current = -1
  private mesh: THREE.Object3D | null = null
  private swing = 0
  private equip = 1
  private mat = new THREE.MeshBasicMaterial({ vertexColors: true })
  private flat = new THREE.MeshBasicMaterial({ transparent: true })
  private armMat = new THREE.MeshBasicMaterial({ color: 0xd9a066 })
  private arm: THREE.Mesh

  constructor(private atlas: Atlas) {
    this.mat.map = atlas.texture
    this.mat.alphaTest = 0.4
    this.scene.add(this.holder)
    this.arm = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.85), this.armMat)
    this.arm.visible = false
    this.holder.add(this.arm)
  }

  resize(aspect: number): void { this.camera.aspect = aspect; this.camera.updateProjectionMatrix() }
  setBrightness(v: number): void {
    this.mat.color.setScalar(v)
    this.armMat.color.setRGB(0.85 * v, 0.63 * v, 0.4 * v)
    if (this.mesh) { const m = (this.mesh as THREE.Mesh).material as THREE.MeshBasicMaterial; if (m !== this.mat) m.color.setScalar(v) }
  }
  swingNow(): void { this.swing = 1 }

  set(id: number): void {
    if (id === this.current) return
    this.current = id
    this.equip = 0
    if (this.mesh) { this.holder.remove(this.mesh); this.mesh = null }
    if (id === 0) { this.arm.visible = true; return }
    this.arm.visible = false
    this.mesh = itemMesh(id, this.atlas, BLOCKS[id] ? 0.42 : 0.55, this.mat, this.flat)
    this.holder.add(this.mesh)
  }

  update(dt: number, bob: number, moving: boolean, mining: boolean): void {
    this.equip = Math.min(1, this.equip + dt * 5)
    this.swing = Math.max(0, this.swing - dt * 3.2)
    if (mining && this.swing <= 0) this.swing = 1
    const sw = Math.sin((1 - this.swing) * Math.PI) * (this.swing > 0 ? 1 : 0)
    const bx = moving ? Math.sin(bob) * 0.02 : 0
    const by = moving ? Math.abs(Math.cos(bob)) * 0.025 : 0
    const dip = (1 - this.equip) * -0.5
    const isBlock = this.current > 0 && !!BLOCKS[this.current]
    if (this.current === 0) {
      this.arm.position.set(0.42 + bx, -0.38 + dip + by - sw * 0.1, -0.62 - sw * 0.15)
      this.arm.rotation.set(-0.25 - sw * 0.6, 0.15, 0)
    } else if (this.mesh) {
      if (isBlock) {
        this.mesh.position.set(0.5 + bx - sw * 0.12, -0.42 + dip + by - sw * 0.14, -0.8 - sw * 0.1)
        this.mesh.rotation.set(0.1 - sw * 0.5, 0.65, 0.05)
      } else {
        this.mesh.position.set(0.46 + bx - sw * 0.1, -0.34 + dip + by - sw * 0.1, -0.68 - sw * 0.1)
        this.mesh.rotation.set(0.15 - sw * 0.9, -0.5, -0.2 - sw * 0.2)
      }
    }
  }
}
