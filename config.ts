export interface GameConfig {
  player: { walkSpeed: number; sprintSpeed: number; jumpSpeed: number; gravity: number; flySpeed: number; reach: number }
  camera: { fov: number }
  world: { dayLength: number }
  mobs: { maxHostile: number; maxPassive: number }
}

export const DEFAULT_CONFIG: GameConfig = Object.freeze({
  player: Object.freeze({ walkSpeed: 4.3, sprintSpeed: 5.6, jumpSpeed: 8.4, gravity: 28, flySpeed: 11, reach: 5 }),
  camera: Object.freeze({ fov: 75 }),
  world: Object.freeze({ dayLength: 720 }),
  mobs: Object.freeze({ maxHostile: 7, maxPassive: 9 }),
}) as GameConfig

export const CONFIG: GameConfig = {
  player: { ...DEFAULT_CONFIG.player },
  camera: { ...DEFAULT_CONFIG.camera },
  world: { ...DEFAULT_CONFIG.world },
  mobs: { ...DEFAULT_CONFIG.mobs },
}
