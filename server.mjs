// Blocklands multiplayer server: rooms, shared block edits, player poses and chat.
// The server owns rooms, the world seed, block history and validation. Clients own their own movement.
import http from 'node:http'
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs'
import { WebSocketServer } from 'ws'

export const PROTOCOL = 'blocklands-3'
const PORT = Number(process.env.PORT ?? 8787)
const HOST = process.env.HOST ?? '0.0.0.0'
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS ?? 16)
const MAX_ROOMS = Number(process.env.MAX_ROOMS ?? 60)
const MAX_EDITS = Number(process.env.MAX_EDITS ?? 400000)
const DATA_FILE = process.env.DATA_FILE ?? ''
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean)
const DAY_LENGTH = 720
const WORLD_H = 96
const BLOCK_IDS = 40

/** @type {Map<string, {name:string, seed:number, edits:Map<string,number>, players:Map<string, any>, created:number, touched:number}>} */
const rooms = new Map()
let dirty = false

function loadRooms() {
  if (!DATA_FILE || !existsSync(DATA_FILE)) return
  try {
    const raw = JSON.parse(readFileSync(DATA_FILE, 'utf8'))
    for (const r of raw.rooms ?? []) {
      rooms.set(r.name, { name: r.name, seed: r.seed, edits: new Map(r.edits), players: new Map(), created: r.created, touched: Date.now() })
    }
    console.log(`loaded ${rooms.size} rooms`)
  } catch (e) { console.error('could not load rooms', e) }
}

function saveRooms() {
  if (!DATA_FILE || !dirty) return
  dirty = false
  try {
    const out = { rooms: [...rooms.values()].filter(r => r.edits.size > 0).map(r => ({ name: r.name, seed: r.seed, created: r.created, edits: [...r.edits] })) }
    writeFileSync(DATA_FILE + '.tmp', JSON.stringify(out))
    renameSync(DATA_FILE + '.tmp', DATA_FILE)
  } catch (e) { console.error('could not save rooms', e) }
}

const cleanName = s => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16)
const cleanRoom = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24)

function getRoom(name) {
  let r = rooms.get(name)
  if (r) return r
  if (rooms.size >= MAX_ROOMS) {
    // drop the oldest empty room
    const empty = [...rooms.values()].filter(x => x.players.size === 0).sort((a, b) => a.touched - b.touched)[0]
    if (!empty) return null
    rooms.delete(empty.name)
  }
  r = { name, seed: (randomBytes(4).readUInt32BE() % 2000000000) + 1, edits: new Map(), players: new Map(), created: Date.now(), touched: Date.now() }
  rooms.set(name, r)
  return r
}

const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)) }
function broadcast(room, msg, except) {
  const s = JSON.stringify(msg)
  for (const p of room.players.values()) if (p.ws !== except && p.ws.readyState === 1) p.ws.send(s)
}
const finite = (...v) => v.every(n => typeof n === 'number' && Number.isFinite(n))

const server = http.createServer((req, res) => {
  if (req.url === '/rooms' && req.method === 'GET') {
    const roomList = [...rooms.values()].filter(r => r.players.size > 0).sort((a,b) => b.touched-a.touched).slice(0,60).map(r => ({ code:r.name, players:r.players.size, capacity:MAX_PLAYERS }))
    res.writeHead(200, { 'content-type':'application/json', 'access-control-allow-origin':'*', 'cache-control':'no-store' })
    res.end(JSON.stringify({ protocol:PROTOCOL, rooms:roomList }))
    return
  }
  if (req.url === '/health' || req.url === '/') {
    let players = 0
    for (const r of rooms.values()) players += r.players.size
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' })
    res.end(JSON.stringify({ ok: true, protocol: PROTOCOL, rooms: rooms.size, players }))
    return
  }
  res.writeHead(404); res.end()
})

const wss = new WebSocketServer({
  server, path: '/ws', maxPayload: 4096,
  verifyClient: ({ origin }, cb) => {
    if (ALLOWED_ORIGINS.length === 0 || (origin && ALLOWED_ORIGINS.includes(origin))) cb(true)
    else cb(false, 403, 'origin not allowed')
  },
})

