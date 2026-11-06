import * as THREE from 'three'
import { ATLAS_COLS, ATLAS_ROWS, B, BLOCKS, CH, CS } from '../core/blocks'
import type { Atlas } from '../core/atlas'
import { WorldGen, type Dimension } from '../core/worldgen'

export interface Chunk {
  cx: number
  cz: number
  data: Uint8Array
  top: Uint8Array
  solid: THREE.Mesh | null
  water: THREE.Mesh | null
  dirty: boolean
}

export interface RayHit { x: number; y: number; z: number; nx: number; ny: number; nz: number; id: number; dist: number }

const OPAQUE = new Uint8Array(256)
const SKYBLOCK = new Uint8Array(256)
for (const d of BLOCKS) {
  if (!d) continue
  if (d.opaque) OPAQUE[d.id] = 1
  if (d.opaque || d.id === B.LEAVES) SKYBLOCK[d.id] = 1
}

const VERT = /* glsl */ `
attribute vec3 aLight;
varying vec2 vUv;
varying vec3 vLight;
varying float vDepth;
void main() {
  vUv = uv;
  vLight = aLight;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`

const FRAG = /* glsl */ `
uniform sampler2D map;
uniform float uDay;
uniform float uAlpha;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uTint;
varying vec2 vUv;
varying vec3 vLight;
varying float vDepth;
void main() {
  vec4 t = texture2D(map, vUv);
  if (t.a < 0.5) discard;
  float l = max(vLight.y * uDay, 0.16);
  l = max(l, vLight.z);
  vec3 col = t.rgb * vLight.x * l * mix(uTint, vec3(1.0), max(uDay, vLight.z));
  float f = smoothstep(uFogNear, uFogFar, vDepth);
  col = mix(col, uFogColor, f);
  gl_FragColor = vec4(col, t.a * uAlpha);
  #include <colorspace_fragment>
}`

const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.78 },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.78 },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.5 },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.62 },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.62 },
] as const

const AO_LEVELS = [0.42, 0.62, 0.82, 1.0]
const PW = CS + 2

class Buf {
  pos = new Float32Array(4096 * 3)
  uv = new Float32Array(4096 * 2)
  light = new Float32Array(4096 * 3)
  idx = new Uint32Array(6144)
  v = 0
  i = 0
  reset(): void { this.v = 0; this.i = 0 }
  grow(): void {
    if ((this.v + 4) * 3 <= this.pos.length) return
    const n = this.pos.length * 2
    const p = new Float32Array(n); p.set(this.pos); this.pos = p
    const u = new Float32Array((n / 3) * 2); u.set(this.uv); this.uv = u
    const l = new Float32Array(n); l.set(this.light); this.light = l
    const ix = new Uint32Array((n / 3) * 1.5); ix.set(this.idx); this.idx = ix
  }
}

export interface WorldOptions { renderDistance: number; dimension?: Dimension }

export class World {
  chunks = new Map<number, Chunk>()
  edits = new Map<number, Map<number, number>>()
  readonly gen: WorldGen
  group = new THREE.Group()
  solidMat: THREE.ShaderMaterial
  waterMat: THREE.ShaderMaterial
  renderDistance: number
  editCount = 0
  onEdit: ((x: number, y: number, z: number, id: number) => void) | null = null
  meshedCount = 0
  private workers: Worker[] = []
  private pending = new Set<number>()
  private inflight = 0
  private nextWorker = 0
  private bufS = new Buf()
  private bufW = new Buf()
  private pdata = new Uint8Array(PW * PW * CH)
  private ptop = new Uint8Array(PW * PW)
  private lastKey = -1
  private lastChunk: Chunk | undefined
  private updatingFluid = false

  readonly dimension: Dimension

