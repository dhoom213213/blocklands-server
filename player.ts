import * as THREE from 'three'
import { B, BLOCKS } from '../core/blocks'
import { Body } from './physics'
import { CONFIG } from './config'
import type { Input } from './input'
import type { World } from './world'

export type Mode = 'survival' | 'creative'

export interface PlayerEvents {
  hurt?: (amount: number) => void
  die?: () => void
  step?: (mat: string) => void
  splash?: () => void
  land?: () => void
}

export class Player {
  body = new Body(0.6, 1.8)
  yaw = 0
  pitch = 0
  mode: Mode = 'survival'
  flying = false
  sprinting = false
  sneaking = false
  inWater = false
  headInWater = false
  health = 20
  hunger = 20
  air = 10
  armorProtection = 0
  boatRiding = false
  dead = false
  eye = 1.62
  fov = 75
  private eyeNow = 1.62
  private invuln = 0
  private exhaustion = 0
  private regen = 0
  private starve = 0
  private drown = 0
  private fallPeak = -Infinity
  private lastSpace = -10
  private lastW = -10
  private prevJump = false
  private prevW = false
  private stepDist = 0
  private jumpCd = 0
  private wasWater = false
  spawn = new THREE.Vector3(0.5, 70, 0.5)
  ev: PlayerEvents = {}
  walkBob = 0
  hurtFlash = 0

