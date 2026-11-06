import { B, BLOCKS, CH, CS, SEA } from './blocks'
import { Noise, hash3 } from './noise'

export interface ChunkData { data: Uint8Array; top: Uint8Array }

enum Biome { Plains, Forest, Desert, Snow, Mountain }

const skyBlocking = new Uint8Array(256)
for (const d of BLOCKS) if (d && (d.opaque || d.id === B.LEAVES)) skyBlocking[d.id] = 1

const smooth = (t: number) => t * t * (3 - 2 * t)
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t)

export type Dimension = 'overworld' | 'end'

export class WorldGen {
  private n: Noise
  private seedInt: number
  constructor(public seed: number, public dimension: Dimension = 'overworld') {
    this.n = new Noise(seed)
    this.seedInt = seed | 0
  }

  private column(x: number, z: number): { h: number; biome: Biome } {
    const n = this.n
    if (this.dimension === 'end') {
      const gx = Math.round(x / 128), gz = Math.round(z / 128)
      const cx = gx === 0 && gz === 0 ? 0 : gx * 128 + (hash3(gx, 0, gz, this.seedInt) - 0.5) * 50
      const cz = gx === 0 && gz === 0 ? 0 : gz * 128 + (hash3(gx, 1, gz, this.seedInt) - 0.5) * 50
      const radius = gx === 0 && gz === 0 ? 34 : 18 + hash3(gx, 2, gz, this.seedInt) * 18
      const dist = Math.hypot(x - cx, z - cz)
      const surface = radius - dist + n.fbm2(x / 15, z / 15, 2) * 4
      return { h: surface > 0 ? Math.max(4, Math.floor(40 + surface * 0.34)) : -8, biome: Biome.Mountain }
    }
    const cont = n.fbm2(x / 260, z / 260, 3)
    const hills = n.fbm2(x / 70, z / 70, 4)
    const mount = n.fbm2(x / 230 + 100, z / 230 - 70, 3)
    const m = clamp01((mount - 0.1) * 3.4)
    let h = 34 + cont * 24 + hills * 8 + m * m * 52
    const rv = Math.abs(n.fbm2(x / 320 + 500, z / 320 - 300, 2))
    if (rv < 0.045) {
      const f = smooth(1 - rv / 0.045) * (1 - m)
      h = h + (Math.min(h, SEA - 3) - h) * f
    }
    h = Math.floor(h)
    if (h < 3) h = 3
    if (h > CH - 8) h = CH - 8
    const temp = n.fbm2(x / 420 + 900, z / 420 + 100, 2)
    const moist = n.fbm2(x / 320 - 1700, z / 320 + 400, 2)
    let biome = Biome.Plains
    if (h > 70 && m > 0.25) biome = Biome.Mountain
    else if (temp < -0.2) biome = Biome.Snow
    else if (temp > 0.12 && moist < 0.02) biome = Biome.Desert
    else if (moist > 0.06) biome = Biome.Forest
    return { h, biome }
  }

  /** Height of the highest solid ground at a column (used for spawning). */
  groundHeight(x: number, z: number): number { return this.column(x, z).h }

