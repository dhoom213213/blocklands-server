// Block + item registry. Block ids < 100 are placeable blocks, ids >= 100 are plain items.

export const CH = 96 // chunk height
export const CS = 16 // chunk size
export const SEA = 30

export enum B {
  AIR = 0, GRASS, DIRT, STONE, COBBLE, SAND, LOG, LEAVES, PLANKS, WATER, GLASS, BRICK, SANDSTONE,
  BEDROCK, SNOW, CACTUS, TABLE, COAL_ORE, LAMP, GRAVEL, IRON_ORE, GOLD_ORE, DIAMOND_ORE, OBSIDIAN, PORTAL_FRAME, END_PORTAL,
  FLOWER_RED = 26, FLOWER_YELLOW = 27, FLOWER_WHITE = 28, DOOR = 29, DOOR_OPEN = 30, STAIRS = 31, CHEST = 32, BED = 33, FURNACE = 34, CANDLE = 35, COUCH = 36, SIDE_TABLE = 37, TV = 38, TV_ON = 39,
}

export type Tool = 'pickaxe' | 'axe' | 'shovel' | 'sword' | 'hand'

export interface BlockDef {
  id: number
  name: string
  /** atlas tile indices: top, bottom, side (front uses side unless `front` set) */
  tiles: [number, number, number]
  solid: boolean
  /** hides neighbouring faces */
  opaque: boolean
  /** renders in water pass */
  liquid?: boolean
  /** alpha-cut blocks (leaves, glass) */
  cutout?: boolean
  emissive?: boolean
  hardness: number
  tool: Tool
  needsTool?: boolean
  drop?: number
  sound: 'stone' | 'dirt' | 'wood' | 'sand' | 'glass' | 'leaves' | 'snow'
  creative?: boolean
  requiredTier?: number
  shape?: 'cross' | 'door' | 'stairs' | 'bed' | 'furniture'
  interactable?: 'door' | 'chest' | 'bed' | 'furnace' | 'tv' | 'candle'
}

// atlas tile ids
export const T = {
  GRASS_TOP: 0, GRASS_SIDE: 1, DIRT: 2, STONE: 3, COBBLE: 4, SAND: 5, LOG_SIDE: 6, LOG_TOP: 7,
  LEAVES: 8, PLANKS: 9, WATER: 10, GLASS: 11, BRICK: 12, SANDSTONE_SIDE: 13, SANDSTONE_TOP: 14,
  BEDROCK: 15, SNOW: 16, SNOW_SIDE: 17, CACTUS_SIDE: 18, CACTUS_TOP: 19, TABLE_TOP: 20, TABLE_SIDE: 21,
  COAL_ORE: 22, LAMP: 23, GRAVEL: 24, TABLE_FRONT: 25, IRON_ORE: 26, GOLD_ORE: 27, DIAMOND_ORE: 28, OBSIDIAN: 29, PORTAL_FRAME: 30, END_PORTAL: 31, FLOWER_RED: 32, FLOWER_YELLOW: 33, FLOWER_WHITE: 34, DOOR: 35, DOOR_OPEN: 36, STAIRS: 37, CHEST: 38, BED: 39, FURNACE: 40, CANDLE: 41, COUCH: 42, SIDE_TABLE: 43, TV: 44, TV_ON: 45,
} as const
export const ATLAS_COLS = 8
export const ATLAS_ROWS = 8

const defs: BlockDef[] = []
function def(d: BlockDef): void { defs[d.id] = d }

