# Multiplayer netcode

Read this with [Multiplayer game services](game-multiplayer.md) before writing or changing online play in any
engine, 2D or 3D, for a new game or an offline game gaining multiplayer. That page owns the cloud computer,
service, WSS and publication workflow; this page owns how clients and the server share the game; the matching
template README owns its protocol and tests. Apply these rules to the game's own objects; do not copy a
template's gameplay into a different game.

| Template | Engine | Model | Files that implement it |
| --- | --- | --- | --- |
| Three.js Multiplayer (Ring Out, 2–4 players) | Three.js | Client-owned players; relay and referee server | `src/game/localBall.ts` (`OwnBall`), `src/game/balls.ts` (`RemoteTrack`), `src/main.ts`, `server/authoritative_server.mjs` |
| Generic Multiplayer (Pong, 2 players) | Godot | Server-simulated shared ball and paddles; anticipated own paddle; ball and opponent drawn at the present | `scripts/game/local_paddle.gd`, `scripts/game/remote_court.gd`, `scripts/game/pong_board.gd`, `server/authoritative_server.mjs` |

Ring Out is the reference for real-time games where each player moves an own object. Pong is the reference
for a server-owned shared object: the server decides every bounce and point, and `remote_court.gd` draws the
ball and the opponent at the present with the same projection, correction and jump rules.

## Choose an owner for each object

| Owner | Owns |
| --- | --- |
| Each client | Its own player object: input, movement, physics, the collisions and contacts it detects, the damage it takes, its own fall or death, and all rendering, animation, sound, particles, camera and UI. |
| Server | Rooms, seats, rules, spawns, round phases and timers, shared objects, contested state (for example a pickup that two players claim), hidden or random information, and the referee calls: points, eliminations, score, round and match winner. |

- **Position authority is client first, then server.** The owner moves its object at once and publishes its
  pose. By default the server checks the pose against bounds and rate, relays it and uses it only to referee;
  it does not simulate physics or correct a valid pose.
- **Shared objects stay on the server.** An object that several players hit, such as a Pong ball, a soccer
  ball or a puck, is simulated by the server. Anything that collides with it needs a server position at the
  contact time, so the server also simulates those player objects from input, as Pong does for paddles. The
  client still moves its own object at once and corrects toward the server (see the next section).
- **Turns, cards and boards:** the server owns legal actions, hidden state and random draws. The client
  shows a pending action at once and restores it on rejection; never guess hidden or random results.
- Show local effects for your own events at once. Show a point, elimination or winner only when the server
  event arrives, so two clients never decide the same result.
- Send gameplay numbers (speeds, sizes, score to win) from the server in `welcome`, so every client runs the
  same rules. Keep client Tweak controls presentation-only.

## Own object: no round trip

- Simulate the own object in a fixed step from local input, and never wait for the server to move it. Ring
  Out uses `OwnBall` at 60 Hz.
- Publish a small pose (position, velocity, a sequence number and the sender's measured one-way latency)
  about 30 times a second, and at once after a contact or another sudden change. Ring Out sends from
  `src/main.ts` at most every 33 ms, or every 16 ms when urgent.
- Measure latency with a ping every second. Send it in each pose; other clients use it to project you.
- When the own object is out or dead, freeze its reported pose where it crossed the edge and stop moving
  it. Play the fall or death animation locally only.
- **When the server simulates the own object** (the shared-object case), match the server's speed and
  bounds locally. Project each snapshot's position forward by its velocity and estimated age (capped at
  150 ms), then correct toward it with weight `1 - exp(-dt / 0.10)` and a small dead zone. Apply teleports,
  respawns, rejections and large errors at once. Pong implements this in `local_paddle.gd`.
- Stop local movement on disconnect, seat loss or a non-playing phase, show reconnecting, and reset from a
  fresh snapshot after reconnect.

## Other players: present time, smooth, jump when far off

- Draw other players where they are now, not where they were. Project the last pose forward along its
  velocity by its age (sender latency + own latency + time since receipt). Cap the projection so a player
  whose poses stop does not drift away (Ring Out: `net.maxLead`, 0.2 s).