  get pos(): THREE.Vector3 { return this.body.pos }
  get eyePos(): THREE.Vector3 { return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeNow, this.pos.z) }

  get dir(): THREE.Vector3 {
    const cp = Math.cos(this.pitch)
    return new THREE.Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp)
  }

  respawn(): void {
    this.body.pos.copy(this.spawn)
    this.body.vel.set(0, 0, 0)
    this.health = 20
    this.hunger = 20
    this.air = 10
    this.dead = false
    this.flying = false
    this.fallPeak = -Infinity
    this.invuln = 2
  }

  damage(amount: number, kb?: THREE.Vector3): void {
    if (this.mode === 'creative' || this.dead || this.invuln > 0 || amount <= 0) return
    const reduced = amount * Math.max(0.2, 1 - Math.min(20, this.armorProtection) * 0.04)
    this.health = Math.max(0, this.health - reduced)
    this.invuln = 0.5
    this.hurtFlash = 1
    if (kb) { this.body.vel.x += kb.x; this.body.vel.z += kb.z; this.body.vel.y = Math.max(this.body.vel.y, 4.5) }
    this.ev.hurt?.(reduced)
    if (this.health <= 0) { this.dead = true; this.ev.die?.() }
  }

  heal(n: number): void { this.health = Math.min(20, this.health + n) }
  feed(n: number): void { this.hunger = Math.min(20, this.hunger + n) }

  update(dt: number, input: Input, world: World, canMove: boolean): void {
    const b = this.body
    const now = performance.now() / 1000
    this.invuln = Math.max(0, this.invuln - dt)
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.2)
    this.jumpCd = Math.max(0, this.jumpCd - dt)
    const creative = this.mode === 'creative'
    const wx = Math.floor(b.pos.x), wz = Math.floor(b.pos.z)
    this.inWater = world.getBlock(wx, Math.floor(b.pos.y + 0.4), wz) === B.WATER
    this.headInWater = world.getBlock(wx, Math.floor(b.pos.y + this.eye), wz) === B.WATER
    if (this.inWater && !this.wasWater && b.vel.y < -3) this.ev.splash?.()
    this.wasWater = this.inWater

    if (this.dead || !canMove) {
      b.vel.x *= 0.8; b.vel.z *= 0.8
      if (!this.flying) b.vel.y -= CONFIG.player.gravity * dt
      b.step(world, dt)
      return
    }

    const fwd = input.forward, str = input.strafe
    this.sneaking = input.sneak && !this.flying
    // sprint: Ctrl, or double-tap W
    const wDown = input.down('KeyW') || input.touchMoveY > 0.85
    if (wDown && !this.prevW) { if (now - this.lastW < 0.3) this.sprinting = true; this.lastW = now }
    this.prevW = wDown
    if (input.sprintKey && fwd > 0) this.sprinting = true
    if (fwd <= 0 || this.sneaking || (!creative && this.hunger <= 6)) this.sprinting = false
    if (b.hitWall && !this.flying) this.sprinting = false

    // creative flight toggle (double-tap space)
    const jumpDown = input.jump
    if (creative && jumpDown && !this.prevJump) {
      if (now - this.lastSpace < 0.3) { this.flying = !this.flying; b.vel.y = 0 }
      this.lastSpace = now
    }
    this.prevJump = jumpDown
    if (!creative) this.flying = false

    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw)
    // forward = (-sin, -cos)
    let mx = -sinY * fwd + cosY * str
    let mz = -cosY * fwd - sinY * str
    const len = Math.hypot(mx, mz)
    if (len > 1) { mx /= len; mz /= len }

    const C = CONFIG.player
    let speed = this.boatRiding ? (this.sprinting ? 7.2 : 5.6) : this.flying ? (this.sprinting ? C.flySpeed * 1.8 : C.flySpeed) : this.sprinting ? C.sprintSpeed : C.walkSpeed
    if (this.sneaking) speed = 1.7
    if (this.inWater && !this.flying) speed = 2.4

    const tvx = mx * speed, tvz = mz * speed
    const k = this.flying ? 10 : b.onGround ? 18 : this.inWater ? 6 : 3.5
    const a = 1 - Math.exp(-k * dt)
    b.vel.x += (tvx - b.vel.x) * a
    b.vel.z += (tvz - b.vel.z) * a

    if (this.flying) {
      const ty = (jumpDown ? 1 : 0) - (input.sneak ? 1 : 0) + (input.isTouch ? fwd * Math.sin(this.pitch) * 1.3 : 0)
      b.vel.y += (ty * (this.sprinting ? 14 : 8) - b.vel.y) * (1 - Math.exp(-10 * dt))
    } else if (this.boatRiding) {
      if (jumpDown || input.sneak) { this.boatRiding = false; b.vel.y = 2.5 }
      else b.vel.y = 0
    } else if (this.inWater) {
      b.vel.y -= 9 * dt
      b.vel.y *= Math.exp(-2.2 * dt)
      if (jumpDown) b.vel.y = Math.min(4.8, Math.max(2.6, b.vel.y + 22 * dt))
      if (jumpDown && !world.liquidAt(b.pos.x, b.pos.y + 1.0, b.pos.z) && b.hitWall) b.vel.y = 6.5
      b.vel.y = Math.max(-5, Math.min(b.vel.y, 4.2))
    } else {
      b.vel.y -= C.gravity * dt
      if (b.vel.y < -55) b.vel.y = -55
      if (jumpDown && b.onGround && this.jumpCd <= 0) {
        b.vel.y = C.jumpSpeed
        this.jumpCd = 0.12
        if (this.sprinting) { b.vel.x += mx * 2; b.vel.z += mz * 2 }
        this.exhaustion += 0.05
      }
    }

    const wasGround = b.onGround
    const vyBefore = b.vel.y
    b.step(world, dt, this.sneaking && !creative ? true : this.sneaking, this.inWater && !this.flying && jumpDown)
    if (b.pos.y < -20) { this.damage(100); }

    // fall tracking
    if (!b.onGround && !this.inWater && !this.flying) {
      if (b.pos.y > this.fallPeak) this.fallPeak = b.pos.y
    }
    if (this.inWater || this.flying) this.fallPeak = b.pos.y
    if (b.onGround && !wasGround) {
      const fall = this.fallPeak - b.pos.y
      if (fall > 3 && !this.inWater && vyBefore < -2) {
        if (!creative) this.damage(Math.floor(fall - 3))
        this.ev.land?.()
      }
      this.fallPeak = b.pos.y
    }
    if (b.onGround) this.fallPeak = b.pos.y

    // footsteps + bob
    const hv = Math.hypot(b.vel.x, b.vel.z)
    if (b.onGround && hv > 0.5 && !this.flying) {
      this.stepDist += hv * dt
      this.walkBob += hv * dt * 2.1
      if (this.stepDist > (this.sprinting ? 1.9 : 1.5)) {
        this.stepDist = 0
        const under = world.getBlock(Math.floor(b.pos.x), Math.floor(b.pos.y - 0.2), Math.floor(b.pos.z))
        if (under > 0) this.ev.step?.(BLOCKS[under].sound)
      }
    } else this.walkBob *= 0.9

    // eye height smoothing (sneak)
    const targetEye = this.sneaking ? 1.32 : 1.62
    this.eyeNow += (targetEye - this.eyeNow) * (1 - Math.exp(-14 * dt))

    if (!creative) this.survivalTick(dt, hv)
    else { this.air = 10 }
  }

  private survivalTick(dt: number, hv: number): void {
    this.exhaustion += dt * 0.012 + (this.sprinting ? hv * dt * 0.006 : 0)
    if (this.exhaustion >= 1) { this.exhaustion = 0; this.hunger = Math.max(0, this.hunger - 1) }
    if (this.hunger >= 18 && this.health < 20) {
      this.regen += dt
      if (this.regen >= 3) { this.regen = 0; this.heal(1); this.exhaustion += 0.15 }
    } else this.regen = 0
    if (this.hunger <= 0) {
      this.starve += dt
      if (this.starve >= 4) { this.starve = 0; if (this.health > 1) this.damage(1) }
    } else this.starve = 0
    if (this.headInWater) {
      this.air = Math.max(0, this.air - dt)
      if (this.air <= 0) {
        this.drown += dt
        if (this.drown >= 1) { this.drown = 0; this.damage(2) }
      }
    } else { this.air = Math.min(10, this.air + dt * 5); this.drown = 0 }
  }
}