def({ id: B.AIR, name: 'هواء', tiles: [0, 0, 0], solid: false, opaque: false, hardness: 0, tool: 'hand', sound: 'stone' })
def({ id: B.GRASS, name: 'عشب', tiles: [T.GRASS_TOP, T.DIRT, T.GRASS_SIDE], solid: true, opaque: true, hardness: 0.6, tool: 'shovel', drop: B.DIRT, sound: 'dirt' })
def({ id: B.DIRT, name: 'تراب', tiles: [T.DIRT, T.DIRT, T.DIRT], solid: true, opaque: true, hardness: 0.5, tool: 'shovel', sound: 'dirt' })
def({ id: B.STONE, name: 'حجر', tiles: [T.STONE, T.STONE, T.STONE], solid: true, opaque: true, hardness: 1.5, tool: 'pickaxe', needsTool: true, drop: B.COBBLE, sound: 'stone' })
def({ id: B.COBBLE, name: 'حجر مرصوف', tiles: [T.COBBLE, T.COBBLE, T.COBBLE], solid: true, opaque: true, hardness: 2, tool: 'pickaxe', needsTool: true, sound: 'stone' })
def({ id: B.SAND, name: 'رمل', tiles: [T.SAND, T.SAND, T.SAND], solid: true, opaque: true, hardness: 0.5, tool: 'shovel', sound: 'sand' })
def({ id: B.LOG, name: 'جذع شجرة', tiles: [T.LOG_TOP, T.LOG_TOP, T.LOG_SIDE], solid: true, opaque: true, hardness: 2, tool: 'axe', sound: 'wood' })
def({ id: B.LEAVES, name: 'أوراق', tiles: [T.LEAVES, T.LEAVES, T.LEAVES], solid: true, opaque: false, cutout: true, hardness: 0.2, tool: 'hand', sound: 'leaves' })
def({ id: B.PLANKS, name: 'ألواح خشب', tiles: [T.PLANKS, T.PLANKS, T.PLANKS], solid: true, opaque: true, hardness: 2, tool: 'axe', sound: 'wood' })
def({ id: B.WATER, name: 'ماء', tiles: [T.WATER, T.WATER, T.WATER], solid: false, opaque: false, liquid: true, hardness: 0, tool: 'hand', sound: 'stone' })
def({ id: B.GLASS, name: 'زجاج', tiles: [T.GLASS, T.GLASS, T.GLASS], solid: true, opaque: false, cutout: true, hardness: 0.3, tool: 'hand', drop: 0, sound: 'glass' })
def({ id: B.BRICK, name: 'طوب', tiles: [T.BRICK, T.BRICK, T.BRICK], solid: true, opaque: true, hardness: 2, tool: 'pickaxe', needsTool: true, sound: 'stone' })
def({ id: B.SANDSTONE, name: 'حجر رملي', tiles: [T.SANDSTONE_TOP, T.SANDSTONE_TOP, T.SANDSTONE_SIDE], solid: true, opaque: true, hardness: 0.8, tool: 'pickaxe', needsTool: true, sound: 'stone' })
def({ id: B.BEDROCK, name: 'صخر أساس', tiles: [T.BEDROCK, T.BEDROCK, T.BEDROCK], solid: true, opaque: true, hardness: Infinity, tool: 'hand', sound: 'stone', creative: false })
def({ id: B.SNOW, name: 'ثلج', tiles: [T.SNOW, T.DIRT, T.SNOW_SIDE], solid: true, opaque: true, hardness: 0.2, tool: 'shovel', sound: 'snow' })
def({ id: B.CACTUS, name: 'صبّار', tiles: [T.CACTUS_TOP, T.CACTUS_TOP, T.CACTUS_SIDE], solid: true, opaque: true, hardness: 0.4, tool: 'hand', sound: 'leaves' })
def({ id: B.TABLE, name: 'طاولة صناعة', tiles: [T.TABLE_TOP, T.PLANKS, T.TABLE_SIDE], solid: true, opaque: true, hardness: 2.5, tool: 'axe', sound: 'wood' })
def({ id: B.COAL_ORE, name: 'خام الفحم', tiles: [T.COAL_ORE, T.COAL_ORE, T.COAL_ORE], solid: true, opaque: true, hardness: 3, tool: 'pickaxe', needsTool: true, drop: 101, sound: 'stone' })
def({ id: B.LAMP, name: 'مصباح', tiles: [T.LAMP, T.LAMP, T.LAMP], solid: true, opaque: true, emissive: true, hardness: 0.3, tool: 'hand', sound: 'glass' })
def({ id: B.GRAVEL, name: 'حصى', tiles: [T.GRAVEL, T.GRAVEL, T.GRAVEL], solid: true, opaque: true, hardness: 0.6, tool: 'shovel', sound: 'sand' })
def({ id: B.IRON_ORE, name: 'خام الحديد', tiles: [T.IRON_ORE, T.IRON_ORE, T.IRON_ORE], solid: true, opaque: true, hardness: 3, tool: 'pickaxe', needsTool: true, requiredTier: 2, drop: 120, sound: 'stone' })
def({ id: B.GOLD_ORE, name: 'خام الذهب', tiles: [T.GOLD_ORE, T.GOLD_ORE, T.GOLD_ORE], solid: true, opaque: true, hardness: 3, tool: 'pickaxe', needsTool: true, requiredTier: 2, drop: 121, sound: 'stone' })
def({ id: B.DIAMOND_ORE, name: 'خام الألماس', tiles: [T.DIAMOND_ORE, T.DIAMOND_ORE, T.DIAMOND_ORE], solid: true, opaque: true, hardness: 4, tool: 'pickaxe', needsTool: true, requiredTier: 2, drop: 122, sound: 'stone' })
def({ id: B.OBSIDIAN, name: 'حجر الظلال', tiles: [T.OBSIDIAN, T.OBSIDIAN, T.OBSIDIAN], solid: true, opaque: true, hardness: 8, tool: 'pickaxe', needsTool: true, requiredTier: 2, sound: 'stone' })
def({ id: B.PORTAL_FRAME, name: 'إطار بوابة الأند', tiles: [T.PORTAL_FRAME, T.PORTAL_FRAME, T.PORTAL_FRAME], solid: true, opaque: true, hardness: 4, tool: 'pickaxe', needsTool: true, sound: 'stone' })
def({ id: B.END_PORTAL, name: 'بوابة الأند', tiles: [T.END_PORTAL, T.END_PORTAL, T.END_PORTAL], solid: false, opaque: false, liquid: true, hardness: Infinity, tool: 'hand', sound: 'glass', creative: false })