  constructor(private scene: THREE.Scene, atlas: Atlas, public seed: number, opts: WorldOptions) {
    this.dimension = opts.dimension ?? 'overworld'
    this.gen = new WorldGen(seed, this.dimension)
    this.renderDistance = opts.renderDistance
    const shared = {
      map: { value: atlas.texture },
      uDay: { value: 1 },
      uFogColor: { value: new THREE.Color(0.7, 0.8, 1) },
      uFogNear: { value: 60 },
      uFogFar: { value: 100 },
      uTint: { value: new THREE.Color(0.8, 0.85, 1) },
    }
    const mk = (alpha: number, transparent: boolean) => new THREE.ShaderMaterial({
      uniforms: { ...shared, uAlpha: { value: alpha } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent,
      depthWrite: !transparent,
      side: transparent ? THREE.DoubleSide : THREE.FrontSide,
    })
    this.solidMat = mk(1, false)
    this.waterMat = mk(0.78, true)
    scene.add(this.group)
    const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 1))
    for (let i = 0; i < n; i += 1) {
      const w = new Worker(new URL('../core/gen.worker.ts', import.meta.url), { type: 'module' })
      w.onmessage = e => this.onChunkData(e.data)
      this.workers.push(w)
    }
  }

  setLighting(day: number, fogColor: THREE.Color, fogNear: number, fogFar: number, tint: THREE.Color): void {
    const u = this.solidMat.uniforms
    u.uDay.value = day
    ;(u.uFogColor.value as THREE.Color).copy(fogColor)
    u.uFogNear.value = fogNear
    u.uFogFar.value = fogFar
    ;(u.uTint.value as THREE.Color).copy(tint)
  }

  // ------------------------------------------------------------ data access

  private key(cx: number, cz: number): number { return ((cx + 32768) << 16) | (cz + 32768) }

  getChunk(cx: number, cz: number): Chunk | undefined {
    const k = this.key(cx, cz)
    if (k === this.lastKey) return this.lastChunk
    const c = this.chunks.get(k)
    this.lastKey = k
    this.lastChunk = c
    return c
  }

  /** -1 = chunk not loaded */
  getBlock(x: number, y: number, z: number): number {
    if (y < 0) return B.BEDROCK
    if (y >= CH) return B.AIR
    const c = this.getChunk(x >> 4, z >> 4)
    if (!c) return -1
    return c.data[(x & 15) + (z & 15) * CS + y * CS * CS]
  }

  isSolidAt(x: number, y: number, z: number): boolean {
    const id = this.getBlock(x, y, z)
    return id === -1 || BLOCKS[id].solid
  }

  topAt(x: number, z: number): number {
    const c = this.getChunk(x >> 4, z >> 4)
    return c ? c.top[(x & 15) + (z & 15) * CS] : 0
  }

  setBlock(x: number, y: number, z: number, id: number, fromNet = false): boolean {
    if (y < 0 || y >= CH) return false
    const cx = x >> 4, cz = z >> 4
    const c = this.getChunk(cx, cz)
    if (!c) return false
    const lx = x & 15, lz = z & 15
    const i = lx + lz * CS + y * CS * CS
    if (c.data[i] === id) return false
    c.data[i] = id
    const ck = this.key(cx, cz)
    let m = this.edits.get(ck)
    if (!m) { m = new Map(); this.edits.set(ck, m) }
    m.set(i, id)
    this.editCount += 1
    const ci = lx + lz * CS
    if (SKYBLOCK[id]) { if (y > c.top[ci]) c.top[ci] = y }
    else if (y >= c.top[ci]) {
      let t = 0
      for (let yy = y - 1; yy >= 0; yy -= 1) if (SKYBLOCK[c.data[lx + lz * CS + yy * CS * CS]]) { t = yy; break }
      c.top[ci] = t
    }
    const marks: Chunk[] = [c]
    for (let dz = -1; dz <= 1; dz += 1) for (let dx = -1; dx <= 1; dx += 1) {
      if (!dx && !dz) continue
      if ((dx === -1 && lx > 0) || (dx === 1 && lx < 15) || (dz === -1 && lz > 0) || (dz === 1 && lz < 15)) continue
      const n = this.getChunk(cx + dx, cz + dz)
      if (n) marks.push(n)
    }
    this.lastKey = -1
    for (const m2 of marks) {
      m2.dirty = true
      if (this.canMesh(m2)) this.buildChunk(m2)
    }
    if (!fromNet && this.onEdit) this.onEdit(x, y, z, id)
    // A mined cavity directly touching water is filled once. Do not run a
    // world-scale fluid simulation: this local reaction is bounded and edits
    // still pass through the usual persistence/network path.
    if (id === B.AIR && !this.updatingFluid) {
      const adjacent = this.getBlock(x + 1, y, z) === B.WATER || this.getBlock(x - 1, y, z) === B.WATER ||
        this.getBlock(x, y + 1, z) === B.WATER || this.getBlock(x, y - 1, z) === B.WATER ||
        this.getBlock(x, y, z + 1) === B.WATER || this.getBlock(x, y, z - 1) === B.WATER
      if (adjacent) {
        this.updatingFluid = true
        this.setBlock(x, y, z, B.WATER, fromNet)
        this.updatingFluid = false
      }
    }
    return true
  }

  // ------------------------------------------------------------ streaming

  private onChunkData(msg: { seed: number; cx: number; cz: number; dimension?: Dimension; data: Uint8Array; top: Uint8Array }): void {
    this.inflight -= 1
    const k = this.key(msg.cx, msg.cz)
    this.pending.delete(k)
    if (msg.seed !== this.seed || (msg.dimension ?? 'overworld') !== this.dimension || this.chunks.has(k)) return
    const c: Chunk = { cx: msg.cx, cz: msg.cz, data: msg.data, top: msg.top, solid: null, water: null, dirty: true }
    const e = this.edits.get(k)
    if (e) {
      for (const [i, id] of e) c.data[i] = id
      for (let z = 0; z < CS; z += 1) for (let x = 0; x < CS; x += 1) {
        let t = 0
        for (let y = CH - 1; y >= 0; y -= 1) if (SKYBLOCK[c.data[x + z * CS + y * CS * CS]]) { t = y; break }
        c.top[x + z * CS] = t
      }
    }
    this.chunks.set(k, c)
    this.lastKey = -1
  }

  update(px: number, pz: number, meshBudgetMs = 5): void {
    const pcx = Math.floor(px / CS), pcz = Math.floor(pz / CS)
    const rd = this.renderDistance
    const R = rd + 1
    const maxInflight = this.workers.length * 2
    if (this.inflight < maxInflight) {
      const want: { cx: number; cz: number; d: number }[] = []
      for (let dz = -R; dz <= R; dz += 1) for (let dx = -R; dx <= R; dx += 1) {
        const d = dx * dx + dz * dz
        if (d > R * R + 1) continue
        const cx = pcx + dx, cz = pcz + dz
        const k = this.key(cx, cz)
        if (this.chunks.has(k) || this.pending.has(k)) continue
        want.push({ cx, cz, d })
      }
      want.sort((a, b) => a.d - b.d)
      for (const w of want) {
        if (this.inflight >= maxInflight) break
        this.pending.add(this.key(w.cx, w.cz))
        this.inflight += 1
        this.workers[this.nextWorker++ % this.workers.length].postMessage({ seed: this.seed, cx: w.cx, cz: w.cz, dimension: this.dimension })
      }
    }
    for (const [k, c] of this.chunks) {
      const dx = c.cx - pcx, dz = c.cz - pcz
      if (dx * dx + dz * dz > (R + 2) * (R + 2)) this.disposeChunk(k, c)
    }
    const start = performance.now()
    const todo: Chunk[] = []
    for (const c of this.chunks.values()) {
      if (!c.dirty) continue
      const dx = c.cx - pcx, dz = c.cz - pcz
      if (dx * dx + dz * dz > rd * rd + 1) continue
      if (!this.canMesh(c)) continue
      todo.push(c)
    }
    if (todo.length) {
      todo.sort((a, b) => ((a.cx - pcx) ** 2 + (a.cz - pcz) ** 2) - ((b.cx - pcx) ** 2 + (b.cz - pcz) ** 2))
      for (const c of todo) {
        this.buildChunk(c)
        if (performance.now() - start > meshBudgetMs) break
      }
    }
    for (const c of this.chunks.values()) {
      const dx = c.cx - pcx, dz = c.cz - pcz
      const vis = dx * dx + dz * dz <= rd * rd + 1
      if (c.solid) c.solid.visible = vis
      if (c.water) c.water.visible = vis
    }
  }

  /** Fraction of chunks within `radius` that are meshed (loading progress). */
  readiness(px: number, pz: number, radius: number): number {
    const pcx = Math.floor(px / CS), pcz = Math.floor(pz / CS)
    let total = 0, ready = 0
    for (let dz = -radius; dz <= radius; dz += 1) for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx * dx + dz * dz > radius * radius + 1) continue
      total += 1
      const c = this.getChunk(pcx + dx, pcz + dz)
      if (c && !c.dirty) ready += 1
    }
    return ready / total
  }

  private canMesh(c: Chunk): boolean {
    return !!(this.getChunk(c.cx + 1, c.cz) && this.getChunk(c.cx - 1, c.cz) && this.getChunk(c.cx, c.cz + 1) && this.getChunk(c.cx, c.cz - 1))
  }

  private disposeChunk(k: number, c: Chunk): void {
    if (c.solid) { this.group.remove(c.solid); c.solid.geometry.dispose() }
    if (c.water) { this.group.remove(c.water); c.water.geometry.dispose() }
    this.chunks.delete(k)
    this.lastKey = -1
  }

  dispose(): void {
    for (const w of this.workers) w.terminate()
    for (const [k, c] of [...this.chunks]) this.disposeChunk(k, c)
    this.scene.remove(this.group)
    this.solidMat.dispose()
    this.waterMat.dispose()
  }

  // ------------------------------------------------------------ meshing

  private buildChunk(c: Chunk): void {
    c.dirty = false
    const pd = this.pdata, pt = this.ptop
    const cx = c.cx, cz = c.cz
    for (let z = -1; z <= CS; z += 1) for (let x = -1; x <= CS; x += 1) {
      const sx = x < 0 ? -1 : x >= CS ? 1 : 0
      const sz = z < 0 ? -1 : z >= CS ? 1 : 0
      const pi = (z + 1) * PW + (x + 1)
      let src = sx || sz ? this.getChunk(cx + sx, cz + sz) : c
      let lx = (x + CS) & 15, lz = (z + CS) & 15
      if (!src) {
        src = c
        lx = Math.min(CS - 1, Math.max(0, x))
        lz = Math.min(CS - 1, Math.max(0, z))
      }
      pt[pi] = src.top[lx + lz * CS]
      const col = lx + lz * CS
      for (let y = 0; y < CH; y += 1) pd[y * PW * PW + pi] = src.data[col + y * CS * CS]
    }

    const S = this.bufS, W = this.bufW
    S.reset(); W.reset()
    const at = (x: number, y: number, z: number) => (y < 0 ? B.BEDROCK : y >= CH ? 0 : pd[y * PW * PW + (z + 1) * PW + (x + 1)])
    const skyAt = (x: number, y: number, z: number) => {
      const t = pt[(z + 1) * PW + (x + 1)]
      return y > t ? 1 : Math.max(0.1, 0.5 - 0.09 * (t - y))
    }
    let maxY = 0
    for (let i = 0; i < CS * CS; i += 1) if (c.top[i] > maxY) maxY = c.top[i]
    maxY = Math.min(CH - 1, Math.max(maxY + 2, 31))

    const aoVals = [0, 0, 0, 0]
    const d1 = [0, 0, 0], d2 = [0, 0, 0]
    for (let y = 0; y <= maxY; y += 1) for (let z = 0; z < CS; z += 1) for (let x = 0; x < CS; x += 1) {
      const id = pd[y * PW * PW + (z + 1) * PW + (x + 1)]
      if (id === B.AIR) continue
      const def = BLOCKS[id]
      const liquid = !!def.liquid
      const buf = liquid ? W : S
      for (let f = 0; f < 6; f += 1) {
        const face = FACES[f]
        const nid = at(x + face.n[0], y + face.n[1], z + face.n[2])
        if (nid !== B.AIR) {
          if (OPAQUE[nid] || nid === id) continue
          if (liquid && BLOCKS[nid].solid) continue
        }
        buf.grow()
        const tile = f === 2 ? def.tiles[0] : f === 3 ? def.tiles[1] : (id === B.TABLE && f === 4 ? 25 : def.tiles[2])
        const u0 = (tile % ATLAS_COLS) / ATLAS_COLS
        const u1 = u0 + 1 / ATLAS_COLS
        const vt = 1 - Math.floor(tile / ATLAS_COLS) / ATLAS_ROWS
        const vb = vt - 1 / ATLAS_ROWS
        const nAxis = f >> 1
        const t1 = nAxis === 0 ? 1 : 0
        const t2 = nAxis === 2 ? 1 : 2
        const base = buf.v
        const waterLow = liquid && at(x, y + 1, z) !== id
        const bx = x + face.n[0], by = y + face.n[1], bz = z + face.n[2]
        for (let k = 0; k < 4; k += 1) {
          const cp = face.c[k]
          const o = buf.v * 3
          buf.pos[o] = x + cp[0]
          buf.pos[o + 1] = y + cp[1] - (waterLow && cp[1] === 1 ? 0.125 : 0)
          buf.pos[o + 2] = z + cp[2]
          const uvo = buf.v * 2
          buf.uv[uvo] = k === 0 || k === 3 ? u0 : u1
          buf.uv[uvo + 1] = k < 2 ? vb : vt
          d1[0] = d1[1] = d1[2] = 0
          d2[0] = d2[1] = d2[2] = 0
          d1[t1] = cp[t1] ? 1 : -1
          d2[t2] = cp[t2] ? 1 : -1
          const f0 = at(bx, by, bz)
          const a1 = at(bx + d1[0], by + d1[1], bz + d1[2])
          const a2 = at(bx + d2[0], by + d2[1], bz + d2[2])
          const a3 = at(bx + d1[0] + d2[0], by + d1[1] + d2[1], bz + d1[2] + d2[2])
          const o1 = OPAQUE[a1], o2 = OPAQUE[a2], o3 = OPAQUE[a3]
          const ao = o1 && o2 ? 0 : 3 - (o1 + o2 + o3)
          let sky = 0, cnt = 0
          if (!OPAQUE[f0]) { sky += skyAt(bx, by, bz); cnt += 1 }
          if (!o1) { sky += skyAt(bx + d1[0], by + d1[1], bz + d1[2]); cnt += 1 }
          if (!o2) { sky += skyAt(bx + d2[0], by + d2[1], bz + d2[2]); cnt += 1 }
          if (!o3) { sky += skyAt(bx + d1[0] + d2[0], by + d1[1] + d2[1], bz + d1[2] + d2[2]); cnt += 1 }
          const lo = buf.v * 3
          aoVals[k] = ao
          buf.light[lo] = (liquid ? 1 : AO_LEVELS[ao]) * face.shade
          buf.light[lo + 1] = cnt ? sky / cnt : 0.5
          buf.light[lo + 2] = def.emissive ? 1 : 0
          buf.v += 1
        }
        const flip = aoVals[0] + aoVals[2] < aoVals[1] + aoVals[3]
        const io = buf.i
        if (flip) {
          buf.idx[io] = base + 1; buf.idx[io + 1] = base + 2; buf.idx[io + 2] = base + 3
          buf.idx[io + 3] = base + 1; buf.idx[io + 4] = base + 3; buf.idx[io + 5] = base
        } else {
          buf.idx[io] = base; buf.idx[io + 1] = base + 1; buf.idx[io + 2] = base + 2
          buf.idx[io + 3] = base; buf.idx[io + 4] = base + 2; buf.idx[io + 5] = base + 3
        }
        buf.i += 6
      }
    }
    c.solid = this.applyMesh(c, c.solid, S, this.solidMat, 0)
    c.water = this.applyMesh(c, c.water, W, this.waterMat, 1)
    this.meshedCount += 1
  }

  private applyMesh(c: Chunk, old: THREE.Mesh | null, buf: Buf, mat: THREE.ShaderMaterial, order: number): THREE.Mesh | null {
    if (old) { this.group.remove(old); old.geometry.dispose() }
    if (buf.v === 0) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(buf.pos.slice(0, buf.v * 3), 3))
    g.setAttribute('uv', new THREE.BufferAttribute(buf.uv.slice(0, buf.v * 2), 2))
    g.setAttribute('aLight', new THREE.BufferAttribute(buf.light.slice(0, buf.v * 3), 3))
    g.setIndex(new THREE.BufferAttribute(buf.idx.slice(0, buf.i), 1))
    g.boundingBox = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(CS, CH, CS))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(8, CH / 2, 8), 56)
    const m = new THREE.Mesh(g, mat)
    m.position.set(c.cx * CS, 0, c.cz * CS)
    m.renderOrder = order
    m.matrixAutoUpdate = false
    m.updateMatrix()
    this.group.add(m)
    return m
  }

  // ------------------------------------------------------------ queries

  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): RayHit | null {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz)
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1
    const tdx = dx === 0 ? Infinity : Math.abs(1 / dx)
    const tdy = dy === 0 ? Infinity : Math.abs(1 / dy)
    const tdz = dz === 0 ? Infinity : Math.abs(1 / dz)
    let tx = dx === 0 ? Infinity : (dx > 0 ? x + 1 - ox : ox - x) * tdx
    let ty = dy === 0 ? Infinity : (dy > 0 ? y + 1 - oy : oy - y) * tdy
    let tz = dz === 0 ? Infinity : (dz > 0 ? z + 1 - oz : oz - z) * tdz
    let nx = 0, ny = 0, nz = 0
    let dist = 0
    for (let i = 0; i < 200; i += 1) {
      const id = this.getBlock(x, y, z)
      if (id > 0 && !BLOCKS[id].liquid) return { x, y, z, nx, ny, nz, id, dist }
      if (tx < ty && tx < tz) { x += sx; dist = tx; tx += tdx; nx = -sx; ny = 0; nz = 0 }
      else if (ty < tz) { y += sy; dist = ty; ty += tdy; nx = 0; ny = -sy; nz = 0 }
      else { z += sz; dist = tz; tz += tdz; nx = 0; ny = 0; nz = -sz }
      if (dist > maxDist) return null
    }
    return null
  }

  collides(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): boolean {
    const x0 = Math.floor(minX), x1 = Math.floor(maxX)
    const y0 = Math.floor(minY), y1 = Math.floor(maxY)
    const z0 = Math.floor(minZ), z1 = Math.floor(maxZ)
    for (let y = y0; y <= y1; y += 1) for (let z = z0; z <= z1; z += 1) for (let x = x0; x <= x1; x += 1) {
      if (this.isSolidAt(x, y, z)) return true
    }
    return false
  }

  liquidAt(x: number, y: number, z: number): boolean {
    return this.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) === B.WATER
  }

  /** Dry spawn point near the origin (uses the generator, no chunks needed). */
  findSpawn(): { x: number; y: number; z: number } {
    for (let r = 0; r < 600; r += 6) {
      const steps = Math.max(1, Math.floor(r / 3))
      for (let i = 0; i < steps; i += 1) {
        const a = (i / steps) * Math.PI * 2
        const x = Math.floor(Math.cos(a) * r), z = Math.floor(Math.sin(a) * r)
        const h = this.gen.groundHeight(x, z)
        if (h > 32 && h < 60) return { x: x + 0.5, y: h + 1.01, z: z + 0.5 }
      }
    }
    return { x: 0.5, y: 70, z: 0.5 }
  }

  exportEdits(): [number, [number, number][]][] {
    const out: [number, [number, number][]][] = []
    for (const [k, m] of this.edits) out.push([k, [...m.entries()]])
    return out
  }

  importEdits(list: [number, [number, number][]][]): void {
    for (const [k, arr] of list) { this.edits.set(k, new Map(arr)); this.editCount += arr.length }
  }

  /** Apply an edit by world coordinate (works before the chunk exists). */
  stageEdit(x: number, y: number, z: number, id: number): void {
    const cx = x >> 4, cz = z >> 4
    if (this.chunks.has(this.key(cx, cz))) { this.setBlock(x, y, z, id, true); return }
    const k = this.key(cx, cz)
    let m = this.edits.get(k)
    if (!m) { m = new Map(); this.edits.set(k, m) }
    m.set((x & 15) + (z & 15) * CS + y * CS * CS, id)
  }
}
