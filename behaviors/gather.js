const { goals } = require('mineflayer-pathfinder')

const SEARCH_RADIUS = 64
const MAX_DESCENT = 12

const LOG_BLOCKS = ['oak_log','birch_log','spruce_log','jungle_log','acacia_log','dark_oak_log','mangrove_log']
const COAL_ORE_BLOCKS = ['coal_ore','deepslate_coal_ore']
const IRON_ORE_BLOCKS = ['iron_ore','deepslate_iron_ore']
const DIAMOND_ORE_BLOCKS = ['diamond_ore','deepslate_diamond_ore']

function countItem(bot, names) {
  const list = Array.isArray(names) ? names : [names]
  return bot.inventory.items().filter(i => list.includes(i.name)).reduce((s, i) => s + i.count, 0)
}

function hasPickaxe(bot) {
  return bot.inventory.items().some(i => i.name.includes('pickaxe'))
}

function isCave(bot) {
  const pos = bot.entity.position.floored()
  let solidAbove = 0
  for (let dy = 1; dy <= 8; dy++) {
    const b = bot.blockAt(pos.offset(0, dy, 0))
    if (b && b.boundingBox === 'block') solidAbove++
  }
  return solidAbove >= 5
}

async function explore(bot) {
  const angle = Math.random() * 2 * Math.PI
  const dist = 16 + Math.random() * 32
  const tx = Math.floor(bot.entity.position.x + Math.cos(angle) * dist)
  const tz = Math.floor(bot.entity.position.z + Math.sin(angle) * dist)
  try {
    await bot.pathfinder.goto(new goals.GoalNear(tx, bot.entity.position.y, tz, 3))
  } catch (_) {}
}

async function surface(bot) {
  console.log('[gather] trapped in cave, attempting to surface...')
  const angle = Math.random() * 2 * Math.PI
  const dist = 20 + Math.random() * 20
  const tx = Math.floor(bot.entity.position.x + Math.cos(angle) * dist)
  const tz = Math.floor(bot.entity.position.z + Math.sin(angle) * dist)
  const ty = Math.floor(bot.entity.position.y + 20)
  try {
    await bot.pathfinder.goto(new goals.GoalNear(tx, ty, tz, 4))
  } catch (_) { await explore(bot) }
}

const AXE_NAMES = ['diamond_axe', 'iron_axe', 'stone_axe', 'wooden_axe']
const PICKAXE_NAMES = ['diamond_pickaxe', 'iron_pickaxe', 'stone_pickaxe', 'wooden_pickaxe']

async function equipBestTool(bot, block) {
  const toolList = LOG_BLOCKS.includes(block.name) ? AXE_NAMES : PICKAXE_NAMES
  for (const name of toolList) {
    const item = bot.inventory.items().find(i => i.name === name)
    if (item) { try { await bot.equip(item, 'hand') } catch (_) {} return }
  }
}

async function mineBlock(bot, block) {
  await bot.pathfinder.goto(new goals.GoalGetToBlock(block.position.x, block.position.y, block.position.z))
  await equipBestTool(bot, block)
  await bot.dig(block)
}

async function goToY(bot, targetY) {
  const angle = Math.random() * 2 * Math.PI
  const tx = Math.floor(bot.entity.position.x + Math.cos(angle) * 20)
  const tz = Math.floor(bot.entity.position.z + Math.sin(angle) * 20)
  try {
    await bot.pathfinder.goto(new goals.GoalNear(tx, targetY, tz, 5))
  } catch (_) { await explore(bot) }
}

// ---- Gather functions ----

async function gatherWood(bot) {
  const currentY = bot.entity.position.y
  if (!hasPickaxe(bot) && isCave(bot)) { await surface(bot); return }

  const block = bot.findBlock({
    matching: b => LOG_BLOCKS.includes(b.name),
    maxDistance: SEARCH_RADIUS,
    useExtraInfo: b => b.position.y >= currentY - MAX_DESCENT
  })
  if (!block) { console.log('[gather] no wood nearby, exploring...'); await explore(bot); return }

  try {
    await mineBlock(bot, block)
  } catch (err) {
    console.log(`[gather] could not reach wood: ${err.message}`)
    await explore(bot)
  }
}

async function gatherStone(bot) {
  // Coal first — needed for smelting later
  const coal = countItem(bot, 'coal')
  if (coal < 16) {
    const block = bot.findBlock({ matching: b => COAL_ORE_BLOCKS.includes(b.name), maxDistance: SEARCH_RADIUS })
    if (block) {
      try { await mineBlock(bot, block) } catch (_) { await explore(bot) }
      return
    }
  }

  const cobble = countItem(bot, 'cobblestone')
  if (cobble < 32) {
    const block = bot.findBlock({ matching: b => b.name === 'stone' || b.name === 'cobblestone', maxDistance: SEARCH_RADIUS })
    if (!block) { console.log('[gather] no stone nearby, exploring...'); await explore(bot); return }
    try { await mineBlock(bot, block) } catch (err) {
      console.log(`[gather] could not reach stone: ${err.message}`)
      await explore(bot)
    }
  }
}

async function mineIron(bot) {
  const block = bot.findBlock({ matching: b => IRON_ORE_BLOCKS.includes(b.name), maxDistance: SEARCH_RADIUS })
  if (block) {
    try { await mineBlock(bot, block) } catch (err) {
      console.log(`[gather] could not reach iron: ${err.message}`)
      await explore(bot)
    }
    return
  }
  // Go to iron level — y=16 is good for both old and new world gen
  console.log('[gather] no iron nearby, heading underground...')
  const targetY = Math.min(16, Math.floor(bot.entity.position.y) - 5)
  await goToY(bot, targetY)
}

async function mineDiamonds(bot) {
  const block = bot.findBlock({ matching: b => DIAMOND_ORE_BLOCKS.includes(b.name), maxDistance: SEARCH_RADIUS })
  if (block) {
    try { await mineBlock(bot, block) } catch (err) {
      console.log(`[gather] could not reach diamonds: ${err.message}`)
      await explore(bot)
    }
    return
  }
  // Try 1.18+ level first (-55), fall back to pre-1.18 level (11)
  console.log('[gather] no diamonds nearby, going deep...')
  try {
    await goToY(bot, -55)
  } catch (_) {
    await goToY(bot, 11)
  }
}

function canAct(bot, stage) {
  if (!stage) {
    if (countItem(bot, LOG_BLOCKS) < 32) return true
    if (hasPickaxe(bot) && (countItem(bot, 'cobblestone') < 32 || countItem(bot, 'coal') < 16)) return true
    return false
  }

  switch (stage.id) {
    case 'gather_wood':    return true
    case 'gather_stone':   return true
    case 'mine_iron':      return hasPickaxe(bot)
    case 'mine_diamonds':  return bot.inventory.items().some(i => ['iron_pickaxe','diamond_pickaxe'].includes(i.name))
    default: return false
  }
}

async function act(bot, stage) {
  if (!stage) { await gatherWood(bot); return }

  switch (stage.id) {
    case 'gather_wood':   await gatherWood(bot); break
    case 'gather_stone':  await gatherStone(bot); break
    case 'mine_iron':     await mineIron(bot); break
    case 'mine_diamonds': await mineDiamonds(bot); break
  }
}

module.exports = { canAct, act }