def({ id: B.FLOWER_RED, name: 'زهرة حمراء', tiles: [T.FLOWER_RED, T.FLOWER_RED, T.FLOWER_RED], solid: false, opaque: false, cutout: true, shape: 'cross', hardness: 0, tool: 'hand', sound: 'leaves' })
def({ id: B.FLOWER_YELLOW, name: 'زهرة صفراء', tiles: [T.FLOWER_YELLOW, T.FLOWER_YELLOW, T.FLOWER_YELLOW], solid: false, opaque: false, cutout: true, shape: 'cross', hardness: 0, tool: 'hand', sound: 'leaves' })
def({ id: B.FLOWER_WHITE, name: 'زهرة بيضاء', tiles: [T.FLOWER_WHITE, T.FLOWER_WHITE, T.FLOWER_WHITE], solid: false, opaque: false, cutout: true, shape: 'cross', hardness: 0, tool: 'hand', sound: 'leaves' })
def({ id: B.DOOR, name: 'باب', tiles: [T.DOOR, T.DOOR, T.DOOR], solid: true, opaque: false, cutout: true, shape: 'door', interactable: 'door', hardness: 2, tool: 'axe', sound: 'wood' })
def({ id: B.DOOR_OPEN, name: 'باب مفتوح', tiles: [T.DOOR_OPEN, T.DOOR_OPEN, T.DOOR_OPEN], solid: false, opaque: false, cutout: true, shape: 'door', interactable: 'door', hardness: 2, tool: 'axe', sound: 'wood' })
def({ id: B.STAIRS, name: 'درج خشبي', tiles: [T.PLANKS, T.PLANKS, T.STAIRS], solid: true, opaque: false, shape: 'stairs', hardness: 2, tool: 'axe', sound: 'wood' })
def({ id: B.CHEST, name: 'صندوق', tiles: [T.CHEST, T.CHEST, T.CHEST], solid: true, opaque: true, shape: 'furniture', interactable: 'chest', hardness: 2, tool: 'axe', sound: 'wood' })
def({ id: B.BED, name: 'سرير', tiles: [T.BED, T.BED, T.BED], solid: false, opaque: false, shape: 'bed', interactable: 'bed', hardness: 1, tool: 'axe', sound: 'wood' })
def({ id: B.FURNACE, name: 'فرن', tiles: [T.FURNACE, T.FURNACE, T.FURNACE], solid: true, opaque: true, shape: 'furniture', interactable: 'furnace', hardness: 3, tool: 'pickaxe', needsTool: true, sound: 'stone' })
def({ id: B.CANDLE, name: 'شمعة', tiles: [T.CANDLE, T.CANDLE, T.CANDLE], solid: false, opaque: false, cutout: true, shape: 'cross', interactable: 'candle', emissive: true, hardness: 0.1, tool: 'hand', sound: 'wood' })
def({ id: B.COUCH, name: 'أريكة', tiles: [T.COUCH, T.COUCH, T.COUCH], solid: true, opaque: false, shape: 'furniture', hardness: 1.5, tool: 'axe', sound: 'wood' })
def({ id: B.SIDE_TABLE, name: 'طاولة جانبية', tiles: [T.SIDE_TABLE, T.SIDE_TABLE, T.SIDE_TABLE], solid: true, opaque: false, shape: 'furniture', hardness: 1.5, tool: 'axe', sound: 'wood' })
def({ id: B.TV, name: 'تلفاز', tiles: [T.TV, T.TV, T.TV], solid: true, opaque: false, shape: 'furniture', interactable: 'tv', hardness: 1, tool: 'axe', sound: 'wood' })
def({ id: B.TV_ON, name: 'تلفاز يعمل', tiles: [T.TV_ON, T.TV_ON, T.TV_ON], solid: true, opaque: false, emissive: true, shape: 'furniture', interactable: 'tv', hardness: 1, tool: 'axe', sound: 'wood' })

