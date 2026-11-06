import * as THREE from 'three'
import { ATLAS_COLS, ATLAS_ROWS, BLOCKS } from '../core/blocks'
import type { Atlas } from '../core/atlas'
import { drawItemIcon } from '../core/atlas'
import type { World } from './world'

/** Axis-aligned physics body (feet-centred) with swept per-axis collision. */
export class Body {
  pos = new THREE.Vector3()
  vel = new THREE.Vector3()
  onGround = false
  hitWall = false
  constructor(public w: number, public h: number) {}

  private overlaps(world: World): boolean {
    const hw = this.w / 2
    const e = 1e-5
    return world.collides(this.pos.x - hw, this.pos.y, this.pos.z - hw, this.pos.x + hw - e, this.pos.y + this.h - e, this.pos.z + hw - e)
  }

  private moveAxis(world: World, axis: 'x' | 'y' | 'z', d: number): boolean {
    if (d === 0) return false
    const hw = this.w / 2
    const eps = 1e-4
    this.pos[axis] += d
    if (!this.overlaps(world)) return false
    if (axis === 'x') this.pos.x = d > 0 ? Math.floor(this.pos.x + hw) - hw - eps : Math.floor(this.pos.x - hw) + 1 + hw + eps
    else if (axis === 'z') this.pos.z = d > 0 ? Math.floor(this.pos.z + hw) - hw - eps : Math.floor(this.pos.z - hw) + 1 + hw + eps
    else if (d > 0) this.pos.y = Math.floor(this.pos.y + this.h) - this.h - eps
    else { this.pos.y = Math.floor(this.pos.y) + 1 + eps; this.onGround = true }
    this.vel[axis] = 0
    return true
  }

  /** Is there ground within `depth` below the body footprint? */
  groundBelow(world: World, depth = 0.6): boolean {
    const hw = this.w / 2
    return world.collides(this.pos.x - hw, this.pos.y - depth, this.pos.z - hw, this.pos.x + hw - 1e-5, this.pos.y - 0.01, this.pos.z + hw - 1e-5)
  }

  step(world: World, dt: number, edgeGuard = false, allowWaterStep = false): void {
    const speed = Math.max(Math.abs(this.vel.x), Math.abs(this.vel.y), Math.abs(this.vel.z))
    const n = Math.max(1, Math.ceil((speed * dt) / 0.3))
    const sdt = dt / n
    this.onGround = false
    this.hitWall = false
    for (let i = 0; i < n; i += 1) {
      const wasGround = this.onGround
      this.moveAxis(world, 'y', this.vel.y * sdt)
      const ox = this.pos.x
      if (this.moveAxis(world, 'x', this.vel.x * sdt)) {
        this.hitWall = true
        if (allowWaterStep) {
          this.pos.y += 1.001
          if (!this.overlaps(world)) { this.onGround = false; this.moveAxis(world, 'x', this.vel.x * sdt) }
          else this.pos.y -= 1.001
        }
      }
      else if (edgeGuard && (this.onGround || wasGround) && !this.groundBelow(world)) { this.pos.x = ox; this.vel.x = 0 }
      const oz = this.pos.z
      if (this.moveAxis(world, 'z', this.vel.z * sdt)) {
        this.hitWall = true
        if (allowWaterStep) {
          this.pos.y += 1.001
          if (!this.overlaps(world)) { this.onGround = false; this.moveAxis(world, 'z', this.vel.z * sdt) }
          else this.pos.y -= 1.001
        }
      }
      else if (edgeGuard && (this.onGround || wasGround) && !this.groundBelow(world)) { this.pos.z = oz; this.vel.z = 0 }
    }
  }
}

// ------------------------------------------------------------------ block meshes

const geoCache = new Map<number, THREE.BoxGeometry>()

/** Unit cube textured with a block's atlas tiles and baked per-face shading (vertex colours). */
export function blockGeometry(id: number): THREE.BoxGeometry {
  const hit = geoCache.get(id)
  if (hit) return hit
  const def = BLOCKS[id]
  const g = new THREE.BoxGeometry(1, 1, 1)
  const uv = g.attributes.uv as THREE.BufferAttribute
  const col: number[] = []
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z
  const tiles = [def.tiles[2], def.tiles[2], def.tiles[0], def.tiles[1], def.tiles[2], def.tiles[2]]
  const shades = [0.78, 0.78, 1, 0.5, 0.62, 0.62]
  for (let f = 0; f < 6; f += 1) {
    const t = tiles[f]
    const u0 = (t % ATLAS_COLS) / ATLAS_COLS, u1 = u0 + 1 / ATLAS_COLS
    const vt = 1 - Math.floor(t / ATLAS_COLS) / ATLAS_ROWS, vb = vt - 1 / ATLAS_ROWS
    const o = f * 4
    uv.setXY(o, u0, vt); uv.setXY(o + 1, u1, vt); uv.setXY(o + 2, u0, vb); uv.setXY(o + 3, u1, vb)
    for (let k = 0; k < 4; k += 1) col.push(shades[f], shades[f], shades[f])
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geoCache.set(id, g)
  return g
}

const iconTexCache = new Map<number, THREE.CanvasTexture>()
export function iconTexture(id: number, atlas: Atlas): THREE.CanvasTexture {
  let t = iconTexCache.get(id)
  if (!t) {
    t = new THREE.CanvasTexture(drawItemIcon(id, atlas, 32))
    t.magFilter = THREE.NearestFilter
    t.minFilter = THREE.NearestFilter
    t.colorSpace = THREE.SRGBColorSpace
    iconTexCache.set(id, t)
  }
  return t
}

/** Mesh used for dropped items and the held item: cube for blocks, flat plane for items. */
export function itemMesh(id: number, atlas: Atlas, size: number, mat: THREE.MeshBasicMaterial, flatMat: THREE.MeshBasicMaterial): THREE.Mesh {
  if (BLOCKS[id] && id > 0) {
    const m = new THREE.Mesh(blockGeometry(id), mat)
    m.scale.setScalar(size)
    return m
  }
  const tex = iconTexture(id, atlas)
  const mm = flatMat.clone()
  mm.map = tex
  mm.alphaTest = 0.4
  mm.side = THREE.DoubleSide
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mm)
  m.scale.setScalar(size * 1.5)
  return m
}
