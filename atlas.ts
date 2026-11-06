// Procedural 16x16 pixel-art textures (all original, generated in code) + inventory icons.
import * as THREE from 'three'
import { ATLAS_COLS, ATLAS_ROWS, B, BLOCKS, I, T } from './blocks'
import { mulberry32 } from './noise'

type RGB = [number, number, number]
const TILE = 16

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

class Painter {
  img: ImageData
  rnd: () => number
  constructor(seed: number) {
    this.img = new ImageData(TILE, TILE)
    this.rnd = mulberry32(seed)
  }
  px(x: number, y: number, c: RGB, a = 255): void {
    if (x < 0 || y < 0 || x >= TILE || y >= TILE) return
    const i = (y * TILE + x) * 4
    this.img.data[i] = Math.max(0, Math.min(255, c[0]))
    this.img.data[i + 1] = Math.max(0, Math.min(255, c[1]))
    this.img.data[i + 2] = Math.max(0, Math.min(255, c[2]))
    this.img.data[i + 3] = a
  }
  get(x: number, y: number): RGB {
    const i = (y * TILE + x) * 4
    return [this.img.data[i], this.img.data[i + 1], this.img.data[i + 2]]
  }
  fill(base: RGB, vari: number): void {
    for (let y = 0; y < TILE; y += 1) for (let x = 0; x < TILE; x += 1) {
      const k = 1 + (this.rnd() - 0.5) * vari
      this.px(x, y, [base[0] * k, base[1] * k, base[2] * k])
    }
  }
  speckle(c: RGB, chance: number, vari = 0.15): void {
    for (let y = 0; y < TILE; y += 1) for (let x = 0; x < TILE; x += 1) {
      if (this.rnd() < chance) {
        const k = 1 + (this.rnd() - 0.5) * vari
        this.px(x, y, [c[0] * k, c[1] * k, c[2] * k])
      }
    }
  }
}


