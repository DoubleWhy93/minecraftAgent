const Vec3 = require('vec3')
const { goals } = require('mineflayer-pathfinder')

const LOG_BLOCKS = ['oak_log','birch_log','spruce_log','jungle_log','acacia_log','dark_oak_log','mangrove_log']
const PLANK_NAMES = ['oak_planks','birch_planks','spruce_planks','jungle_planks','acacia_planks','dark_oak_planks','mangrove_planks']
const LOG_TO_PLANK = {
  oak_log:'oak_planks', birch_log:'birch_planks', spruce_log:'spruce_planks',
  jungle_log:'jungle_planks', acacia_log:'acacia_planks',
  dark_oak_log:'dark_oak_planks', mangrove_log:'mangrove_planks'
}

function count(bot, names) {
  const list = Array.isArray(names) ? names : [names]
  return bot.inventory.items().filter(i => list.includes(i.name)).reduce((s, i) => s + i.count, 0)
}

function has(bot, name) {
  return bot.inventory.items().some(i => i.name === name)
}

async function craftItem(bot, itemName, qty, table) {
  const id = bot.registry.itemsByName[itemName]?.id
  if (!id) { console.warn(`[craft] unknown item: ${itemName}`); return false }
  const recipes = bot.recipesFor(id, null, 1, table)
  if (!recipes.length) { console.warn(`[craft] no recipe for ${itemName}`); return false }
  try {
    await bot.craft(recipes[0], qty, table)
    console.log(`[craft] crafted ${qty}x ${itemName}`)
    return true
  } catch (err) {
    console.error(`[craft] error crafting ${itemName}:`, err.message)
    return false
  }
}

async function placeBlock(bot, itemName) {
  const pos = bot.entity.position.floored()
  const candidates = [pos.offset(1,0,0), pos.offset(-1,0,0), pos.offset(0,0,1), pos.offset(0,0,-1)]
  for (const c of candidates) {
    const ground = bot.blockAt(c.offset(0,-1,0))
    const air = bot.blockAt(c)
    if (ground?.boundingBox === 'block' && air?.name === 'air') {
      try {
        const item = bot.inventory.items().find(i => i.name === itemName)
        if (!item) return null
        await bot.equip(item, 'hand')
        await bot.placeBlock(ground, new Vec3(0,1,0))
        const placed = bot.blockAt(c)
        if (placed?.name === itemName) {
          console.log(`[craft] placed ${itemName}`)
          return placed
        }
      } catch (err) {
        console.error(`[craft] place ${itemName} error:`, err.message)
      }
    }
  }
  return null
}

async function getTable(bot) {
  let table = bot.findBlock({ matching: b => b.name === 'crafting_table', maxDistance: 5 })
  if (table) return table

  // Walk to one further away
  const farTable = bot.findBlock({ matching: b => b.name === 'crafting_table', maxDistance: 32 })
  if (farTable) {
    try {
      await bot.pathfinder.goto(new goals.GoalGetToBlock(farTable.position.x, farTable.position.y, farTable.position.z))
      return bot.findBlock({ matching: b => b.name === 'crafting_table', maxDistance: 5 })
    } catch (_) {}
  }

  // Place from inventory
  if (has(bot, 'crafting_table')) {
    return await placeBlock(bot, 'crafting_table')
  }

  return null
}

async function ensureSticks(bot) {
  if (count(bot, 'stick') >= 4) return true
  if (count(bot, PLANK_NAMES) >= 2) {
    return await craftItem(bot, 'stick', 4, null)
  }
  const logItem = bot.inventory.items().find(i => LOG_BLOCKS.includes(i.name))
  if (logItem) {
    await craftItem(bot, LOG_TO_PLANK[logItem.name] || 'oak_planks', 1, null)
    return await craftItem(bot, 'stick', 4, null)
  }
  return false
}

// ---- Stage: wooden_tools ----

