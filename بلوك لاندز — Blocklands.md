# بلوك لاندز — Blocklands

لعبة عالم مكعبات مفتوح (Three.js + TypeScript + Vite) بواجهة عربية كاملة. كل القوام والأصوات والنماذج تُولَّد برمجياً داخل المشروع، ولا تحتوي أي ملفات أو شعارات من لعبة تجارية.

## تشغيل اللعبة

```bash
pnpm install
PORT=3000 HOST=0.0.0.0 pnpm dev      # المعاينة
pnpm build                            # يُنتج dist/
```

## بنية المشروع

| المسار | الوظيفة |
| --- | --- |
| `src/core/` | تعريف الكتل والخامات النادرة والبوابات والعناصر والوصفات، مولّد العالم (Worker)، القوام الإجرائي (Atlas) |
| `src/game/world.ts` | القطع (Chunks) ودمج الوجوه والإضاءة وتتبع الأشعة |
| `src/game/player.ts`, `physics.ts` | اللاعب والفيزياء والصحة والجوع |
| `src/game/mobs.ts` | الزومبي والهيكل العظمي والقاذف المتفجر والتنين وخنازير وأبقار (نماذج مكعبة أصلية) |
| `src/game/net.ts` | عميل اللعب الجماعي ولاعبون آخرون |
| `src/game/save.ts` | الحفظ التلقائي للأبعاد والعوالم (IndexedDB)، الإعدادات والسيرفرات وأزرار التحكم (localStorage) |
| `src/ui/ui.ts` | الشاشات وشريط الأدوات والمخزون والتحكم باللمس |
| `server/server.mjs` | خادم WebSocket للغرف (Node.js + `ws`) |
| `src/game/tuning.ts` | معاملات الضبط للمعاينة (تطوير فقط) |

## اللعب الأونلاين

* العميل يقرأ عنوان الخادم من `public/multiplayer/bootstrap.json` (`signalingUrl`) أو من حقل «عنوان الخادم» في شاشة الأونلاين. تحفظ عناوين الخوادم محلياً، ويمكن طلب قائمة الغرف من `/rooms` على الخادم.
* الخادم يملك الغرف وبذرة العالم وسجل تعديلات الكتل؛ كل لاعب يتحكم بحركته محلياً والخادم يتحقق من الحدود ومعدل الرسائل. يقبل تحديث البروتوكول الحالي كتل اللعبة حتى معرّف 31.
* شاشة الإيقاف المؤقت تعرض رمز الغرفة الحالية لنسخه ومشاركته. رموز الغرف للاختيار وليست بديلاً عن المصادقة.
* التشغيل:

```bash
cd server && pnpm install --frozen-lockfile
PORT=8787 HOST=127.0.0.1 ALLOWED_ORIGINS=https://your-game-origin DATA_FILE=/var/lib/blocklands/rooms.json node server.mjs
# فحص الصحة: GET /health  — نقطة WebSocket: /ws
```

يجب وضع الخادم خلف وكيل HTTPS/WSS (مثل Caddy أو nginx) يمرّر ترقية `/ws`، ثم ضبط `signalingUrl` على `wss://HOST/ws`.

## الاختبارات

```bash
node scripts/smoke.mjs       # تشغيل أساسي مع لقطات
node scripts/play-test.mjs   # تعدين/صناعة/حفظ/وحوش
node scripts/online-test.mjs # لاعبان متصلان بالخادم المحلي (ws://localhost:8787/ws)
```

الخط: Reem Kufi (رخصة SIL OFL 1.1).
