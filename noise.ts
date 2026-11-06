// Seeded gradient noise (Perlin) in 2D/3D plus integer hashing helpers.

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fast integer hash of up to three coordinates -> [0,1). */
export function hash3(x: number, y: number, z: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2147483647) + Math.imul(seed | 0, 1274126177)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h = Math.imul(h ^ (h >>> 16), 2246822519)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

const G3: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
]

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export class Noise {
  private perm = new Uint8Array(512)
  constructor(seed: number) {
    const rnd = mulberry32(seed)
    const p = new Uint8Array(256)
    for (let i = 0; i < 256; i += 1) p[i] = i
    for (let i = 255; i > 0; i -= 1) {
      const j = Math.floor(rnd() * (i + 1))
      const t = p[i]; p[i] = p[j]; p[j] = t
    }
    for (let i = 0; i < 512; i += 1) this.perm[i] = p[i & 255]
  }

  perlin3(x: number, y: number, z: number): number {
    const perm = this.perm
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z)
    const xf = x - X, yf = y - Y, zf = z - Z
    const xi = X & 255, yi = Y & 255, zi = Z & 255
    const u = fade(xf), v = fade(yf), w = fade(zf)
    const g = (hx: number, hy: number, hz: number, dx: number, dy: number, dz: number) => {
      const gr = G3[perm[perm[perm[hx] + hy] + hz] % 12]
      return gr[0] * dx + gr[1] * dy + gr[2] * dz
    }
    const x1 = xi + 1, y1 = yi + 1, z1 = zi + 1
    const n000 = g(xi, yi, zi, xf, yf, zf)
    const n100 = g(x1 & 255, yi, zi, xf - 1, yf, zf)
    const n010 = g(xi, y1 & 255, zi, xf, yf - 1, zf)
    const n110 = g(x1 & 255, y1 & 255, zi, xf - 1, yf - 1, zf)
    const n001 = g(xi, yi, z1 & 255, xf, yf, zf - 1)
    const n101 = g(x1 & 255, yi, z1 & 255, xf - 1, yf, zf - 1)
    const n011 = g(xi, y1 & 255, z1 & 255, xf, yf - 1, zf - 1)
    const n111 = g(x1 & 255, y1 & 255, z1 & 255, xf - 1, yf - 1, zf - 1)
    return lerp(
      lerp(lerp(n000, n100, u), lerp(n010, n110, u), v),
      lerp(lerp(n001, n101, u), lerp(n011, n111, u), v),
      w,
    ) * 0.9
  }

  perlin2(x: number, y: number): number {
    return this.perlin3(x, y, 0.5)
  }

  fbm2(x: number, y: number, octaves: number): number {
    let amp = 1, freq = 1, sum = 0, norm = 0
    for (let i = 0; i < octaves; i += 1) {
      sum += this.perlin3(x * freq, y * freq, i * 17.31) * amp
      norm += amp
      amp *= 0.5
      freq *= 2
    }
    return sum / norm
  }
}