function paintTile(id: number): ImageData {
  const p = new Painter(id * 7919 + 13)
  switch (id) {
    case T.GRASS_TOP: p.fill([96, 160, 56], 0.28); p.speckle([70, 130, 40], 0.18, 0.3); break
    case T.DIRT: p.fill([134, 96, 67], 0.3); p.speckle([100, 70, 48], 0.2, 0.3); p.speckle([160, 120, 88], 0.08, 0.2); break
    case T.GRASS_SIDE: {
      p.fill([134, 96, 67], 0.3); p.speckle([100, 70, 48], 0.2, 0.3)
      for (let x = 0; x < TILE; x += 1) {
        const d = 3 + Math.floor(p.rnd() * 3)
        for (let y = 0; y < d; y += 1) {
          const k = 1 + (p.rnd() - 0.5) * 0.28
          p.px(x, y, [96 * k, 160 * k, 56 * k])
        }
      }
      break
    }
    case T.STONE: p.fill([125, 125, 125], 0.22); p.speckle([100, 100, 100], 0.15, 0.2); p.speckle([150, 150, 150], 0.1, 0.2); break
    case T.COBBLE: {
      p.fill([118, 118, 118], 0.3)
      const dark: RGB = [70, 70, 70]
      for (let i = 0; i < TILE; i += 1) {
        p.px(i, 0, dark); p.px(i, 8, dark); p.px(i, 5, dark)
      }
      for (let y = 0; y < 5; y += 1) { p.px(4, y, dark); p.px(11, y, dark) }
      for (let y = 6; y < 8; y += 1) { p.px(7, y, dark); p.px(1, y, dark) }
      for (let y = 9; y < TILE; y += 1) { p.px(2, y, dark); p.px(9, y, dark); p.px(14, y, dark) }
      for (let i = 0; i < TILE; i += 1) p.px(i, 13, dark)
      p.speckle([150, 150, 150], 0.1)
      break
    }
    case T.SAND: p.fill([218, 205, 150], 0.14); p.speckle([190, 175, 120], 0.15); break
    case T.GRAVEL: p.fill([130, 125, 122], 0.34); p.speckle([90, 85, 84], 0.22, 0.3); p.speckle([170, 165, 160], 0.1); break
    case T.LOG_SIDE: {
      for (let x = 0; x < TILE; x += 1) {
        const col = 1 + Math.sin(x * 1.7) * 0.1 + (p.rnd() - 0.5) * 0.12
        for (let y = 0; y < TILE; y += 1) p.px(x, y, [100 * col, 76 * col, 45 * col])
      }
      p.speckle([60, 44, 26], 0.1, 0.3)
      break
    }
    case T.LOG_TOP: {
      p.fill([166, 134, 84], 0.12)
      for (let y = 0; y < TILE; y += 1) for (let x = 0; x < TILE; x += 1) {
        const r = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5))
        if (r > 6.5) p.px(x, y, [98 * (1 + (p.rnd() - 0.5) * 0.1), 74, 44])
        else if (Math.floor(r) % 2 === 0) p.px(x, y, [136, 104, 62])
      }
      break
    }
    case T.LEAVES: {
      for (let y = 0; y < TILE; y += 1) for (let x = 0; x < TILE; x += 1) {
        const k = 0.65 + p.rnd() * 0.5
        const hole = p.rnd() < 0.13
        p.px(x, y, [58 * k, 128 * k, 40 * k], hole ? 0 : 255)
      }
      break
    }
    case T.PLANKS: {
      p.fill([172, 136, 80], 0.14)
      for (let y = 0; y < TILE; y += 4) for (let x = 0; x < TILE; x += 1) p.px(x, y + 3, [112, 84, 46])
      for (let b = 0; b < 4; b += 1) {
        const sx = (b * 5 + 3) % TILE
        for (let y = b * 4; y < b * 4 + 3; y += 1) p.px(sx, y, [130, 98, 56])
      }
      break
    }
    case T.WATER: {
      for (let y = 0; y < TILE; y += 1) for (let x = 0; x < TILE; x += 1) {
        const k = 1 + (p.rnd() - 0.5) * 0.18
        p.px(x, y, [44 * k, 90 * k, 214 * k], 190)
      }
      p.speckle([120, 170, 255], 0.08, 0.1)
      break
    }
    case T.GLASS: {
      for (let y = 0; y < TILE; y += 1) for (let x = 0; x < TILE; x += 1) {
        const edge = x === 0 || y === 0 || x === TILE - 1 || y === TILE - 1
        if (edge) p.px(x, y, [200, 230, 240], 230)
        else p.px(x, y, [200, 230, 240], 0)
      }
      for (const [x, y] of [[3, 3], [4, 4], [5, 5], [3, 5], [4, 6], [10, 9], [11, 10], [12, 11], [9, 12]]) p.px(x, y, [255, 255, 255], 200)
      break
    }
    case T.BRICK: {
      p.fill([160, 70, 56], 0.2)
      const m: RGB = [190, 180, 170]
      for (let i = 0; i < TILE; i += 1) for (const y of [3, 7, 11, 15]) p.px(i, y, m)
      for (let r = 0; r < 4; r += 1) {
        const off = r % 2 ? 4 : 0
        for (const x of [off, off + 8]) for (let y = r * 4; y < r * 4 + 3; y += 1) p.px(x % TILE, y, m)
      }
      break
    }
    case T.SANDSTONE_SIDE: {
      p.fill([214, 198, 142], 0.1)
      for (let x = 0; x < TILE; x += 1) { p.px(x, 3, [190, 172, 118]); p.px(x, 12, [190, 172, 118]) }
      p.speckle([190, 172, 118], 0.08)
      break
    }
    case T.SANDSTONE_TOP: p.fill([218, 203, 148], 0.1); p.speckle([196, 180, 124], 0.12); break
    case T.BEDROCK: p.fill([60, 60, 62], 0.5); p.speckle([20, 20, 22], 0.3, 0.4); p.speckle([100, 100, 104], 0.12); break
    case T.SNOW: p.fill([245, 248, 252], 0.06); p.speckle([220, 230, 240], 0.15, 0.1); break
    case T.SNOW_SIDE: {
      p.fill([134, 96, 67], 0.3); p.speckle([100, 70, 48], 0.2, 0.3)
      for (let x = 0; x < TILE; x += 1) {
        const d = 3 + Math.floor(p.rnd() * 3)
        for (let y = 0; y < d; y += 1) p.px(x, y, [243 - p.rnd() * 14, 247 - p.rnd() * 10, 252])
      }
      break
    }
    case T.CACTUS_SIDE: {
      for (let y = 0; y < TILE; y += 1) for (let x = 0; x < TILE; x += 1) {
        const k = 1 + (p.rnd() - 0.5) * 0.15 + (x % 5 === 2 ? -0.18 : 0)
        p.px(x, y, [40 * k, 128 * k, 48 * k])
      }
      for (let y = 1; y < TILE; y += 4) for (const x of [2, 7, 12]) p.px(x, y, [225, 225, 190])
      p.px(0, 0, [24, 88, 32]); p.px(15, 0, [24, 88, 32])
      break
    }
    case T.CACTUS_TOP: {
      p.fill([40, 128, 48], 0.2)
      for (let i = 0; i < TILE; i += 1) { p.px(i, 0, [26, 92, 34]); p.px(i, 15, [26, 92, 34]); p.px(0, i, [26, 92, 34]); p.px(15, i, [26, 92, 34]) }
      p.px(7, 7, [225, 225, 190]); p.px(8, 8, [225, 225, 190])
      break
    }
    case T.TABLE_TOP: {
      p.fill([172, 136, 80], 0.12)
      for (let i = 0; i < TILE; i += 1) { p.px(i, 0, [96, 70, 40]); p.px(i, 15, [96, 70, 40]); p.px(0, i, [96, 70, 40]); p.px(15, i, [96, 70, 40]) }
      for (let i = 4; i < 12; i += 1) { p.px(i, 4, [110, 84, 50]); p.px(i, 11, [110, 84, 50]); p.px(4, i, [110, 84, 50]); p.px(11, i, [110, 84, 50]) }
      break
    }
    case T.TABLE_SIDE: case T.TABLE_FRONT: {
      p.fill([150, 116, 68], 0.14)
      for (let x = 0; x < TILE; x += 1) { p.px(x, 0, [96, 70, 40]); p.px(x, 15, [96, 70, 40]); p.px(x, 4, [100, 74, 42]) }
      for (let y = 0; y < TILE; y += 1) { p.px(0, y, [96, 70, 40]); p.px(15, y, [96, 70, 40]) }
      // tools hanging
      for (let y = 6; y < 14; y += 1) { p.px(3, y, [80, 80, 86]); p.px(4, y, [80, 80, 86]) }
      for (let y = 6; y < 14; y += 1) p.px(10, y, [100, 76, 44])
      for (let x = 8; x < 14; x += 1) p.px(x, 6, [150, 150, 158])
      break
    }
    case T.COAL_ORE: {
      p.fill([125, 125, 125], 0.22); p.speckle([100, 100, 100], 0.15, 0.2)
      for (const [x, y] of [[3, 3], [4, 3], [3, 4], [10, 2], [11, 2], [11, 3], [6, 9], [7, 9], [6, 10], [7, 10], [12, 11], [13, 11], [12, 12], [2, 12], [3, 12]]) p.px(x, y, [30, 30, 32])
      break
    }
    case T.IRON_ORE: {
      p.fill([124, 124, 128], 0.2); p.speckle([103, 105, 108], 0.15)
      for (const [x,y] of [[2,3],[3,3],[2,4],[9,2],[10,2],[10,3],[6,9],[7,9],[6,10],[12,12],[13,12]]) p.px(x,y,[197,142,78])
      break
    }
    case T.GOLD_ORE: {
      p.fill([124, 124, 128], 0.2); p.speckle([103, 105, 108], 0.15)
      for (const [x,y] of [[2,3],[3,3],[2,4],[9,2],[10,2],[10,3],[6,9],[7,9],[6,10],[12,12],[13,12]]) p.px(x,y,[255,210,54])
      break
    }
    case T.DIAMOND_ORE: {
      p.fill([124, 124, 128], 0.2); p.speckle([103, 105, 108], 0.15)
      for (const [x,y] of [[2,3],[3,3],[2,4],[9,2],[10,2],[10,3],[6,9],[7,9],[6,10],[12,12],[13,12]]) p.px(x,y,[66,231,224])
      break
    }
    case T.OBSIDIAN: p.fill([36, 26, 62], 0.28); p.speckle([82, 48, 132], 0.15); p.speckle([20, 16, 40], 0.18); break
    case T.PORTAL_FRAME: {
      p.fill([45, 37, 64], 0.2); p.speckle([106, 82, 146], 0.22)
      for (let x=2; x<14; x+=1) { p.px(x,2,[184,155,80]); p.px(x,13,[184,155,80]) }
      for (let y=2; y<14; y+=1) { p.px(2,y,[184,155,80]); p.px(13,y,[184,155,80]) }
      break
    }
    case T.END_PORTAL: {
      p.fill([24, 8, 48], 0.32)
      for (let i=0;i<34;i+=1) { const x=Math.floor(p.rnd()*16), y=Math.floor(p.rnd()*16); p.px(x,y,p.rnd()<0.5?[140,48,220]:[46,170,180],190) }
      for (let i=0;i<3;i+=1) p.px(3+i*5,5+i*3,[220,206,255],220)
      break
    }
    case T.FLOWER_RED: case T.FLOWER_YELLOW: case T.FLOWER_WHITE: {
      const bloom: RGB = id === T.FLOWER_RED ? [222,54,62] : id === T.FLOWER_YELLOW ? [250,210,54] : [242,240,220]
      p.fill([54,112,42],0.08); for(let y=5;y<15;y++)p.px(8,y,[56,145,54])
      for(const [x,y] of [[6,3],[7,2],[8,2],[9,2],[10,3],[6,4],[7,4],[8,5],[9,4],[10,4],[8,3]])p.px(x,y,bloom)
      p.px(7,3,[255,245,175]); break
    }
    case T.DOOR: case T.DOOR_OPEN: {
      p.fill([104,68,38],0.12); for(let y=1;y<16;y++)for(let x=2;x<14;x++)p.px(x,y,[154,104,55])
      for(let y=2;y<15;y+=4)for(let x=3;x<13;x++)p.px(x,y,[112,72,39]); for(let y=3;y<14;y++){p.px(2,y,[74,49,31]);p.px(13,y,[74,49,31])}
      p.px(11,8,[244,190,76]); if(id===T.DOOR_OPEN)for(let y=1;y<16;y++)p.px(3,y,[154,104,55]); break
    }
    case T.STAIRS: p.fill([148,105,58],0.12); for(let y=4;y<16;y+=4)for(let x=0;x<16;x++)p.px(x,y,[84,56,32]); for(let x=2;x<16;x+=4)for(let y=0;y<16;y++)p.px(x,y,[184,134,76]); break
    case T.CHEST: p.fill([145,91,42],0.1); for(let x=1;x<15;x++){p.px(x,4,[83,54,31]);p.px(x,12,[83,54,31])} for(let y=4;y<13;y++){p.px(1,y,[83,54,31]);p.px(14,y,[83,54,31])} for(let y=4;y<13;y++)p.px(8,y,[220,174,64]);p.px(8,8,[245,218,118]);break
    case T.BED: p.fill([112,66,45],0.1);for(let y=9;y<14;y++)for(let x=2;x<15;x++)p.px(x,y,[156,56,64]);for(let y=6;y<10;y++)for(let x=2;x<7;x++)p.px(x,y,[235,225,198]);for(let x=2;x<15;x++)p.px(x,14,[97,64,42]);break
    case T.FURNACE: p.fill([105,105,108],0.2);for(let i=2;i<14;i++){p.px(i,2,[52,52,56]);p.px(i,13,[52,52,56])}for(let y=2;y<14;y++){p.px(2,y,[52,52,56]);p.px(13,y,[52,52,56])}for(let y=7;y<12;y++)for(let x=6;x<11;x++)p.px(x,y,[49,42,38]);p.px(7,10,[234,105,35]);p.px(8,9,[255,190,55]);break
    case T.CANDLE: p.fill([220,196,136],0.05);for(let y=5;y<14;y++)for(let x=7;x<10;x++)p.px(x,y,[238,224,174]);p.px(8,3,[255,184,44]);p.px(8,4,[255,230,106]);p.px(8,5,[84,62,42]);break
    case T.COUCH: p.fill([85,108,132],0.08);for(let y=5;y<12;y++)for(let x=2;x<14;x++)p.px(x,y,[62,92,128]);for(let y=3;y<7;y++)for(let x=1;x<5;x++)p.px(x,y,[85,120,158]);for(let y=3;y<7;y++)for(let x=11;x<15;x++)p.px(x,y,[85,120,158]);for(let x=3;x<13;x+=4)p.px(x,13,[82,55,36]);break
    case T.SIDE_TABLE: p.fill([158,111,60],0.1);for(let x=2;x<14;x++)p.px(x,5,[83,56,33]);for(let y=6;y<14;y++){p.px(4,y,[106,72,40]);p.px(11,y,[106,72,40])}for(let x=2;x<14;x++)p.px(x,14,[83,56,33]);break
    case T.TV: p.fill([48,53,62],0.08);for(let y=2;y<12;y++)for(let x=1;x<15;x++)p.px(x,y,[34,38,46]);for(let y=4;y<10;y++)for(let x=3;x<13;x++)p.px(x,y,[38,119,146]);for(let x=5;x<11;x++)p.px(x,13,[112,79,48]);p.px(13,11,[224,64,54]);break
    case T.TV_ON: p.fill([48,53,62],0.08);for(let y=2;y<12;y++)for(let x=1;x<15;x++)p.px(x,y,[30,34,40]);for(let y=4;y<10;y++)for(let x=3;x<13;x++)p.px(x,y,[44,178,200]);for(let x=3;x<13;x+=3)p.px(x,6,[186,243,244]);for(let x=5;x<11;x++)p.px(x,13,[112,79,48]);p.px(13,11,[71,228,105]);break
    case T.LAMP: {
      p.fill([255, 214, 120], 0.12)
      const f: RGB = [150, 100, 40]
      for (let i = 0; i < TILE; i += 1) { p.px(i, 0, f); p.px(i, 15, f); p.px(0, i, f); p.px(15, i, f); p.px(i, 7, f); p.px(7, i, f); p.px(8, i, f); p.px(i, 8, f) }
      for (const [x, y] of [[3, 3], [11, 3], [3, 11], [11, 11]]) p.px(x, y, [255, 250, 220])
      break
    }
    default: p.fill([255, 0, 255], 0)
  }
  return p.img
}

