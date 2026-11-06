import * as THREE from 'three'
import { mulberry32, Noise } from '../core/noise'

import { CONFIG } from './config'

export interface SkyState {
  day: number // 0..1 how bright
  sunY: number
  fog: THREE.Color
  tint: THREE.Color
  sunDir: THREE.Vector3
}

const lerpC = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, t)
const C = {
  dayHor: new THREE.Color(0.66, 0.8, 1.0), nightHor: new THREE.Color(0.03, 0.04, 0.09), twiHor: new THREE.Color(1.0, 0.58, 0.34),
  dayZen: new THREE.Color(0.25, 0.5, 0.95), nightZen: new THREE.Color(0.008, 0.012, 0.04), twiZen: new THREE.Color(0.35, 0.4, 0.75),
  dayTint: new THREE.Color(1, 1, 1), nightTint: new THREE.Color(0.55, 0.65, 1.0),
}

function pixelTexture(size: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = size
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.magFilter = THREE.NearestFilter
  t.minFilter = THREE.NearestFilter
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export class Sky {
  readonly group = new THREE.Group()
  private dome: THREE.Mesh
  private domeMat: THREE.ShaderMaterial
  private sun: THREE.Mesh
  private moon: THREE.Mesh
  private stars: THREE.Points
  private starMat: THREE.PointsMaterial
  private clouds: THREE.Mesh
  private cloudTex: THREE.CanvasTexture
  private cloudMat: THREE.MeshBasicMaterial
  time = 0.04
  private cloudScroll = 0

  constructor(scene: THREE.Scene) {
    this.domeMat = new THREE.ShaderMaterial({
      uniforms: { uHor: { value: new THREE.Color() }, uZen: { value: new THREE.Color() } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uHor;
uniform vec3 uZen;
varying vec3 vDir;
void main() {
  float h = clamp(vDir.y, 0.0, 1.0);
  vec3 col = mix(uHor, uZen, pow(h, 0.55));
  if (vDir.y < 0.0) col = uHor * (1.0 + vDir.y * 0.4);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`,
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    })
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(450, 24, 16), this.domeMat)
    this.dome.renderOrder = -100
    this.dome.frustumCulled = false
    this.group.add(this.dome)

    const sunTex = pixelTexture(16, ctx => {
      ctx.fillStyle = '#fff6b0'; ctx.fillRect(0, 0, 16, 16)
      ctx.fillStyle = '#ffd94a'; ctx.fillRect(1, 1, 14, 14)
      ctx.fillStyle = '#fffbe0'; ctx.fillRect(4, 4, 8, 8)
    })
    const moonTex = pixelTexture(16, ctx => {
      ctx.fillStyle = '#dfe6f0'; ctx.fillRect(0, 0, 16, 16)
      ctx.fillStyle = '#b9c4d6'
      for (const [x, y, w, h] of [[3, 3, 3, 3], [9, 2, 2, 2], [8, 8, 4, 3], [2, 10, 3, 2]]) ctx.fillRect(x, y, w, h)
    })
    const quad = new THREE.PlaneGeometry(1, 1)
    const mkBody = (tex: THREE.Texture, size: number) => {
      const m = new THREE.Mesh(quad, new THREE.MeshBasicMaterial({ map: tex, fog: false, transparent: true, depthWrite: false }))
      m.scale.set(size, size, 1)
      m.renderOrder = -90
      m.frustumCulled = false
      this.group.add(m)
      return m
    }
    this.sun = mkBody(sunTex, 60)
    this.moon = mkBody(moonTex, 44)

    const rnd = mulberry32(99)
    const pos = new Float32Array(700 * 3)
    for (let i = 0; i < 700; i += 1) {
      const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u)
      pos[i * 3] = Math.cos(a) * r * 400
      pos[i * 3 + 1] = u * 400
      pos[i * 3 + 2] = Math.sin(a) * r * 400
    }
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false })
    this.stars = new THREE.Points(sg, this.starMat)
    this.stars.renderOrder = -95
    this.stars.frustumCulled = false
    this.group.add(this.stars)

    const noise = new Noise(5150)
    this.cloudTex = pixelTexture(64, ctx => {
      const img = ctx.createImageData(64, 64)
      for (let y = 0; y < 64; y += 1) for (let x = 0; x < 64; x += 1) {
        // tileable: sample noise on a torus
        const a = (x / 64) * Math.PI * 2, b = (y / 64) * Math.PI * 2
        const n = noise.fbm2(Math.cos(a) * 1.6 + 5, Math.sin(a) * 1.6, 3) + noise.fbm2(Math.cos(b) * 1.6 - 9, Math.sin(b) * 1.6, 3) * 0.6 + noise.perlin3(Math.cos(a) * 2.2, Math.sin(b) * 2.2, Math.sin(a + b)) * 0.7
        const i = (y * 64 + x) * 4
        const on = n > 0.2
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
        img.data[i + 3] = on ? 215 : 0
      }
      ctx.putImageData(img, 0, 0)
    })
    this.cloudTex.wrapS = this.cloudTex.wrapT = THREE.RepeatWrapping
    this.cloudTex.repeat.set(5, 5)
    this.cloudMat = new THREE.MeshBasicMaterial({ map: this.cloudTex, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide })
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(3840, 3840), this.cloudMat)
    this.clouds.rotation.x = -Math.PI / 2
    this.clouds.renderOrder = 2
    this.clouds.frustumCulled = false
    scene.add(this.group)
    scene.add(this.clouds)
  }

  update(dt: number, cam: THREE.Camera, underwater: boolean, running: boolean): SkyState {
    if (running) {
      this.time = (this.time + dt / CONFIG.world.dayLength) % 1
      this.cloudScroll += dt * 0.0016
    }
    const ang = this.time * Math.PI * 2
    const sunDir = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0.25).normalize()
    const sunY = sunDir.y
    const d = THREE.MathUtils.smoothstep((sunY + 0.12) / 0.5, 0, 1)
    const tw = Math.exp(-Math.pow(sunY / 0.2, 2)) * 0.9
    let hor = lerpC(C.nightHor, C.dayHor, d)
    let zen = lerpC(C.nightZen, C.dayZen, d)
    hor = lerpC(hor, C.twiHor, tw)
    zen = lerpC(zen, C.twiZen, tw * 0.6)
    this.domeMat.uniforms.uHor.value.copy(hor)
    this.domeMat.uniforms.uZen.value.copy(zen)
    this.group.position.copy(cam.position)
    this.sun.position.copy(sunDir).multiplyScalar(340)
    this.moon.position.copy(sunDir).multiplyScalar(-340)
    this.sun.lookAt(cam.position)
    this.moon.lookAt(cam.position)
    this.starMat.opacity = THREE.MathUtils.clamp(1 - d * 1.6, 0, 1)
    this.stars.rotation.z = ang
    this.clouds.position.set(cam.position.x, 108, cam.position.z)
    const size = 3840
    this.cloudTex.offset.set(cam.position.x / size * 5 + this.cloudScroll, -cam.position.z / size * 5)
    const b = 0.35 + d * 0.65
    this.cloudMat.color.setRGB(b * (1 - tw * 0.1), b * (1 - tw * 0.3), b * (1 - tw * 0.45))
    this.cloudMat.opacity = 0.9
    const fog = underwater ? new THREE.Color(0.1, 0.25, 0.5).multiplyScalar(0.35 + d * 0.65) : hor.clone()
    return { day: 0.22 + 0.78 * d, sunY, fog, tint: lerpC(C.nightTint, C.dayTint, d), sunDir }
  }

  get isNight(): boolean { return Math.sin(this.time * Math.PI * 2) < -0.12 }
}
