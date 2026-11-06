# Blocklands progress notes (project: /home/ubuntu/blocklands, Three.js game, Blueprint approved rev 2)
- User (Arabic) wants Minecraft-like voxel game, plus ONLINE multiplayer. No cloud computer available (only sandbox) -> multiplayer server must be deployed later on user cloud computer; GET game/multiplayer pcId=null. Must tell user.
- Blueprint update (POST game/blueprint/update expectedRevision 2) not yet sent for adding multiplayer; do with first edit / before final.
- Done files: src/core/{noise,blocks,worldgen,gen.worker,atlas}.ts, src/game/{world,sky,audio,input,physics,inventory,player,mobs,effects,net}.ts, server/{server.mjs,package.json}
- TODO: src/game/save.ts, src/ui/* (HTML screens, HUD, inventory/crafting, touch, chat), src/styles/main.css, src/main.ts (Game class wiring), index.html lang=ar dir=rtl, public/multiplayer/bootstrap.json (signalingUrl empty), server e2e test, build+typecheck, smoke test screenshot, favicon (game-sharing.md), checkpoint (git-checkpoints.md, deployment.md), clean old scripts/smoke.mjs + check-size
- Font: public/fonts/ReemKufi.ttf (OFL, from github google/fonts reemkufi). Removed ManusCC0 fonts.
- Protocol: PROTOCOL 'blocklands-1', WS path /ws, msgs join/welcome/edits/pose/block/chat/ping.
