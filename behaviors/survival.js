const HOSTILE_MOBS = new Set([
  'zombie', 'skeleton', 'spider', 'cave_spider', 'creeper', 'enderman',
  'witch', 'pillager', 'vindicator', 'phantom', 'drowned', 'husk', 'stray', 'slime'
])

const FOOD_ITEMS = [
  'bread', 'cooked_beef', 'cooked_chicken', 'cooked_porkchop', 'cooked_mutton',
  'cooked_rabbit', 'cooked_salmon', 'cooked_cod', 'apple', 'golden_apple',
  'carrot', 'baked_potato', 'pumpkin_pie', 'melon_slice', 'mushroom_stew',
  'beetroot', 'beef', 'chicken', 'porkchop', 'rabbit', 'mutton', 'sweet_berries'
]

function nearbyHostile(bot, radius) {
  return Object.values(bot.entities).filter(e =>
    e.type === 'mob' && HOSTILE_MOBS.has(e.name) &&
    e.position.distanceTo(bot.entity.position) < radius
  )
}

function canAct(bot) {
  // Flee if any hostile is within 12 blocks (before it can deal damage)
  if (nearbyHostile(bot, 12).length > 0) return true
  if (bot.health < 14) return true
  if (bot.food < 14) return true
  return false
}

// Forage for sweet berry bushes — common in taiga/snowy biomes.
async function forage(bot) {
  const { GoalGetToBlock } = require('mineflayer-pathfinder').goals
  const bush = bot.findBlock({
    matching: b => b.name === 'sweet_berry_bush',
    maxDistance: 48
  })
  if (!bush) {
    console.log('[survival] hungry but no food or berry bushes found')
    return
  }
  try {
    await bot.pathfinder.goto(new GoalGetToBlock(bush.position.x, bush.position.y, bush.position.z))
    await bot.dig(bush)
    console.log('[survival] foraged sweet berries')
  } catch (err) {
    console.log('[survival] could not reach berry bush:', err.message)
  }
}

async function act(bot) {
  const { goals: { GoalXZ } } = require('mineflayer-pathfinder')

  // Flee from nearby hostiles
  const threats = nearbyHostile(bot, 16)
  if (threats.length > 0 || bot.health < 14) {
    if (threats.length > 0) {
      // Average threat position, flee opposite direction
      let fx = 0, fz = 0
      for (const mob of threats) {
        fx += bot.entity.position.x - mob.position.x
        fz += bot.entity.position.z - mob.position.z
      }
      const len = Math.sqrt(fx * fx + fz * fz) || 1
      const fleeX = Math.round(bot.entity.position.x + (fx / len) * 24)
      const fleeZ = Math.round(bot.entity.position.z + (fz / len) * 24)
      try {
        await bot.pathfinder.goto(new GoalXZ(fleeX, fleeZ))
        console.log('[survival] fled from', threats.length, 'mob(s)')
      } catch (_) {}
    }
    return
  }

  // Eat food if hungry
  if (bot.food < 14) {
    const food = bot.inventory.items().find(i => FOOD_ITEMS.includes(i.name))
    if (food) {
      try {
        await bot.equip(food, 'hand')
        await bot.consume()
        console.log('[survival] ate', food.name)
      } catch (err) {
        console.error('[survival] eat error:', err.message)
      }
    } else {
      // No food in inventory — try to forage nearby berry bushes
      await forage(bot)
    }
  }
}

module.exports = { canAct, act }
