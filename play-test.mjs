// Gameplay test: survival mining/crafting/placing, inventory UI, pause/save/continue.
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'
const url = process.env.URL ?? 'http://localhost:3000/'
const out = process.env.SHOTS_DIR ?? 'shots'
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await browser.newContext({ viewport: { width: 1100, height: 650 } })
const page = await ctx.newPage()
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))
const ev = fn => page.evaluate(fn)
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1 }

await page.goto(url)
await page.waitForSelector('.logo')
await page.click('text=ابدأ اللعب')
await page.click('text=إنشاء العالم')
await page.waitForSelector('#hud:not(.hidden)', { timeout: 90000 })
await page.waitForTimeout(2500)
ok(await ev(() => window.__game.mode === 'survival'), 'survival mode')

// Put the player on flat ground facing down at a dirt/grass block and mine it with the hand
const res = await ev(async () => {
  const g = window.__game
  const p = g.player
  g.world.setBlock(0, 60, 0, 0)
  // build a platform to stand on
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) { g.world.setBlock(x, 60, z, 2); for (let y = 61; y < 66; y++) g.world.setBlock(x, y, z, 0) }
  p.body.pos.set(0.5, 61.01, 0.5)
  p.body.vel.set(0, 0, 0)
  p.pitch = -1.5
  await new Promise(r => setTimeout(r, 600))
  const before = g.world.getBlock(0, 60, 0)
  g.input.attackHeld = true
  const t0 = performance.now()
  while (g.world.getBlock(0, 60, 0) === before && performance.now() - t0 < 8000) await new Promise(r => setTimeout(r, 100))
  g.input.attackHeld = false
  return { before, after: g.world.getBlock(0, 60, 0), ms: Math.round(performance.now() - t0), drops: g.drops.list.length }
})
console.log(res)
ok(res.after === 0, 'mined block by holding attack')
ok(res.drops >= 1, 'item dropped')
await page.waitForTimeout(1500)
const inv1 = await ev(() => window.__game.inv.slots.filter(Boolean).map(s => [s.id, s.n]))
console.log('inventory', JSON.stringify(inv1))

// give logs, craft planks through UI
await ev(() => { const g = window.__game; g.inv.slots[0] = { id: 6, n: 8 }; g.inv.onChange?.() })
await page.keyboard.press('KeyE')
await page.waitForSelector('.inv')
await page.screenshot({ path: `${out}/10-inventory.png` })
// click log slot (hotbar slot 0 last .grid), then craft slot 0
const slots = page.locator('.inv .slot')
const count = await slots.count()
console.log('slots', count)
await slots.nth(5 + 27).dispatchEvent('pointerdown', { button: 0 }) // after 4 craft + result: first hotbar slot index = 5+27
await slots.nth(0).dispatchEvent('pointerdown', { button: 0 })
await page.waitForTimeout(200)
await page.screenshot({ path: `${out}/11-craft.png` })
const resultFilled = await page.locator('.inv .craft .slot').nth(4).locator('img').count()
ok(resultFilled === 1, 'crafting result appears for log')
await slots.nth(4).dispatchEvent('pointerdown', { button: 0 })
await page.waitForTimeout(100)
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
const inv2 = await ev(() => window.__game.inv.slots.filter(Boolean).map(s => [s.id, s.n]))
console.log('inventory after craft', JSON.stringify(inv2))
ok(inv2.some(([id, n]) => id === 8 && n === 4), 'planks crafted (4)')
ok(await ev(() => window.__game.state === 'playing'), 'back in playing state')

// place a block
const placed = await ev(async () => {
  const g = window.__game
  g.inv.slots[8] = { id: 2, n: 5 }; g.inv.selected = 8; g.inv.onChange?.()
  g.player.pitch = -1.5
  await new Promise(r => setTimeout(r, 300))
  g.input.placeQueued = true
  g.doPlace?.()
  await new Promise(r => setTimeout(r, 300))
  return g.inv.slots[8]?.n
})
console.log('placed, remaining', placed)

// pause & save & reload & continue
await page.keyboard.press('Escape')
await page.waitForTimeout(500)
await page.screenshot({ path: `${out}/12-pause.png` })
ok(await ev(() => window.__game.state === 'paused'), 'paused')
await page.click('text=حفظ العالم الآن')
await page.waitForTimeout(800)
await page.reload()
await page.waitForSelector('text=متابعة العالم المحفوظ', { timeout: 30000 })
await page.screenshot({ path: `${out}/13-title-with-save.png` })
await page.click('text=متابعة العالم المحفوظ')
await page.waitForSelector('#hud:not(.hidden)', { timeout: 90000 })
const after = await ev(() => { const g = window.__game; return { mode: g.mode, edit: g.world.getBlock(0, 60, 0), n: g.inv.slots.filter(Boolean).length, y: g.player.pos.y } })
console.log('restored', after)
ok(after.mode === 'survival' && after.n >= 1, 'save restored')

// night + mobs
await ev(() => { const g = window.__game; g.sky.time = 0.78 })
await page.waitForTimeout(9000)
const mobs = await ev(() => { const g = window.__game; return g.mobs.mobs.map(m => m.kind) })
console.log('mobs', JSON.stringify(mobs))
await page.screenshot({ path: `${out}/14-night.png` })
console.log('errors:', errors.length ? errors : 'none')
await browser.close()
if (errors.length) process.exitCode = 1
