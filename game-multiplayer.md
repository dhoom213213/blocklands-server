# Multiplayer game services

Read this when the user requests online multiplayer; single-player templates stay offline by default. This page owns
the shared service workflow, and the selected game's guide or README owns its messages, rules and tests.
Project-local `docs/game-multiplayer.md` and README-backed Skills may be older snapshots; follow this installed page
for cloud-computer selection and updates. In the same batch, read the Game Skill's
`references/game-multiplayer-netcode.md` page for every engine; it owns which objects clients and the server own,
smoothing, contacts and the referee.

## Three.js clients

New games use `gameStarter: "generic-multiplayer"`; its README owns protocol, tests and deployment. Offline games adding multiplayer keep
gameplay and adapt the init/attach **Multiplayer reference source**. Keep Multiplayer and cloud-computer selection;
do not copy GDScript.

## Godot: read the runnable source before adapting

For an existing offline Godot game gaining multiplayer, keep its project and gameplay. The **Multiplayer reference source**
directory returned by init/attach holds the current Generic Multiplayer starter whatever this project's genre: read
its `scripts/net/connection.gd`, `scripts/main.gd`, `scripts/net/protocol.gd` and `server/authoritative_server.mjs`
in one parallel batch before writing the integration. Copy the connection component into the game's own source and
adapt the protocol, room adapter, server rules and UI together; never reinitialize the project or edit the installed
reference, and keep an existing working networking implementation. The Generic Multiplayer guide's **Reusable
connection component** section owns the API and cancellation/retry behavior; read its tests when changing that.

## Read and update the project's cloud computer

The project's saved multiplayer selection is the authoritative deployment target. Read and update it through
`webdev.config` (the Multiplayer panel uses the same record), never from the active device, an earlier message or a
local file.

To propose computers, use the built-in `manus-device.list_devices` and show each name, ID and hosting `region_id`
with a recognizable location (for example Singapore, `asia-southeast1`). A missing `region_id` is unknown; never
infer it from names or IDs. Suggest nearby regions from the requester's location without claiming measured latency.

**Existing Game project:** first read the current selection:

```json
{"method":"GET","path":"game/multiplayer"}
```

The response has `data.resourceId`, `data.selection.pcId`, `data.selection.revision` and `data.selectedServer`
(safe details and status, or null). `pcId: null` means nothing is selected; a non-null `pcId` with a null or
unavailable server needs attention but is still selected. Computer readiness does not prove the game service runs.

Reuse the saved computer unless the user asks for a change; with no selection, list available computers and ask.
An explicit choice — a Multiplayer button message, a natural-language choice, or a device ID from **Switch to another
device** that the message says to use for this game's multiplayer — needs no repeat in the panel. A request merely
to switch execution devices does not change the selection. Save with the exact `pcId` and the revision just read;
for example, **only if GET returned revision 3**:

```json
{"method":"PUT","path":"game/multiplayer","body":{"pcId":"USER_SELECTED_COMPUTER_ID","expectedRevision":3}}
```

Report the selection as saved only after `ok: true`; the panel refreshes from the server event, so make no second
UI write. After a lost response or a 409, GET again: if it already matches the intended computer it is saved;
otherwise resolve the conflicting choice first, never blindly retrying with a newer revision. To unlink on request,
GET then PUT `pcId: null` with the current revision. Unlinking or changing the selection does not stop, migrate or
delete an existing service or computer.