  generate(cx: number, cz: number): ChunkData {
    const data = new Uint8Array(CS * CS * CH)
    const top = new Uint8Array(CS * CS)
    const n = this.n
    const seed = this.seedInt
    const ox = cx * CS, oz = cz * CS
    const R = 3
    const W = CS + R * 2
    const hs = new Int16Array(W * W)
    const bs = new Uint8Array(W * W)
    for (let z = -R; z < CS + R; z += 1) for (let x = -R; x < CS + R; x += 1) {
      const c = this.column(ox + x, oz + z)
      hs[(z + R) * W + x + R] = c.h
      bs[(z + R) * W + x + R] = c.biome
    }
    const idx = (x: number, y: number, z: number) => x + z * CS + y * CS * CS

    if (this.dimension === 'end') {
      for (let z=0;z<CS;z+=1) for(let x=0;x<CS;x+=1) {
        const h=hs[(z+R)*W+x+R]
        if(h<0) continue
        const depth=Math.min(13,3+Math.floor((h-40)*0.7))
        const bottom=Math.max(3,h-depth)
        for(let y=bottom;y<=h;y+=1) data[idx(x,y,z)]=y===bottom?B.BEDROCK:B.OBSIDIAN
        top[x+z*CS]=h
      }
      return { data, top }
    }

    for (let z = 0; z < CS; z += 1) for (let x = 0; x < CS; x += 1) {
      const wx = ox + x, wz = oz + z
      const h = hs[(z + R) * W + x + R]
      const biome = bs[(z + R) * W + x + R] as Biome
      const rock = hash3(wx, 0, wz, seed)
      for (let y = 0; y <= h; y += 1) {
        let id: number = B.STONE
        const depth = h - y
        if (y === 0) id = B.BEDROCK
        else if (y === 1 && rock < 0.5) id = B.BEDROCK
        else if (h <= SEA + 1 && depth < 4) id = h <= SEA - 2 && rock < 0.28 ? B.GRAVEL : B.SAND
        else if (biome === Biome.Desert) id = depth < 4 ? B.SAND : depth < 8 ? B.SANDSTONE : B.STONE
        else if (biome === Biome.Mountain) id = h > 80 && depth === 0 ? B.SNOW : depth === 0 && rock < 0.12 ? B.GRAVEL : B.STONE
        else if (biome === Biome.Snow) id = depth === 0 ? B.SNOW : depth < 4 ? B.DIRT : B.STONE
        else id = depth === 0 ? B.GRASS : depth < 4 ? B.DIRT : B.STONE

        if (id === B.STONE && y > 4 && y < h - 3) {
          // tunnels + caverns
          const a = n.perlin3(wx * 0.045, y * 0.065, wz * 0.045)
          const b = n.perlin3(wx * 0.045 + 100, y * 0.065 + 50, wz * 0.045 - 70)
          if (a * a + b * b < 0.0018) id = B.AIR
          else if (y < 38 && n.perlin3(wx * 0.022, y * 0.04 + 7, wz * 0.022) > 0.52) id = B.AIR
          else if (y < 62) {
            const oreNoise = n.perlin3(wx * 0.13 + 61, y * 0.13 - 17, wz * 0.13 + 29)
            const vein = hash3(wx, y, wz, seed + 733)
            const o = n.perlin3(wx * 0.16, y * 0.16, wz * 0.16 + 55)
            if (y < 17 && oreNoise > 0.34 && vein < 0.005) id = B.DIAMOND_ORE
            else if (y < 34 && oreNoise > 0.30 && vein < 0.008) id = B.GOLD_ORE
            else if (y < 58 && oreNoise > 0.25 && vein < 0.035) id = B.IRON_ORE
            else if (o > 0.46 && hash3(wx, y, wz, seed) < 0.18) id = B.COAL_ORE
            else if (n.perlin3(wx * 0.11 + 30, y * 0.11, wz * 0.11) > 0.5) id = B.GRAVEL
          }
        }
        data[idx(x, y, z)] = id
      }
      if (h < SEA) for (let y = h + 1; y <= SEA; y += 1) data[idx(x, y, z)] = B.WATER
    }

    // decorations that may overlap chunk borders
    const set = (x: number, y: number, z: number, id: number, soft: boolean) => {
      if (x < 0 || z < 0 || x >= CS || z >= CS || y < 0 || y >= CH) return
      const i = idx(x, y, z)
      if (soft && data[i] !== B.AIR) return
      data[i] = id
    }
    for (let z = -2; z < CS + 2; z += 1) for (let x = -2; x < CS + 2; x += 1) {
      const wi = (z + R) * W + x + R
      const h = hs[wi]
      const biome = bs[wi] as Biome
      if (h <= SEA + 1) continue
      const r = hash3(ox + x, 7, oz + z, seed + 99)
      if (biome === Biome.Desert) {
        if (r < 0.004 && x >= 0 && x < CS && z >= 0 && z < CS) {
          const ch = 1 + Math.floor(hash3(ox + x, 8, oz + z, seed) * 3)
          for (let k = 1; k <= ch; k += 1) set(x, h + k, z, B.CACTUS, true)
        }
        continue
      }
      const dens = biome === Biome.Forest ? 0.03 : biome === Biome.Plains ? 0.0035 : biome === Biome.Snow ? 0.006 : 0
      if (r >= dens) continue
      if (h + 8 >= CH) continue
      const th = 4 + Math.floor(hash3(ox + x, 9, oz + z, seed) * 3)
      for (let k = 1; k <= th; k += 1) set(x, h + k, z, B.LOG, false)
      for (let dy = th - 2; dy <= th + 1; dy += 1) {
        const rad = dy >= th ? 1 : 2
        for (let dz = -rad; dz <= rad; dz += 1) for (let dx = -rad; dx <= rad; dx += 1) {
          if (dx === 0 && dz === 0 && dy <= th) continue
          if (Math.abs(dx) === rad && Math.abs(dz) === rad && (rad === 2 ? hash3(ox + x + dx, dy, oz + z + dz, seed) < 0.5 : dy > th || hash3(ox + x + dx, dy, oz + z + dz, seed) < 0.4)) continue
          set(x + dx, h + dy, z + dz, B.LEAVES, true)
        }
      }
    }

    // Sparse wildflowers: coordinate hashing keeps results stable across chunk edges.
    for (let z = -2; z < CS + 2; z += 1) for (let x = -2; x < CS + 2; x += 1) {
      const h = hs[(z + R) * W + x + R]
      const biome = bs[(z + R) * W + x + R] as Biome
      if (h <= SEA + 1 || h + 1 >= CH || (biome !== Biome.Plains && biome !== Biome.Forest && biome !== Biome.Snow)) continue
      const roll = hash3(ox + x, 17, oz + z, seed + 417)
      const density = biome === Biome.Plains ? 0.009 : biome === Biome.Forest ? 0.004 : 0.003
      if (roll >= density) continue
      const flower = hash3(ox + x, 18, oz + z, seed + 418) < 0.34 ? B.FLOWER_RED
        : hash3(ox + x, 19, oz + z, seed + 419) < 0.52 ? B.FLOWER_YELLOW : B.FLOWER_WHITE
      set(x, h + 1, z, flower, true)
    }

    // Rare, chunk-owned villages. Restrict the footprint to a level, dry clearing;
    // all construction is above the surface, leaving caves and ores untouched.
    const villageRoll = hash3(cx, 0, cz, seed + 12031)
    if (villageRoll < 0.014) {
      const vx = 4 + Math.floor(hash3(cx, 1, cz, seed + 12031) * 4)
      const vz = 4 + Math.floor(hash3(cx, 2, cz, seed + 12031) * 4)
      const base = hs[(vz + R) * W + vx + R]
      let suitable = base > SEA + 2 && base + 8 < CH
      for (let z = vz - 3; z <= vz + 3 && suitable; z += 1) for (let x = vx - 3; x <= vx + 6; x += 1) {
        const i = (z + R) * W + x + R
        const h = hs[i]
        const biome = bs[i] as Biome
        if (h <= SEA + 1 || Math.abs(h - base) > 1 || (biome !== Biome.Plains && biome !== Biome.Forest)) { suitable = false; break }
        // Reject any existing tree or other decoration in the build/clearing volume.
        for (let y = h + 1; y <= base + 7; y += 1) {
          const block = data[idx(x, y, z)]
          if (block !== B.AIR) { suitable = false; break }
        }
      }
      if (suitable) {
        const floorY = base + 1
        // Two compact original houses, a short connecting path, and a lamp.
        const house = (hx: number, hz: number) => {
          for (let z = hz; z < hz + 5; z += 1) for (let x = hx; x < hx + 5; x += 1) {
            const edge = x === hx || x === hx + 4 || z === hz || z === hz + 4
            if (edge) set(x, floorY, z, B.PLANKS, false)
            for (let y = floorY + 1; y <= floorY + 3; y += 1) {
              const wall = x === hx || x === hx + 4 || z === hz || z === hz + 4
              if (wall) set(x, y, z, (x === hx || x === hx + 4) && (z === hz || z === hz + 4) ? B.LOG : B.PLANKS, false)
            }
            set(x, floorY + 4, z, B.PLANKS, false)
          }
          // Doorways face the path; glass windows flank the entrance.
          set(hx + 2, floorY + 1, hz + 4, B.DOOR, false)
          set(hx + 2, floorY + 2, hz + 4, B.DOOR, false)
          set(hx + 1, floorY + 2, hz + 4, B.GLASS, false)
          set(hx + 3, floorY + 2, hz + 4, B.GLASS, false)
          set(hx + 2, floorY + 5, hz + 2, B.LAMP, false)
          // Low stair eaves on opposite sides.
          for (let x = hx; x <= hx + 4; x += 1) {
            set(x, floorY + 4, hz - 1, B.STAIRS, false)
            set(x, floorY + 4, hz + 5, B.STAIRS, false)
          }
        }
        house(vx - 3, vz - 2)
        house(vx + 2, vz - 2)
        for (let x = vx - 1; x <= vx + 3; x += 1) set(x, floorY, vz + 3, B.PLANKS, false)
        set(vx + 1, floorY + 1, vz + 3, B.LAMP, false)
      }
    }

    for (let z = 0; z < CS; z += 1) for (let x = 0; x < CS; x += 1) {
      let t = 0
      for (let y = CH - 1; y >= 0; y -= 1) {
        if (skyBlocking[data[idx(x, y, z)]]) { t = y; break }
      }
      top[x + z * CS] = t
    }
    return { data, top }
  }
}