async function craftWoodenTools(bot) {
  // Phase 1: Convert logs to planks — need ~12 planks for table + pickaxe + sword + sticks
  for (let i = 0; i < 4 && count(bot, PLANK_NAMES) < 12; i++) {
    const logItem = bot.inventory.items().find(i => LOG_BLOCKS.includes(i.name))
    if (!logItem) break
    await craftItem(bot, LOG_TO_PLANK[logItem.name] || 'oak_planks', 1, null)
  }

  if (count(bot, PLANK_NAMES) < 4) return  // not enough materials

  // Phase 2: Craft crafting_table if not in inventory and none placed nearby
  if (!has(bot, 'crafting_table') && !bot.findBlock({ matching: b => b.name === 'crafting_table', maxDistance: 32 })) {
    if (count(bot, PLANK_NAMES) >= 4) {
      await craftItem(bot, 'crafting_table', 1, null)
    }
  }

  // Phase 3: Craft sticks
  for (let i = 0; i < 2 && count(bot, 'stick') < 8 && count(bot, PLANK_NAMES) >= 2; i++) {
    const before = count(bot, 'stick')
    await craftItem(bot, 'stick', 4, null)
    if (count(bot, 'stick') <= before) break
  }

  // Phase 4: Get/place crafting table and craft all tools in one session
  const table = await getTable(bot)
  if (!table) return

  if (!has(bot, 'wooden_pickaxe') && count(bot, PLANK_NAMES) >= 3 && count(bot, 'stick') >= 2) {
    await craftItem(bot, 'wooden_pickaxe', 1, table)
  }
  // Sword before axe — sword is critical for combat
  if (!has(bot, 'wooden_sword') && count(bot, PLANK_NAMES) >= 2 && count(bot, 'stick') >= 1) {
    await craftItem(bot, 'wooden_sword', 1, table)
  }
  if (!has(bot, 'wooden_axe') && count(bot, PLANK_NAMES) >= 3 && count(bot, 'stick') >= 2) {
    await craftItem(bot, 'wooden_axe', 1, table)
  }
}

// ---- Stage: stone_tools ----

async function craftStoneTools(bot) {
  if (!await ensureSticks(bot)) return

  const table = await getTable(bot)
  if (!table) { console.log('[craft] need crafting table for stone tools'); return }

  const cobble = count(bot, 'cobblestone')

  if (!has(bot, 'stone_pickaxe') && cobble >= 3) {
    await craftItem(bot, 'stone_pickaxe', 1, table)
    return
  }

  if (!has(bot, 'stone_sword') && cobble >= 2) {
    await craftItem(bot, 'stone_sword', 1, table)
  }
}

// ---- Stage: iron_tools ----

async function craftIronTools(bot) {
  if (!await ensureSticks(bot)) return

  const table = await getTable(bot)
  if (!table) return

  const ingots = count(bot, 'iron_ingot')

  if (!has(bot, 'iron_pickaxe') && ingots >= 3) {
    await craftItem(bot, 'iron_pickaxe', 1, table)
    return
  }

  if (!has(bot, 'iron_sword') && ingots >= 2) {
    await craftItem(bot, 'iron_sword', 1, table)
    return
  }

  if (!has(bot, 'iron_chestplate') && ingots >= 8) {
    await craftItem(bot, 'iron_chestplate', 1, table)
    return
  }

  if (!has(bot, 'iron_leggings') && ingots >= 7) {
    await craftItem(bot, 'iron_leggings', 1, table)
    return
  }

  if (!has(bot, 'iron_helmet') && ingots >= 5) {
    await craftItem(bot, 'iron_helmet', 1, table)
    return
  }

  if (!has(bot, 'iron_boots') && ingots >= 4) {
    await craftItem(bot, 'iron_boots', 1, table)
  }
}

// ---- Stage: diamond_tools ----

async function craftDiamondTools(bot) {
  if (!await ensureSticks(bot)) return

  const table = await getTable(bot)
  if (!table) return

  const diamonds = count(bot, 'diamond')

  if (!has(bot, 'diamond_pickaxe') && diamonds >= 3) {
    await craftItem(bot, 'diamond_pickaxe', 1, table)
    return
  }

  if (!has(bot, 'diamond_sword') && diamonds >= 2) {
    await craftItem(bot, 'diamond_sword', 1, table)
  }
}

function canAct(bot, stage) {
  if (!stage) {
    if (has(bot, 'wooden_pickaxe')) return false
    return count(bot, LOG_BLOCKS) >= 1 || count(bot, PLANK_NAMES) >= 4
  }

  switch (stage.id) {
    case 'wooden_tools':
      return !has(bot, 'wooden_pickaxe') || !has(bot, 'wooden_axe') || !has(bot, 'wooden_sword')
    case 'stone_tools':
      return (!has(bot, 'stone_pickaxe') || !has(bot, 'stone_sword')) && count(bot, 'cobblestone') >= 2
    case 'iron_tools':
      return count(bot, 'iron_ingot') >= 2
    case 'diamond_tools':
      return count(bot, 'diamond') >= 2
    default:
      return false
  }
}

async function act(bot, stage) {
  if (!stage) { await craftWoodenTools(bot); return }

  switch (stage.id) {
    case 'wooden_tools':  await craftWoodenTools(bot); break
    case 'stone_tools':   await craftStoneTools(bot); break
    case 'iron_tools':    await craftIronTools(bot); break
    case 'diamond_tools': await craftDiamondTools(bot); break
  }
}

module.exports = { canAct, act }