- When a new pose arrives, measure the error between the old and the new estimate at the same instant. Add
  the error as a drawn offset and fade it out with weight `exp(-dt / smoothTime)` (Ring Out: `net.smoothTime`,
  0.06 s). Do not blend toward a delayed target; that adds lag.
- Jump at once instead of fading when the error is larger than about one object width (Ring Out:
  `net.snapDistance`, 1.6 m; in 2D, use the sprite width), and at spawns, teleports and round starts. A long
  fade looks like sliding.
- Ignore poses or snapshots with an older sequence number.
- Draw a server-owned shared object at the present too. Send its velocity in each snapshot and its movement
  rules in `welcome`; project the snapshot forward by your one-way latency with those rules (walls, bounces
  off the drawn players), in small sub-steps for fast objects. Use the same offset and jump fallback (Pong:
  0.04 for the ball, 0.20 for a paddle). The next snapshot corrects a mispredicted close call.
- **Announce scheduled events ahead.** Some events are known before they happen, such as a serve, a round
  start or a respawn. Send their delay and starting state in each snapshot until they start. Each client
  starts the event when the delay minus its one-way latency has passed, so all clients start it at the same
  present moment. An event learned only on arrival starts speed × latency behind, and catching up makes it
  lurch (Pong: `serve` with `in_ms`, `vx` and `vy`).

## Contacts and damage: apply each once

- The client that detects a contact between its object and another player's applies its own half of the
  impulse, or the damage it takes, and sends the other half as a `hit` through the server. The owner of the
  other object applies it to that object.
- When both clients detect the same contact, each applies only its own half and ignores the other's `hit`.
  Keep a contact window per pair of at least one round trip; Ring Out uses `max(0.25 s, 2 × one-way latency)`.
- Contacts with a shared object are resolved by the server, which owns that object. Play their effect when
  the drawn object touches; skip the server's event for the same contact inside the contact window, and play
  an unmatched event late. Pong does this with `claim_effect` in `pong_board.gd`.
- Play bump sounds, particles and camera shake locally for every contact you draw; they need no server.

## Server: relay and referee, little work

- Relay each pose to the other clients as it arrives. Do not batch poses into a server tick, and run a
  physics loop only for shared objects. Send a snapshot at once after a shared-object event such as a bounce
  or a point (Pong: 30 Hz plus these). Clients send a changed input at once, not on the next send tick.
- Check cheaply: message size and rate, position and speed bounds, a `hit` only between seats within reach
  and at most once per pair in a short interval (Ring Out: 150 ms), and impulse or damage limits.
- Referee from the reported poses, with small graces against jitter. In Ring Out, a pose past the edge puts
  that player out. When one player is left, the server waits 0.25 s before it gives the point; if that player
  also goes out, nobody scores. A seat with no pose for 3 s in a live round is out, and a seat that joins or
  resumes mid-round plays from the next round.
- Keep resume tokens and a reconnect grace (60 s) so a dropped client gets its seat back. Clients show
  reconnecting and stop sending while disconnected.
- Put every client origin in `ALLOWED_ORIGINS` (both templates): Preview, the reserved share domain and each
  published custom domain. A missing origin rejects the WebSocket upgrade, and clients stay on reconnecting.

## Trust model and limits

Clients own their movement, so a modified client can move unfairly inside the bounds; the referee only stops
obvious abuse. This fits casual games and games among friends. Ranked or prize games, fast hit-scan shooters
and other precise, collision-heavy competitive games need server simulation with input acknowledgement and
replay, or an established networking framework; say so in the plan instead of building rollback ad hoc.

## Verify

After netcode changes, run the matching template's checks from its README. For Ring Out: `pnpm test`,
`pnpm test:server`, the server's two-client E2E from `server/README.md`, and `pnpm smoke` (two players, then
a third joins) without latency and with `SMOKE_LATENCY_MS=100`. For Pong: `tools/verify.sh`, the server tests
and `node test/native_network.mjs` (two Godot clients, 200 ms simulated round trip by default). Accept only when, with two clients under
100–200 ms simulated round trip and jitter, starts, stops and reversals respond at once, corrections stay
small, reconnects recover, scores match and each effect plays once. Then play on two separate computers
against the deployed WSS server through the published URL. Localhost alone proves nothing about internet play.
