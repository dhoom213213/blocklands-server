// All sounds are synthesised with WebAudio - no audio files are used.
import type { BlockDef } from '../core/blocks'

type Mat = BlockDef['sound']

export class GameAudio {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private sfx!: GainNode
  private musicBus!: GainNode
  private noiseBuf!: AudioBuffer
  volume = 0.7
  musicOn = true
  private nextMusic = 20
  private nextAmbient = 4
  private clock = 0

  unlock(): void {
    if (this.ctx) { void this.ctx.resume(); return }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    this.ctx = new AC()
    this.master = this.ctx.createGain()
    this.master.gain.value = this.volume
    this.master.connect(this.ctx.destination)
    this.sfx = this.ctx.createGain()
    this.sfx.connect(this.master)
    this.musicBus = this.ctx.createGain()
    this.musicBus.gain.value = 0.35
    // simple feedback-delay "reverb" for music
    const delay = this.ctx.createDelay(1)
    delay.delayTime.value = 0.32
    const fb = this.ctx.createGain()
    fb.gain.value = 0.42
    const lp = this.ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 2200
    delay.connect(lp); lp.connect(fb); fb.connect(delay)
    this.musicBus.connect(this.master)
    this.musicBus.connect(delay)
    lp.connect(this.master)
    const len = this.ctx.sampleRate
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const d = this.noiseBuf.getChannelData(0)
    for (let i = 0; i < len; i += 1) d[i] = Math.random() * 2 - 1
  }

  setVolume(v: number): void { this.volume = v; if (this.master) this.master.gain.value = v }

