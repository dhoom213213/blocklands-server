// Smoke test: boots the game in headless Chromium, starts a creative world and checks for errors.
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const url = process.env.URL ?? 'http://localhost:3000/'
const out = process.env.SHOTS_DIR ?? 'shots'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/usr/bin/chromium',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
})
const ctx = await browser.newContext({ viewport: { width: 1100, height: 650 } })
const page = await ctx.newPage()
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); if (process.env.VERBOSE) console.log('[console]', m.text()) })
page.on('pageerror', e => errors.push(String(e)))

await page.goto(url)
await page.waitForSelector('.logo', { timeout: 30000 })
await page.waitForTimeout(6000)
await page.screenshot({ path: `${out}/01-title.png` })

await page.click('text=ابدأ اللعب')
await page.waitForSelector('text=إنشاء العالم')
await page.click('.seg .btn:has-text("إبداعي")')
await page.screenshot({ path: `${out}/02-newworld.png` })
await page.fill('input[placeholder^="اتركها"]', '12345')
await page.click('text=إنشاء العالم')
await page.waitForSelector('#hud:not(.hidden)', { timeout: 90000 })
await page.waitForTimeout(3000)
await page.screenshot({ path: `${out}/03-play.png` })

const info = await page.evaluate(() => {
  const g = window.__game
  return { state: g.state, pos: g.player.pos.toArray(), chunks: g.world.chunks.size, fps: g.fps }
})
console.log('info', JSON.stringify(info))

await page.evaluate(() => { const g = window.__game; g.player.pitch = -0.35; g.player.yaw = 0.8 })
await page.waitForTimeout(800)
await page.screenshot({ path: `${out}/04-look.png` })

console.log('errors:', errors.length ? errors : 'none')
await browser.close()
process.exit(errors.length ? 1 : 0)