export const BLOCKS = defs
export const BLOCK_COUNT = defs.length
export const isSolid = (id: number) => defs[id]?.solid ?? false

export const CREATIVE_BLOCKS: number[] = defs.filter(d => d && d.id !== B.AIR && d.id !== B.WATER && d.id !== B.BEDROCK).map(d => d.id)

// ---------------------------------------------------------------- items

export interface ItemDef {
  id: number
  name: string
  stack: number
  tool?: { type: Tool; tier: number; speed: number; durability: number; damage: number }
  food?: number
  block?: number
  armor?: number
  armorSlot?: 'head' | 'chest' | 'legs' | 'feet'
  use?: 'boat' | 'dragonEgg'
}

export const I = {
  STICK: 100, COAL: 101, PORK: 102, BEEF: 103, APPLE: 104,
  WOOD_PICK: 110, STONE_PICK: 111, WOOD_AXE: 112, STONE_AXE: 113, WOOD_SHOVEL: 114, STONE_SHOVEL: 115,
  WOOD_SWORD: 116, STONE_SWORD: 117, PORTAL_KEY: 118, IRON: 120, GOLD: 121, DIAMOND: 122, DIAMOND_PICK: 123, IRON_PICK: 124, IRON_AXE: 125, DIAMOND_AXE: 126, IRON_SHOVEL: 127, DIAMOND_SHOVEL: 128, IRON_HELMET: 129, IRON_CHESTPLATE: 130, IRON_LEGGINGS: 131, IRON_BOOTS: 132, GOLD_HELMET: 133, GOLD_CHESTPLATE: 134, GOLD_LEGGINGS: 135, GOLD_BOOTS: 136, DIAMOND_HELMET: 137, DIAMOND_CHESTPLATE: 138, DIAMOND_LEGGINGS: 139, DIAMOND_BOOTS: 140, BOAT: 141, DRAGON_EGG: 142, IRON_INGOT: 143, GOLD_INGOT: 144,
} as const

const items: Record<number, ItemDef> = {}
for (const d of defs) {
  if (d && d.id !== B.AIR && d.id !== B.WATER) items[d.id] = { id: d.id, name: d.name, stack: 64, block: d.id }
}
function item(d: ItemDef): void { items[d.id] = d }
item({ id: I.STICK, name: 'عصا', stack: 64 })
item({ id: I.COAL, name: 'فحم', stack: 64 })
item({ id: I.PORK, name: 'لحم خنزير نيء', stack: 64, food: 5 })
item({ id: I.BEEF, name: 'لحم بقر نيء', stack: 64, food: 6 })
item({ id: I.APPLE, name: 'تفاحة', stack: 64, food: 4 })
item({ id: I.PORTAL_KEY, name: 'شرارة بوابة', stack: 16 })
item({ id: I.IRON, name: 'حديد خام', stack: 64 })
item({ id: I.GOLD, name: 'ذهب خام', stack: 64 })
item({ id: I.DIAMOND, name: 'ألماس', stack: 64 })
item({ id: I.IRON_INGOT, name: 'سبيكة حديد', stack: 64 })
item({ id: I.GOLD_INGOT, name: 'سبيكة ذهب', stack: 64 })
const tool = (id: number, name: string, type: Tool, tier: number, speed: number, durability: number, damage: number) =>
  item({ id, name, stack: 1, tool: { type, tier, speed, durability, damage } })
