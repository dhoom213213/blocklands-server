import { WorldGen } from './worldgen'

let gen: WorldGen | null = null
let genSeed = NaN
let genDimension = 'overworld'

self.onmessage = (e: MessageEvent<{ seed: number; cx: number; cz: number; dimension?: 'overworld' | 'end' }>) => {
  const { seed, cx, cz, dimension = 'overworld' } = e.data
  if (!gen || genSeed !== seed || genDimension !== dimension) { gen = new WorldGen(seed, dimension); genSeed = seed; genDimension = dimension }
  const r = gen.generate(cx, cz)
  ;(self as unknown as Worker).postMessage({ seed, cx, cz, dimension, data: r.data, top: r.top }, [r.data.buffer, r.top.buffer])
}