  private noise(dur: number, freq: number, q: number, type: BiquadFilterType, gain: number, delay = 0, decayPow = 1): void {
    const c = this.ctx
    if (!c) return
    const src = c.createBufferSource()
    src.buffer = this.noiseBuf
    src.loop = true
    const f = c.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const g = c.createGain()
    const t = c.currentTime + delay
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur * decayPow)
    src.connect(f); f.connect(g); g.connect(this.sfx)
    src.start(t, Math.random() * 0.5)
    src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect() }
    src.stop(t + dur + 0.05)
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slideTo?: number, dest?: AudioNode): void {
    const c = this.ctx
    if (!c) return
    const o = c.createOscillator()
    o.type = type
    const t = c.currentTime + delay
    o.frequency.setValueAtTime(freq, t)
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(gain, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g); g.connect(dest ?? this.sfx)
    o.start(t)
    o.onended = () => { o.disconnect(); g.disconnect() }
    o.stop(t + dur + 0.05)
  }

  private matSound(m: Mat, strong: boolean, blockId?: string | number): void {
    const k = strong ? 1 : 0.6
    // Stable hash keeps a block's material character while making neighboring IDs distinct.
    const id = String(blockId ?? '')
    let hash = 2166136261
    for (let i = 0; i < id.length; i += 1) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619)
    const pitch = blockId === undefined ? 1 : 0.88 + ((hash >>> 0) % 251) / 1000
    const filter = blockId === undefined ? 1 : 0.86 + (((hash >>> 8) % 29) / 100)
    const n = (freq: number): number => freq * filter
    const toneFreq = (freq: number): number => freq * pitch
    switch (m) {
      case 'stone': this.noise(0.18, n(1800), 1.2, 'bandpass', 0.5 * k); this.tone(toneFreq(strong ? 150 : 200), 0.1, 'square', 0.12 * k, 0, toneFreq(70)); break
      case 'dirt': this.noise(0.16, n(500), 0.8, 'lowpass', 0.8 * k); break
      case 'wood': this.noise(0.14, n(900), 2, 'bandpass', 0.6 * k); this.tone(toneFreq(strong ? 180 : 230), 0.09, 'triangle', 0.35 * k, 0, toneFreq(90)); break
      case 'sand': this.noise(0.2, n(3500), 0.7, 'highpass', 0.35 * k); break
      case 'glass': this.tone(toneFreq(2400), 0.12, 'triangle', 0.18 * k); this.tone(toneFreq(3300), 0.1, 'sine', 0.12 * k, 0.02); this.noise(0.08, n(6000), 1, 'highpass', 0.3 * k); break
      case 'leaves': this.noise(0.16, n(2600), 0.6, 'bandpass', 0.3 * k); break
      case 'snow': this.noise(0.18, n(1400), 0.5, 'lowpass', 0.6 * k); break
    }
  }

  breakBlock(m: Mat, blockId?: string | number): void { this.matSound(m, true, blockId) }
  placeBlock(m: Mat): void { this.matSound(m, false) }
  hit(m: Mat, blockId?: string | number): void { this.matSound(m, false, blockId) }
  step(m: Mat): void { this.noise(0.07, m === 'stone' ? 1400 : m === 'sand' ? 3000 : 600, 1, m === 'sand' ? 'highpass' : 'lowpass', m === 'stone' ? 0.3 : 0.35) }
  splash(): void { this.noise(0.4, 1500, 0.6, 'bandpass', 0.55); this.noise(0.25, 600, 0.6, 'lowpass', 0.5) }
  hurt(): void { this.tone(260, 0.22, 'square', 0.3, 0, 110) }
  eat(): void { for (let i = 0; i < 4; i += 1) this.noise(0.07, 1100 + i * 80, 1.5, 'bandpass', 0.7, i * 0.12) }
  pop(): void { this.tone(500, 0.12, 'sine', 0.25, 0, 1000) }
  click(): void { this.tone(700, 0.05, 'square', 0.1, 0, 500) }
  craft(): void { this.tone(520, 0.1, 'triangle', 0.25); this.tone(780, 0.14, 'triangle', 0.25, 0.08) }
  door(open = true): void { this.noise(0.11, open ? 700 : 480, 1.4, 'bandpass', 0.3); this.tone(open ? 260 : 210, 0.12, 'triangle', 0.12, 0, open ? 390 : 160) }
  furnace(): void { this.noise(0.32, 850, 0.5, 'lowpass', 0.13); this.tone(110, 0.28, 'sine', 0.07, 0, 145) }
  boat(): void { this.noise(0.22, 950, 0.7, 'bandpass', 0.18); this.tone(320, 0.12, 'triangle', 0.1, 0, 180) }
  levelUp(): void { this.tone(660, 0.12, 'triangle', 0.22); this.tone(880, 0.2, 'triangle', 0.22, 0.1) }
  pigOink(): void { this.tone(240, 0.1, 'square', 0.18, 0, 330); this.tone(210, 0.12, 'square', 0.16, 0.12, 160) }
  cowMoo(): void { this.tone(130, 0.7, 'sawtooth', 0.14, 0, 95) }
  zombie(): void { this.tone(95, 0.8, 'sawtooth', 0.2, 0, 70); this.tone(101, 0.8, 'sawtooth', 0.12, 0, 66) }
  skeleton(): void { this.noise(0.1, 3000, 1.2, 'highpass', 0.13); this.tone(760, 0.16, 'triangle', 0.14, 0, 510); this.tone(1020, 0.12, 'sine', 0.07, 0.12, 690) }
  creeper(): void { this.noise(0.42, 1050, 0.8, 'bandpass', 0.19, 0, 0.75); this.tone(180, 0.32, 'sawtooth', 0.12, 0, 85) }
  dragon(): void { this.noise(0.9, 520, 0.65, 'lowpass', 0.2, 0, 0.8); this.tone(115, 0.8, 'sawtooth', 0.16, 0, 48); this.tone(230, 0.65, 'triangle', 0.08, 0.08, 75) }
  mobCall(kind: string): void {
    switch (kind.toLowerCase()) {
      case 'pig': this.pigOink(); break
      case 'cow': this.cowMoo(); break
      case 'zombie': this.zombie(); break
      case 'skeleton': this.skeleton(); break
      case 'creeper': this.creeper(); break
      case 'dragon': this.dragon(); break
      default: this.tone(260 + Math.random() * 100, 0.22, 'triangle', 0.12, 0, 180 + Math.random() * 80)
    }
  }
  death(): void { this.tone(330, 0.6, 'sawtooth', 0.3, 0, 60) }
  bird(): void {
    const b = 2000 + Math.random() * 1200
    for (let i = 0; i < 3; i += 1) this.tone(b, 0.08, 'sine', 0.12, i * 0.11, b * 1.3)
  }
  cricket(): void { for (let i = 0; i < 4; i += 1) this.tone(4300, 0.05, 'square', 0.025, i * 0.07) }
  cave(): void { this.tone(55 + Math.random() * 20, 2.2, 'sine', 0.25); this.noise(1.2, 220, 1, 'lowpass', 0.25) }

  /** Called every frame: schedules ambience + music. */
  ambient(dt: number, night: boolean, underground: boolean, raining = false): void {
    if (!this.ctx) return
    this.clock += dt
    if (this.clock > this.nextAmbient) {
      this.nextAmbient = this.clock + 4 + Math.random() * 9
      if (underground) { if (Math.random() < 0.5) this.cave() }
      else if (night) this.cricket()
      else if (!raining) this.bird()
    }
    if (this.musicOn && this.clock > this.nextMusic) {
      this.nextMusic = this.clock + 70 + Math.random() * 110
      this.playMusic()
    }
  }

  private playMusic(): void {
    const c = this.ctx
    if (!c) return
    const scale = [0, 2, 4, 7, 9, 12, 14, 16]
    const root = [196, 220, 174.6, 164.8][Math.floor(Math.random() * 4)]
    let t = 0
    const n = 10 + Math.floor(Math.random() * 6)
    let idx = 3
    for (let i = 0; i < n; i += 1) {
      idx = Math.max(0, Math.min(scale.length - 1, idx + Math.floor(Math.random() * 5) - 2))
      const f = root * Math.pow(2, scale[idx] / 12)
      this.tone(f, 2.6, 'sine', 0.22, t, undefined, this.musicBus)
      this.tone(f * 2, 1.6, 'triangle', 0.05, t, undefined, this.musicBus)
      t += 0.9 + Math.random() * 1.6
    }
  }
}