tool(I.WOOD_PICK, 'معول خشبي', 'pickaxe', 1, 2.2, 59, 2)
tool(I.STONE_PICK, 'معول حجري', 'pickaxe', 2, 3.6, 131, 3)
tool(I.WOOD_AXE, 'فأس خشبي', 'axe', 1, 2.2, 59, 3)
tool(I.STONE_AXE, 'فأس حجري', 'axe', 2, 3.6, 131, 4)
tool(I.WOOD_SHOVEL, 'مجرفة خشبية', 'shovel', 1, 2.2, 59, 2)
tool(I.STONE_SHOVEL, 'مجرفة حجرية', 'shovel', 2, 3.6, 131, 2.5)
tool(I.WOOD_SWORD, 'سيف خشبي', 'sword', 1, 1.5, 59, 5)
tool(I.STONE_SWORD, 'سيف حجري', 'sword', 2, 1.5, 131, 6)
tool(I.DIAMOND_PICK, 'معول ألماسي', 'pickaxe', 3, 6.5, 1561, 5)
tool(I.IRON_PICK, 'معول حديدي', 'pickaxe', 2, 5.2, 250, 4)
tool(I.IRON_AXE, 'فأس حديدي', 'axe', 2, 5.2, 250, 5); tool(I.DIAMOND_AXE, 'فأس ألماسي', 'axe', 3, 6.5, 1561, 6)
tool(I.IRON_SHOVEL, 'مجرفة حديدية', 'shovel', 2, 5.2, 250, 3); tool(I.DIAMOND_SHOVEL, 'مجرفة ألماسية', 'shovel', 3, 6.5, 1561, 4)
const armor = (id: number, name: string, slot: 'head' | 'chest' | 'legs' | 'feet', value: number, durability: number) => item({ id, name, stack: 1, armor: value, armorSlot: slot, tool: { type: 'hand', tier: 0, speed: 1, durability, damage: 0 } })
armor(I.IRON_HELMET, 'خوذة حديدية', 'head', 2, 165); armor(I.IRON_CHESTPLATE, 'درع حديدي', 'chest', 6, 240); armor(I.IRON_LEGGINGS, 'سروال حديدي', 'legs', 5, 225); armor(I.IRON_BOOTS, 'حذاء حديدي', 'feet', 2, 195)
armor(I.GOLD_HELMET, 'خوذة ذهبية', 'head', 2, 77); armor(I.GOLD_CHESTPLATE, 'درع ذهبي', 'chest', 5, 112); armor(I.GOLD_LEGGINGS, 'سروال ذهبي', 'legs', 3, 105); armor(I.GOLD_BOOTS, 'حذاء ذهبي', 'feet', 1, 91)
armor(I.DIAMOND_HELMET, 'خوذة ألماسية', 'head', 3, 363); armor(I.DIAMOND_CHESTPLATE, 'درع ألماسي', 'chest', 8, 528); armor(I.DIAMOND_LEGGINGS, 'سروال ألماسي', 'legs', 6, 495); armor(I.DIAMOND_BOOTS, 'حذاء ألماسي', 'feet', 3, 429)
item({ id: I.BOAT, name: 'قارب', stack: 1, use: 'boat' }); item({ id: I.DRAGON_EGG, name: 'بيضة التنين', stack: 1, use: 'dragonEgg' })

export const ITEMS = items
export const itemName = (id: number) => items[id]?.name ?? '؟'