**No Game project yet:** explain that online multiplayer needs a cloud computer, list available computers (listing
needs no switch) and confirm the choice before initialization. If none is available, direct the user to
[buy a cloud computer](https://manus.im/app#settings/my-computer/create) and refresh after startup; never purchase
one for them. Right after init, GET and PUT the chosen computer into the project before implementing or deploying
multiplayer. Do not initialize just to expose the panel.

These calls need the owner's session on a ready Game project: save before switching to the deployment computer, or
switch back to the development environment to save, never copying credentials or calling the service from a shell.
Recheck the selection before deployment. A saved selection does not grant remote-control authorization; complete the
normal device access flow and stop at a real permission denial.

## Cloud computer unavailable or device switch fails

If connecting or switching to the selected computer fails, times out or hangs, call `manus-device.list_devices`,
match `device_id` to the saved `pcId`, then call `manus-device.get_environment_status` with that record's exact
`environment_id`; both work from the current environment. Read CPU (a 0–1 ratio) and memory (bytes) from the status
response; readings with unknown sampling time may be outdated, and missing or stale metrics prove neither health nor
exhaustion. If the tools are unavailable, report that instead of inventing readings. If the computer stays unresponsive with CPU near 1 or memory near capacity, explain the readings and ask
the user to reset that computer in Manus Settings, warning that reset interrupts running work, and stop deployment
and repeated switch attempts. A slow command or a high reading on a responsive computer does not justify a reset.
After a reset, list devices, query status and check the service before resuming. Without evidence of exhaustion,
investigate availability or access errors instead.

## Client and server responsibilities

Keep the service source and lockfile with the project; static Web publication does not start a WebSocket server.

The netcode page decides which objects each client owns. The server always owns rooms, seats, round transitions,
shared objects and the referee calls; client poses count only inside its bounds, and client scores, results and
elapsed time are never authoritative. Validate
message type, shape, size, rate, room membership and the socket's current seat before mutation. Use a protocol/build
identifier and increasing snapshot or action revisions: reject incompatible clients, ignore stale snapshots and make
retried actions idempotent where needed. Define capacity, spectators, disconnect grace, expiry and restart behavior.
Resume credentials are server-issued, room-scoped secrets kept out of invitations, logs and source; tab-scoped storage
keeps two players from sharing a seat, and a replaced socket loses input authority at once. Lost storage, expired
rooms and in-memory restarts need recovery UI, not promises of durable rooms. Bound rooms, connections, queued bytes
and messages, with heartbeat cleanup. Room codes are invitations, not authentication.

## Server runtime selection

Default to a standalone socket server without Godot, normally Node.js with `ws`, following the matching template's
service and protocol. It still owns the referee rules and validation. In Godot games, Godot stays on the client, including when adding multiplayer to an offline template;
GDScript gameplay alone is no reason for server-side Godot.
Consider headless Godot only when reusing engine-dependent physics, navigation or scene simulation brings a material
benefit; record it, the deployment budget and the tradeoff in the plan. `--headless` still runs the engine and its
threads: build the server export in the development environment, set explicit CPU, memory, thread and room limits on
the cloud computer, and verify concurrent play and control responsiveness before claiming capacity.

## Responsive controls

Never wait for a server round trip to show the player's movement or action start. The netcode page owns the steps
for the own object, other players and corrections; `scripts/game/local_paddle.gd` with `scripts/game/remote_court.gd` (Godot) and `src/game/localBall.ts`
with `src/game/balls.ts` (Three.js) implement them. Older snapshot-only Pong projects need a client and service
adaptation, not just a smoothing constant.

## Configure the public connection

Godot reads `multiplayer/config.json`; its Preview/release runtime generates `multiplayer/bootstrap.json`.
Three.js reads `public/multiplayer/bootstrap.json` from its Vite build. Verify it at the published URL.
`signalingUrl` can name an authoritative WebSocket server; it does not imply peer-to-peer:

```json
{"build":"GAME_PROTOCOL_VERSION","signalingUrl":"wss://VERIFIED_GAME_HOST/ws","iceTransportPolicy":"all"}
```

Client and server share the real build ID and verified endpoint. Direct WebSocket uses no ICE/TURN. Keep credentials,
resume tokens, TURN secrets and private keys out of public config. Edit source, never generated site/, dist/,
checkpoints or installed runtime. Resolve discovery relative to the game page, preserving Preview ingress prefixes.
Invitations select rooms, never operator-owned endpoints. HTTPS requires WSS; loopback WS is for explicit local tests.
Missing config must show an actionable unavailable state, never a simulated match. Native test config does not
configure publication.

## Prepare and run the service

Inspect the chosen computer's runtime, ports, existing services and proxy first. Use a new project-specific
directory, service name and free port, binding loopback behind an existing reverse proxy; a remote or public bind
needs the intended authenticated TLS network setup. Never overwrite an unrelated service or proxy. Build the client in the development environment, transfer only the frozen server source,
manifest and lockfile, and install from the lockfile with the service's own package manager.
Run the server once and check its health route, then make it persistent with the OS's existing service manager (on
Linux, a project-specific user systemd unit whose status and journal you check). An isolated device terminal may need
the device tool's approved host access to reach that user manager; never become root or disable the sandbox, and
verify linger before claiming the service survives reboot.

## HTTPS, WSS and client publication

Reuse the computer's existing HTTPS reverse proxy where available, checking that it forwards the `/ws` upgrade with
its query string, allows long-lived connections and routes health correctly. Healthy loopback does not prove a public
endpoint, and public HTTP health does not prove a WSS upgrade. Normally the client is served from the published static
origin and the service from the computer's WSS origin; set the service's Origin allowlist to the actual client origins
(the current Preview only when testing it); Origin checks complement room authentication, and HTTP CORS headers do not
authorize a WebSocket connection. An explicitly chosen combined deployment serves the complete frozen
Web release with every content-hashed WASM/PCK, keeps private source and config outside the static root, prevents
directory traversal and symlink escape, and is not the Addon's published checkpoint.

## Verify, update and troubleshoot

Test protocol/simulation, two isolated local clients, cloud loopback health and public HTTPS/WSS; Godot also needs
native import and Web export. After authorized publication, test two browser clients from the published game URL:
joining, state sync, seats, scores, spectators, reconnect, expired credentials, malformed input and room isolation.
Report pending publication or checks; Preview-only success does not establish production readiness.

| Symptom | Check |
| --- | --- |
| Cannot reach or switch to the cloud computer | [Device diagnostics](#cloud-computer-unavailable-or-device-switch-fails) |
| Public 502 | Exact service status, listening port and proxy upstream |
| Healthy HTTP, failed WSS | Upgrade path, TLS, Origin policy and protocol version |
| One player waits | Same room/build/endpoint, second client connected, reserved seats |
| Refresh changes seat | Tab storage availability, resume grace and server restart |
| Scores disagree | Client-side simulation, stale snapshots, room identity |
| Godot fails to load | Current WASM/PCK hashes, paths and MIME types |

Updates deploy a validated new version beside the previous one, switch only this service and repeat health and WSS
checks; an in-memory restart drops rooms and scores. Never publish a temporary test endpoint as permanent hosting.
Deliver the client URL, service and health endpoints, version, restart behavior and the checks actually completed.
