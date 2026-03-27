const Vec3 = require('vec3')
const { goals } = require('mineflayer-pathfinder')

const SMELT_TIMEOUT_MS = 30000

function count(bot, names) {
  const list = Array.isArray(names) ? names : [names]
  return bot.inventory.items().filter(i => list.includes(i.name)).reduce((s, i) => s + i.count, 0)
}

function has(bot, name) {
  return bot.inventory.items().some(i => i.name === name)
}

function canAct(bot, stage) {
  if (!stage || stage.id !== 'smelt_iron') return false
  const rawIron = count(bot, ['raw_iron','iron_ore','deepslate_iron_ore'])
  return rawIron >= 1 && count(bot, 'coal') >= 1
}

async function craftFurnace(bot) {
  if (count(bot, 'cobblestone') < 8) {
    console.log('[smelt] not enough cobblestone for furnace')
    return false
  }
  let table = bot.findBlock({ matching: b => b.name === 'crafting_table', maxDistance: 32 })
  if (table) {
    try {
      await bot.pathfinder.goto(new goals.GoalGetToBlock(table.position.x, table.position.y, table.position.z))
    } catch (_) {}
    table = bot.findBlock({ matching: b => b.name === 'crafting_table', maxDistance: 5 })
  }
  if (!table && has(bot, 'crafting_table')) {
    table = await placeCraftingTable(bot)
  }
  if (!table) { console.log('[smelt] no crafting table to craft furnace'); return false }

  const id = bot.registry.itemsByName['furnace']?.id
  if (!id) return false
  const recipes = bot.recipesFor(id, null, 1, table)
  if (!recipes.length) { console.warn('[smelt] no furnace recipe'); return false }
  try {
    await bot.craft(recipes[0], 1, table)
    console.log('[smelt] crafted furnace')
    return true
  } catch (err) {
    console.error('[smelt] craft furnace error:', err.message)
    return false
  }
}

async function placeCraftingTable(bot) {
  const pos = bot.entity.position.floored()
  const candidates = [pos.offset(1,0,0), pos.offset(-1,0,0), pos.offset(0,0,1), pos.offset(0,0,-1)]
  for (const c of candidates) {
    const ground = bot.blockAt(c.offset(0,-1,0))
    const air = bot.blockAt(c)
    if (ground?.boundingBox === 'block' && air?.name === 'air') {
      try {
        const item = bot.inventory.items().find(i => i.name === 'crafting_table')
        if (!item) return null
        await bot.equip(item, 'hand')
        await bot.placeBlock(ground, new Vec3(0,1,0))
        const placed = bot.blockAt(c)
        if (placed?.name === 'crafting_table') return placed
      } catch (_) {}
    }
  }
  return null
}

async function placeFurnace(bot) {
  const pos = bot.entity.position.floored()
  const candidates = [pos.offset(1,0,0), pos.offset(-1,0,0), pos.offset(0,0,1), pos.offset(0,0,-1)]
  for (const c of candidates) {
    const ground = bot.blockAt(c.offset(0,-1,0))
    const air = bot.blockAt(c)
    if (ground?.boundingBox === 'block' && air?.name === 'air') {
      try {
        const item = bot.inventory.items().find(i => i.name === 'furnace')
        if (!item) return null
        await bot.equip(item, 'hand')
        await bot.placeBlock(ground, new Vec3(0,1,0))
        const placed = bot.blockAt(c)
        if (placed?.name === 'furnace') {
          console.log('[smelt] placed furnace')
          return placed
        }
      } catch (err) {
        console.error('[smelt] place furnace error:', err.message)
      }
    }
  }
  return null
}

async function smeltBatch(bot, furnaceBlock) {
  let furnace
  try {
    await bot.pathfinder.goto(new goals.GoalGetToBlock(furnaceBlock.position.x, furnaceBlock.position.y, furnaceBlock.position.z))
    furnace = await bot.openFurnace(furnaceBlock)

    const inputItem = bot.inventory.items().find(i => ['raw_iron','iron_ore','deepslate_iron_ore'].includes(i.name))
    const fuelItem = bot.inventory.items().find(i => i.name === 'coal')

    if (!inputItem) { console.log('[smelt] no iron to smelt'); return }
    if (!fuelItem) { console.log('[smelt] no coal for fuel'); return }

    await furnace.putFuel(fuelItem)
    await furnace.putInput(inputItem)
    console.log(`[smelt] smelting ${inputItem.count}x ${inputItem.name}...`)

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('smelt timeout')), SMELT_TIMEOUT_MS)
      const check = () => {
        if (furnace.outputItem()) {
          clearTimeout(timeout)
          resolve()
        }
      }
      furnace.on('update', check)
      check()
    })

    await furnace.takeOutput()
    console.log('[smelt] took iron ingots')
  } catch (err) {
    console.error('[smelt] error:', err.message)
  } finally {
    if (furnace) furnace.close()
  }
}

async function act(bot) {
  let furnaceBlock = bot.findBlock({ matching: b => b.name === 'furnace', maxDistance: 32 })

  if (!furnaceBlock) {
    if (!has(bot, 'furnace')) {
      const crafted = await craftFurnace(bot)
      if (!crafted) return
    }
    furnaceBlock = await placeFurnace(bot)
    if (!furnaceBlock) return
  }

  await smeltBatch(bot, furnaceBlock)
}

module.exports = { canAct, act }