/** Seconds needed to break `block` with the given held item (Infinity = unbreakable). */
export function breakTime(block: number, held: number): number {
  const b = defs[block]
  if (!b || b.hardness === Infinity) return Infinity
  const it = items[held]
  const t = it?.tool
  const match = t && t.type === b.tool
  if (b.needsTool && (!match || (b.requiredTier && t!.tier < b.requiredTier))) return b.hardness * 5
  const speed = match ? t!.speed : 1
  return Math.max(0.05, (b.hardness * 1.5) / speed)
}

/** What a broken block yields when mined with `held` (0 = nothing). */
export function blockDrop(block: number, held: number): number {
  const b = defs[block]
  if (!b) return 0
  if (b.needsTool) {
    const t = items[held]?.tool
    if (!t || t.type !== b.tool || (b.requiredTier && t.tier < b.requiredTier)) return 0
  }
  if (block === B.LEAVES) return Math.random() < 0.07 ? I.APPLE : Math.random() < 0.12 ? I.STICK : 0
  if (block === B.GLASS) return 0
  if (block === B.WATER) return 0
  return b.drop ?? block
}

// ---------------------------------------------------------------- recipes

export interface Recipe { pattern: string[]; key: Record<string, number>; out: number; count: number; shapeless?: boolean }

const P = B.PLANKS, S = I.STICK, C = B.COBBLE
export const RECIPES: Recipe[] = [
  { pattern: ['L'], key: { L: B.LOG }, out: B.PLANKS, count: 4 },
  { pattern: ['P', 'P'], key: { P }, out: I.STICK, count: 4 },
  { pattern: ['PP', 'PP'], key: { P }, out: B.TABLE, count: 1 },
  { pattern: ['PPP', '.S.', '.S.'], key: { P, S }, out: I.WOOD_PICK, count: 1 },
  { pattern: ['CCC', '.S.', '.S.'], key: { C, S }, out: I.STONE_PICK, count: 1 },
  { pattern: ['PP.', 'PS.', '.S.'], key: { P, S }, out: I.WOOD_AXE, count: 1 },
  { pattern: ['CC.', 'CS.', '.S.'], key: { C, S }, out: I.STONE_AXE, count: 1 },
  { pattern: ['P', 'S', 'S'], key: { P, S }, out: I.WOOD_SHOVEL, count: 1 },
  { pattern: ['C', 'S', 'S'], key: { C, S }, out: I.STONE_SHOVEL, count: 1 },
  { pattern: ['P', 'P', 'S'], key: { P, S }, out: I.WOOD_SWORD, count: 1 },
  { pattern: ['C', 'C', 'S'], key: { C, S }, out: I.STONE_SWORD, count: 1 },
  { pattern: ['CC', 'CC'], key: { C }, out: B.STONE, count: 4 },
  { pattern: ['TT', 'TT'], key: { T: B.STONE }, out: B.BRICK, count: 4 },
  { pattern: ['SS', 'SS'], key: { S: B.SAND }, out: B.SANDSTONE, count: 1 },
  { pattern: ['SC'], key: { S: B.SAND, C: I.COAL }, out: B.GLASS, count: 2, shapeless: true },
  { pattern: ['GC'], key: { G: B.GLASS, C: I.COAL }, out: B.LAMP, count: 1, shapeless: true },
  { pattern: ['OOO', 'O.O', 'OOO'], key: { O: B.OBSIDIAN }, out: B.PORTAL_FRAME, count: 1 },
  { pattern: ['DC'], key: { D: I.DIAMOND, C: I.COAL }, out: I.PORTAL_KEY, count: 1, shapeless: true },
  { pattern: ['MMM', '.S.', '.S.'], key: { M: I.IRON_INGOT, S }, out: I.IRON_PICK, count: 1 },
  { pattern: ['DDD', '.S.', '.S.'], key: { D: I.DIAMOND, S }, out: I.DIAMOND_PICK, count: 1 },
  { pattern: ['PPP','PPP','PPP'], key:{P}, out:B.COUCH,count:1 },
  { pattern: ['PPP','PGP','PPP'], key:{P,G:B.GLASS}, out:B.TV,count:1 },
  { pattern: ['P.P','PPP','P.P'], key:{P}, out:B.CHEST,count:1 },
  { pattern: ['PPP','WWW','P.P'], key:{P,W:B.SNOW}, out:B.BED,count:1 },
  { pattern: ['CCC','C.C','CCC'], key:{C}, out:B.FURNACE,count:1 },
  { pattern: ['PP','PP','PP'], key:{P}, out:B.DOOR,count:3 },
  { pattern: ['P..','PP.','PPP'], key:{P}, out:B.STAIRS,count:4 },
  { pattern: ['PPP','P.P','P.P'], key:{P}, out:B.SIDE_TABLE,count:1 },
  { pattern: ['S'], key:{S:I.STICK}, out:B.CANDLE,count:1 },
  { pattern: ['P.P','PPP'], key:{P}, out:I.BOAT,count:1 },
  { pattern: ['MMM','M.M','...'], key:{M:I.IRON_INGOT}, out:I.IRON_HELMET,count:1 }, { pattern:['M.M','MMM','MMM'],key:{M:I.IRON_INGOT},out:I.IRON_CHESTPLATE,count:1 }, {pattern:['MMM','M.M','M.M'],key:{M:I.IRON_INGOT},out:I.IRON_LEGGINGS,count:1}, {pattern:['M.M','M.M'],key:{M:I.IRON_INGOT},out:I.IRON_BOOTS,count:1},
  { pattern: ['GGG','G.G','...'], key:{G:I.GOLD_INGOT}, out:I.GOLD_HELMET,count:1 }, { pattern:['G.G','GGG','GGG'],key:{G:I.GOLD_INGOT},out:I.GOLD_CHESTPLATE,count:1 }, {pattern:['GGG','G.G','G.G'],key:{G:I.GOLD_INGOT},out:I.GOLD_LEGGINGS,count:1}, {pattern:['G.G','G.G'],key:{G:I.GOLD_INGOT},out:I.GOLD_BOOTS,count:1},
  { pattern: ['DDD','D.D','...'], key:{D:I.DIAMOND}, out:I.DIAMOND_HELMET,count:1 }, { pattern:['D.D','DDD','DDD'],key:{D:I.DIAMOND},out:I.DIAMOND_CHESTPLATE,count:1 }, {pattern:['DDD','D.D','D.D'],key:{D:I.DIAMOND},out:I.DIAMOND_LEGGINGS,count:1}, {pattern:['D.D','D.D'],key:{D:I.DIAMOND},out:I.DIAMOND_BOOTS,count:1},
  { pattern:['MMM','.S.','.S.'],key:{M:I.IRON_INGOT,S},out:I.IRON_AXE,count:1 }, {pattern:['M','S','S'],key:{M:I.IRON_INGOT,S},out:I.IRON_SHOVEL,count:1}, {pattern:['DDD','.S.','.S.'],key:{D:I.DIAMOND,S},out:I.DIAMOND_AXE,count:1}, {pattern:['D','S','S'],key:{D:I.DIAMOND,S},out:I.DIAMOND_SHOVEL,count:1},
]

/** grid: row-major array of item ids (0 = empty), w x h */
export function matchRecipe(grid: number[], w: number, h: number): Recipe | null {
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    if (grid[y * w + x]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y) }
  }
  if (maxX < 0) return null
  const gw = maxX - minX + 1, gh = maxY - minY + 1
  const cells: number[] = []
  for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) cells.push(grid[y * w + x])
  for (const r of RECIPES) {
    if (!Number.isInteger(r.out) || !Number.isFinite(r.count) || r.count < 1 || (!items[r.out] && !defs[r.out])) continue
    if (r.shapeless) {
      const need = r.pattern[0].split('').map(c => r.key[c]).sort((a, b) => a - b)
      const have = cells.filter(Boolean).sort((a, b) => a - b)
      if (need.length === have.length && need.every((v, i) => v === have[i])) return r
      continue
    }
    if (r.pattern.length !== gh || r.pattern[0].length !== gw) continue
    let ok = true
    for (let y = 0; y < gh && ok; y += 1) for (let x = 0; x < gw; x += 1) {
      const ch = r.pattern[y][x]
      const want = ch === '.' ? 0 : r.key[ch]
      if (cells[y * gw + x] !== want) { ok = false; break }
    }
    if (ok) return r
  }
  return null
}