export interface Atlas {
  canvas: HTMLCanvasElement
  texture: THREE.CanvasTexture
  /** average colour per tile for particles */
  avg: RGB[]
}

export function buildAtlas(): Atlas {
  const canvas = makeCanvas(ATLAS_COLS * TILE, ATLAS_ROWS * TILE)
  const ctx = canvas.getContext('2d')!
  const avg: RGB[] = []
  for (let id = 0; id < ATLAS_COLS * ATLAS_ROWS; id += 1) {
    const img = paintTile(id)
    ctx.putImageData(img, (id % ATLAS_COLS) * TILE, Math.floor(id / ATLAS_COLS) * TILE)
    let r = 0, g = 0, b = 0, n = 0
    for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3] > 20) { r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n += 1 }
    avg.push(n ? [r / n, g / n, b / n] : [128, 128, 128])
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.colorSpace = THREE.SRGBColorSpace
  texture.generateMipmaps = false
  return { canvas, texture, avg }
}

/** Crack overlay strip: 10 stages of 16px, returned as texture sized 160x16. */
export function buildCrackTexture(): THREE.CanvasTexture {
  const c = makeCanvas(TILE * 10, TILE)
  const ctx = c.getContext('2d')!
  const rnd = mulberry32(4242)
  const order: [number, number][] = []
  for (let y = 0; y < TILE; y += 1) for (let x = 0; x < TILE; x += 1) order.push([x, y])
  // build a spreading crack: seeds in centre, grow outward with randomness
  const cracked = new Set<string>()
  const list: [number, number][] = []
  const add = (x: number, y: number) => { const k = `${x},${y}`; if (!cracked.has(k) && x >= 0 && y >= 0 && x < TILE && y < TILE) { cracked.add(k); list.push([x, y]) } }
  add(8, 8)
  let cx = 8, cy = 8
  for (let i = 0; i < 90; i += 1) {
    const d = Math.floor(rnd() * 4)
    cx += d === 0 ? 1 : d === 1 ? -1 : 0
    cy += d === 2 ? 1 : d === 3 ? -1 : 0
    if (rnd() < 0.2) { cx = 8; cy = 8 }
    add(Math.max(0, Math.min(15, cx)), Math.max(0, Math.min(15, cy)))
  }
  for (let stage = 0; stage < 10; stage += 1) {
    const count = Math.floor(((stage + 1) / 10) * Math.min(list.length, 120))
    ctx.fillStyle = 'rgba(0,0,0,0.62)'
    for (let i = 0; i < count && i < list.length; i += 1) ctx.fillRect(stage * TILE + list[i][0], list[i][1], 1, 1)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.wrapS = THREE.RepeatWrapping
  tex.repeat.set(0.1, 1)
  return tex
}

// ------------------------------------------------------------ icons

function drawPixels(ctx: CanvasRenderingContext2D, pts: [number, number][], color: string): void {
  ctx.fillStyle = color
  for (const [x, y] of pts) ctx.fillRect(x, y, 1, 1)
}

const MAT_COL: Record<string, [string, string]> = { wood: ['#b8905a', '#8a6a3c'], stone: ['#9a9a9a', '#6c6c6c'], iron: ['#d0d3d8','#858b94'], diamond: ['#56e0dc','#278f9b'] }

function drawToolIcon(ctx: CanvasRenderingContext2D, kind: string, mat: string): void {
  const [light, dark] = MAT_COL[mat]
  const handle: [number, number][] = []
  for (let i = 0; i < 10; i += 1) handle.push([3 + i, 13 - i])
  drawPixels(ctx, handle, '#6b4a26')
  drawPixels(ctx, handle.map(([x, y]) => [x, y - 1] as [number, number]).slice(0, 8), '#8a6636')
  let head: [number, number][] = []
  switch (kind) {
    case 'pick': head = [[5, 4], [6, 3], [7, 2], [8, 2], [9, 2], [10, 3], [11, 4], [12, 5], [12, 6], [4, 5], [4, 6], [8, 3], [9, 3], [10, 4], [11, 5], [6, 4], [7, 3]]; break
    case 'axe': head = [[8, 2], [9, 2], [10, 2], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [8, 4], [9, 4], [10, 4], [11, 4], [9, 5], [10, 5], [7, 4]]; break
    case 'shovel': head = [[11, 2], [12, 2], [10, 3], [11, 3], [12, 3], [13, 3], [10, 4], [11, 4], [12, 4], [13, 4], [11, 5], [12, 5]]; break
    case 'sword': {
      head = []
      for (let i = 0; i < 9; i += 1) { head.push([5 + i, 10 - i]); head.push([6 + i, 10 - i]) }
      ctx.clearRect(0, 0, 16, 16)
      drawPixels(ctx, head, light)
      drawPixels(ctx, head.filter((_, i) => i % 2 === 0), dark)
      drawPixels(ctx, [[3, 12], [4, 11], [4, 12], [5, 12], [3, 13], [2, 14], [4, 10], [3, 11], [5, 11]], '#6b4a26')
      drawPixels(ctx, [[5, 9], [6, 10], [7, 11], [4, 10], [5, 10], [6, 11], [7, 10], [5, 11]], '#4a3418')
      return
    }
  }
  drawPixels(ctx, head, light)
  drawPixels(ctx, head.filter(([x, y]) => (x + y) % 3 === 0), dark)
}

export function drawItemIcon(id: number, atlas: Atlas, size = 32): HTMLCanvasElement {
  const c = makeCanvas(size, size)
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  const def = BLOCKS[id]
  if (def && id !== B.AIR) {
    const tileXY = (t: number): [number, number] => [(t % ATLAS_COLS) * TILE, Math.floor(t / ATLAS_COLS) * TILE]
    const s = size / 32
    ctx.scale(s, s)
    const draw = (tile: number, m: [number, number, number, number, number, number], dim: number) => {
      const [sx, sy] = tileXY(tile)
      ctx.save()
      ctx.setTransform(m[0] * s, m[1] * s, m[2] * s, m[3] * s, m[4] * s, m[5] * s)
      ctx.drawImage(atlas.canvas, sx, sy, TILE, TILE, 0, 0, TILE, TILE)
      if (dim > 0) { ctx.fillStyle = `rgba(0,0,0,${dim})`; ctx.fillRect(0, 0, TILE, TILE) }
      ctx.restore()
    }
    if (def.liquid) { draw(def.tiles[0], [28 / 16, 0, 0, 28 / 16, 2, 2], 0); return c }
    const side = def.tiles[2]
    // top: A(16,2) B(30,9) D(2,9)
    draw(def.tiles[0], [14 / 16, 7 / 16, -14 / 16, 7 / 16, 16, 2], 0)
    // left face: D(2,9) -> C(16,16), down 14
    draw(side, [14 / 16, 7 / 16, 0, 14 / 16, 2, 9], 0.22)
    // right face: C(16,16) -> B(30,9), down 14
    draw(side, [14 / 16, -7 / 16, 0, 14 / 16, 16, 16], 0.38)
    return c
  }
  const k = size / 16
  ctx.scale(k, k)
  switch (id) {
    case I.STICK: for (let i = 0; i < 10; i += 1) drawPixels(ctx, [[3 + i, 12 - i]], i % 3 === 0 ? '#8a6636' : '#6b4a26'); break
    case I.COAL: drawPixels(ctx, [[5, 5], [6, 4], [7, 4], [8, 4], [9, 5], [10, 6], [10, 7], [11, 8], [10, 9], [9, 10], [8, 11], [7, 11], [6, 10], [5, 9], [4, 8], [4, 7], [4, 6]].concat([[6, 5], [7, 5], [8, 5], [9, 6], [6, 6], [7, 6], [8, 6], [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [5, 8], [6, 8], [7, 8], [8, 8], [9, 8], [6, 9], [7, 9], [8, 9]]) as [number, number][], '#2a2a2e'); drawPixels(ctx, [[7, 5], [6, 6], [8, 7]], '#55555c'); break
    case I.PORK: case I.BEEF: {
      const base = id === I.PORK ? '#e89a9a' : '#c4524a'
      const edge = id === I.PORK ? '#b86c6c' : '#8c2e2a'
      const pts: [number, number][] = []
      for (let y = 4; y < 12; y += 1) for (let x = 3; x < 13; x += 1) if ((x - 8) ** 2 / 25 + (y - 8) ** 2 / 16 < 1) pts.push([x, y])
      drawPixels(ctx, pts, base)
      drawPixels(ctx, pts.filter(([x, y]) => (x - 8) ** 2 / 25 + (y - 8) ** 2 / 16 > 0.6), edge)
      drawPixels(ctx, [[6, 7], [7, 7], [9, 9], [10, 9]], '#f5d0d0')
      break
    }
    case I.APPLE: {
      const pts: [number, number][] = []
      for (let y = 4; y < 13; y += 1) for (let x = 3; x < 13; x += 1) if ((x - 7.5) ** 2 + (y - 8.5) ** 2 < 17) pts.push([x, y])
      drawPixels(ctx, pts, '#d83030')
      drawPixels(ctx, [[5, 6], [5, 7], [6, 6]], '#ff8a8a')
      drawPixels(ctx, [[8, 3], [8, 4], [9, 2], [10, 2]], '#4a8a2a')
      break
    }
    case I.WOOD_PICK: drawToolIcon(ctx, 'pick', 'wood'); break
    case I.IRON_PICK: drawToolIcon(ctx, 'pick', 'stone'); break
    case I.DIAMOND_PICK: drawToolIcon(ctx, 'pick', 'stone'); drawPixels(ctx, [[6,3],[10,3],[7,4],[9,4]], '#57e7e4'); break
    case I.STONE_PICK: drawToolIcon(ctx, 'pick', 'stone'); break
    case I.WOOD_AXE: drawToolIcon(ctx, 'axe', 'wood'); break
    case I.STONE_AXE: drawToolIcon(ctx, 'axe', 'stone'); break
    case I.IRON_AXE: drawToolIcon(ctx, 'axe', 'iron'); break
    case I.DIAMOND_AXE: drawToolIcon(ctx, 'axe', 'diamond'); break
    case I.WOOD_SHOVEL: drawToolIcon(ctx, 'shovel', 'wood'); break
    case I.STONE_SHOVEL: drawToolIcon(ctx, 'shovel', 'stone'); break
    case I.IRON_SHOVEL: drawToolIcon(ctx, 'shovel', 'iron'); break
    case I.DIAMOND_SHOVEL: drawToolIcon(ctx, 'shovel', 'diamond'); break
    case I.WOOD_SWORD: drawToolIcon(ctx, 'sword', 'wood'); break
    case I.STONE_SWORD: drawToolIcon(ctx, 'sword', 'stone'); break
    case I.IRON: drawPixels(ctx, [[4,5],[5,4],[10,4],[11,5],[12,7],[11,11],[10,12],[5,12],[4,11],[3,8]], '#c6a17a'); drawPixels(ctx, [[6,5],[9,5],[6,10],[9,10]], '#e4d4bd'); break
    case I.GOLD: drawPixels(ctx, [[4,5],[5,4],[10,4],[11,5],[12,7],[11,11],[10,12],[5,12],[4,11],[3,8]], '#eabf32'); drawPixels(ctx, [[6,5],[9,5],[6,10],[9,10]], '#fff08a'); break
    case I.DIAMOND: drawPixels(ctx, [[4,6],[5,4],[10,4],[12,6],[11,10],[8,13],[5,10]], '#35c8cc'); drawPixels(ctx, [[6,5],[9,5],[10,7],[8,10],[6,8]], '#a4ffff'); break
    case I.PORTAL_KEY: drawPixels(ctx, [[7,2],[9,2],[6,4],[10,4],[5,6],[11,6],[6,9],[10,9],[7,12],[9,12],[8,14]], '#aa65e8'); drawPixels(ctx, [[7,5],[8,4],[9,7]], '#f0cbff'); break
    case I.BOAT: drawPixels(ctx,[[2,9],[3,10],[4,11],[5,12],[6,13],[7,13],[8,13],[9,13],[10,13],[11,12],[12,11],[13,10],[4,8],[5,8],[6,8],[7,8],[8,8],[9,8],[10,8],[11,8]],'#9a6338');drawPixels(ctx,[[7,3],[8,3],[7,4],[8,4],[7,5],[8,5],[7,6],[8,6],[7,7],[8,7]],'#e8d6a8');break
    case I.DRAGON_EGG: drawPixels(ctx,[[7,2],[8,2],[6,3],[9,3],[5,4],[10,4],[4,5],[11,5],[4,6],[11,6],[5,7],[10,7],[5,8],[10,8],[6,9],[9,9],[6,10],[9,10],[7,11],[8,11],[7,12],[8,12]],'#38284f');drawPixels(ctx,[[6,5],[9,8],[7,10]],'#a675dc');break
    case I.IRON_HELMET: case I.GOLD_HELMET: case I.DIAMOND_HELMET:
    case I.IRON_CHESTPLATE: case I.GOLD_CHESTPLATE: case I.DIAMOND_CHESTPLATE:
    case I.IRON_LEGGINGS: case I.GOLD_LEGGINGS: case I.DIAMOND_LEGGINGS:
    case I.IRON_BOOTS: case I.GOLD_BOOTS: case I.DIAMOND_BOOTS: {
      const iron=[I.IRON_HELMET,I.IRON_CHESTPLATE,I.IRON_LEGGINGS,I.IRON_BOOTS].includes(id as never), gold=[I.GOLD_HELMET,I.GOLD_CHESTPLATE,I.GOLD_LEGGINGS,I.GOLD_BOOTS].includes(id as never)
      const col=iron?'#c7cbd0':gold?'#e8bd38':'#55d8d5'
      let pts:[number,number][]=[]
      if([I.IRON_HELMET,I.GOLD_HELMET,I.DIAMOND_HELMET].includes(id as never))pts=[[4,8],[4,6],[5,4],[6,3],[7,3],[8,3],[9,3],[10,4],[11,6],[11,8],[10,8],[10,6],[9,5],[7,5],[6,6],[6,8]]
      else if([I.IRON_CHESTPLATE,I.GOLD_CHESTPLATE,I.DIAMOND_CHESTPLATE].includes(id as never))pts=[[5,3],[6,4],[10,4],[11,3],[12,5],[11,9],[10,11],[6,11],[5,9],[4,5],[6,5],[7,5],[8,5],[9,5]]
      else if([I.IRON_LEGGINGS,I.GOLD_LEGGINGS,I.DIAMOND_LEGGINGS].includes(id as never))pts=[[5,3],[10,3],[5,4],[10,4],[6,5],[9,5],[6,6],[9,6],[6,7],[9,7],[6,8],[9,8],[5,9],[10,9],[5,10],[10,10],[4,11],[6,11],[9,11],[11,11]]
      else pts=[[4,8],[4,9],[5,9],[5,10],[6,10],[7,10],[8,10],[9,10],[10,10],[11,9],[11,8],[10,8],[10,9]]
      drawPixels(ctx,pts,col);break
    }
    default: ctx.fillStyle = '#f0f'; ctx.fillRect(4, 4, 8, 8)
  }
  return c
}

// ------------------------------------------------------------ HUD icons

const HEART = [
  '.XX...XX.',
  'XXXX.XXXX',
  'XXXXXXXXX',
  'XXXXXXXXX',
  '.XXXXXXX.',
  '..XXXXX..',
  '...XXX...',
  '....X....',
]
const FOOD = [
  '....XXXX.',
  '...XXXXXX',
  '..XXXXXXX',
  '.XXXXXXX.',
  'XXXXXXX..',
  'XXXXX....',
  '.XX.X....',
  'X...XX...',
]
const BUBBLE = [
  '..XXXX..',
  '.X....X.',
  'X..XX..X',
  'X.X....X',
  'X......X',
  'X......X',
  '.X....X.',
  '..XXXX..',
]

function iconFromRows(rows: string[], fill: string, line: string, hl: string): string {
  const w = rows[0].length, h = rows.length
  const c = makeCanvas(w + 2, h + 2)
  const ctx = c.getContext('2d')!
  const on = (x: number, y: number) => rows[y]?.[x] === 'X'
  ctx.fillStyle = line
  for (let y = -1; y <= h; y += 1) for (let x = -1; x <= w; x += 1) {
    if (!on(x, y) && (on(x + 1, y) || on(x - 1, y) || on(x, y + 1) || on(x, y - 1))) ctx.fillRect(x + 1, y + 1, 1, 1)
  }
  ctx.fillStyle = fill
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (on(x, y)) ctx.fillRect(x + 1, y + 1, 1, 1)
  ctx.fillStyle = hl
  ctx.fillRect(2, 2, 1, 1)
  ctx.fillRect(3, 1, 1, 1)
  return c.toDataURL()
}

export function buildHudIcons(): Record<string, string> {
  return {
    heart: iconFromRows(HEART, '#e02424', '#2b0505', '#ff9a9a'),
    heartHalf: (() => {
      const base = iconFromRows(HEART, '#3a2020', '#2b0505', '#3a2020')
      return base
    })(),
    food: iconFromRows(FOOD, '#c8803a', '#2b1805', '#f2c88a'),
    bubble: iconFromRows(BUBBLE, '#6fb5ff', '#0b2a55', '#ffffff'),
  }
}

export function darkTileDataUrl(atlas: Atlas, tile: number, scale = 4): string {
  const c = makeCanvas(TILE * scale, TILE * scale)
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(atlas.canvas, (tile % ATLAS_COLS) * TILE, Math.floor(tile / ATLAS_COLS) * TILE, TILE, TILE, 0, 0, TILE * scale, TILE * scale)
  return c.toDataURL()
}