wss.on('connection', ws => {
  /** @type {any} */
  let me = null
  let room = null
  let alive = true
  let blockTokens = 80
  let lastRefill = Date.now()
  let lastChat = 0
  let poseCount = 0
  let poseWindow = Date.now()
  ws.on('pong', () => { alive = true })
  ws._alive = () => { const a = alive; alive = false; return a }

  ws.on('message', raw => {
    let msg
    try { msg = JSON.parse(raw.toString()) } catch { return }
    if (!msg || typeof msg.t !== 'string') return
    const now = Date.now()
    if (msg.t === 'join') {
      if (me) return
      if (msg.v !== PROTOCOL) { send(ws, { t: 'error', reason: 'version' }); ws.close(); return }
      const rn = cleanRoom(msg.room) || 'main'
      room = getRoom(rn)
      if (!room) { send(ws, { t: 'error', reason: 'full' }); ws.close(); return }
      if (room.players.size >= MAX_PLAYERS) { send(ws, { t: 'error', reason: 'room_full' }); ws.close(); return }
      const id = randomBytes(6).toString('hex')
      let name = cleanName(msg.name) || 'لاعب'
      for (const p of room.players.values()) if (p.name === name) name = `${name}${Math.floor(Math.random() * 90 + 10)}`
      me = { id, name, ws, x: 0, y: 80, z: 0, yaw: 0, pitch: 0, flags: 0, seq: 0 }
      room.players.set(id, me)
      room.touched = now
      const time = (0.04 + (now - room.created) / 1000 / DAY_LENGTH) % 1
      send(ws, {
        t: 'welcome', id, name, seed: room.seed, room: room.name, time, protocol: PROTOCOL,
        players: [...room.players.values()].filter(p => p !== me).map(p => ({ id: p.id, name: p.name, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, f: p.flags })),
        editCount: room.edits.size,
      })
      // stream block history in chunks of 1500 edits
      const flat = []
      for (const [k, v] of room.edits) { const [x, y, z] = k.split(',').map(Number); flat.push(x, y, z, v) }
      for (let i = 0; i <= flat.length; i += 6000) {
        send(ws, { t: 'edits', d: flat.slice(i, i + 6000), last: i + 6000 >= flat.length })
        if (flat.length === 0) break
      }
      broadcast(room, { t: 'join', id, name }, ws)
      return
    }
    if (!me || !room) return
    switch (msg.t) {
      case 'pose': {
        if (now - poseWindow > 1000) { poseWindow = now; poseCount = 0 }
        if (++poseCount > 60) return
        const { x, y, z, yaw, pitch } = msg
        if (!finite(x, y, z, yaw, pitch) || Math.abs(x) > 3e7 || Math.abs(z) > 3e7 || y < -64 || y > 400) return
        me.x = x; me.y = y; me.z = z; me.yaw = yaw; me.pitch = pitch; me.flags = msg.f | 0
        broadcast(room, { t: 'pose', id: me.id, x, y, z, yaw, pitch, f: me.flags, lat: Math.min(1000, msg.lat | 0) }, ws)
        break
      }
      case 'block': {
        blockTokens = Math.min(80, blockTokens + ((now - lastRefill) / 1000) * 40)
        lastRefill = now
        if (blockTokens < 1) return
        blockTokens -= 1
        const { x, y, z, id } = msg
        if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z) || !Number.isInteger(id)) return
        if (Math.abs(x) > 3e7 || Math.abs(z) > 3e7 || y < 0 || y >= WORLD_H || id < 0 || id >= BLOCK_IDS || id === 13 || id === 9) return
        if (room.edits.size >= MAX_EDITS && !room.edits.has(`${x},${y},${z}`)) return
        room.edits.set(`${x},${y},${z}`, id)
        dirty = true
        room.touched = now
        broadcast(room, { t: 'block', x, y, z, id, by: me.id }, ws)
        break
      }
      case 'chat': {
        if (now - lastChat < 400) return
        lastChat = now
        const text = String(msg.text ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120)
        if (!text) return
        const out = { t: 'chat', id: me.id, name: me.name, text }
        broadcast(room, out)
        break
      }
      case 'ping':
        send(ws, { t: 'pong', ts: msg.ts })
        break
      default:
    }
  })

  ws.on('close', () => {
    if (me && room) {
      room.players.delete(me.id)
      room.touched = Date.now()
      broadcast(room, { t: 'leave', id: me.id, name: me.name })
    }
  })
  ws.on('error', () => {})
})

const hb = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws._alive()) { ws.terminate(); continue }
    ws.ping()
  }
}, 25000)
const saver = setInterval(saveRooms, 30000)

loadRooms()
server.listen(PORT, HOST, () => console.log(`blocklands server on ${HOST}:${PORT} (${PROTOCOL})${ALLOWED_ORIGINS.length ? '' : ' - WARNING: ALLOWED_ORIGINS not set, any origin may connect'}`))

function shutdown() {
  clearInterval(hb); clearInterval(saver)
  dirty = true
  saveRooms()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
