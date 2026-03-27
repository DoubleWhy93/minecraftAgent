const HOSTILE_MOBS = new Set([
  'zombie', 'skeleton', 'spider', 'cave_spider', 'creeper', 'enderman',
  'witch', 'pillager', 'vindicator', 'phantom', 'drowned', 'husk', 'stray', 'slime'
])

const FOOD_ITEMS = [
  'bread', 'cooked_beef', 'cooked_chicken', 'cooked_porkchop', 'cooked_mutton',
  'cooked_rabbit', 'cooked_salmon', 'cooked_cod', 'apple', 'golden_apple',
  'carrot', 'baked_potato', 'pumpkin_pie', 'melon_slice', 'mushroom_stew',
  'beetroot', 'beef', 'chicken', 'porkchop', 'rabbit', 'mutton', 'sweet_berries',
  'rotten_flesh' // last resort — causes hunger effect but beats starving to death
]

// Best sword wins; order matters (best first)
const SWORD_PRIORITY = ['diamond_sword', 'iron_sword', 'stone_sword', 'wooden_sword']

const ARMOR_PIECES = [
  { slot: 'head',  items: ['diamond_helmet',    'iron_helmet',    'chainmail_helmet',    'golden_helmet',    'leather_helmet']    },
  { slot: 'torso', items: ['diamond_chestplate','iron_chestplate','chainmail_chestplate','golden_chestplate','leather_chestplate'] },
  { slot: 'legs',  items: ['diamond_leggings',  'iron_leggings',  'chainmail_leggings',  'golden_leggings',  'leather_leggings']  },
  { slot: 'feet',  items: ['diamond_boots',     'iron_boots',     'chainmail_boots',     'golden_boots',     'leather_boots']     },
]

// Cooldown prevents re-triggering forage every tick when there's nothing to eat.
let forageCooldownUntil = 0

function nearbyHostile(bot, radius) {
  return Object.values(bot.entities).filter(e =>
    e.type === 'mob' && HOSTILE_MOBS.has(e.name) &&
    e.position.distanceTo(bot.entity.position) < radius
  )
}

function getBestSword(bot) {
  for (const name of SWORD_PRIORITY) {
    const item = bot.inventory.items().find(i => i.name === name)
    if (item) return item
  }
  return null
}

// Equip any available armor that isn't already worn.
// Checks slots 5-8 (helmet, chestplate, leggings, boots) in mineflayer inventory.
async function wearArmor(bot) {
  for (const { slot, items } of ARMOR_PIECES) {
    for (const itemName of items) {
      const item = bot.inventory.items().find(i => i.name === itemName)
      if (item) {
        try {
          await bot.equip(item, slot)
        } catch (_) {}
        break // only equip best available for this slot
      }
    }
  }
}

// Forage for sweet berry bushes — common in taiga/snowy biomes.
async function forage(bot) {
  const { GoalGetToBlock, GoalNear } = require('mineflayer-pathfinder').goals
  const bush = bot.findBlock({
    matching: b => b.name === 'sweet_berry_bush',
    maxDistance: 128
  })
  if (!bush) {
    // No berry bushes found — explore to find food sources
    console.log('[survival] hungry but no berry bushes nearby, exploring...')
    const pos = bot.entity.position
    const angle = Math.random() * 2 * Math.PI
    const tx = Math.floor(pos.x + Math.cos(angle) * 32)
    const tz = Math.floor(pos.z + Math.sin(angle) * 32)
    try {
      await bot.pathfinder.goto(new GoalNear(tx, pos.y, tz, 3))
    } catch (_) {}
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

function canAct(bot) {
  // Wider radius catches ranged attackers (skeletons shoot at ~16 blocks)
  if (nearbyHostile(bot, 16).length > 0) return true
  const hasFood = bot.inventory.items().some(i => FOOD_ITEMS.includes(i.name))
  // Proactively eat only when we actually have food — avoids infinite loop when hungry but foodless
  if (hasFood && (bot.food < 18 || bot.health < 16)) return true
  // Critical starvation — forage, but use a cooldown so we don't block gather/craft forever
  if (bot.food < 6 && Date.now() > forageCooldownUntil) return true
  return false
}

async function act(bot) {
  const { goals: { GoalXZ, GoalNear } } = require('mineflayer-pathfinder')

  // Equip armor opportunistically whenever survival runs
  await wearArmor(bot)

  const sword = getBestSword(bot)
  const threats = nearbyHostile(bot, 16)

  if (threats.length > 0) {
    // Flee from creepers even when armed — they explode when close
    const hasCreeper = threats.some(t => t.name === 'creeper')
    if (sword && !hasCreeper) {
      // Fight the closest threat
      const target = threats.reduce((a, b) =>
        a.position.distanceTo(bot.entity.position) <= b.position.distanceTo(bot.entity.position) ? a : b
      )
      try {
        await bot.equip(sword, 'hand')
        const dist = target.position.distanceTo(bot.entity.position)
        if (dist > 3) {
          await bot.pathfinder.goto(new GoalNear(
            Math.round(target.position.x),
            Math.round(target.position.y),
            Math.round(target.position.z),
            2
          ))
        }
        bot.attack(target)
        console.log('[survival] attacking', target.name)
      } catch (_) {}
    } else {
      // No sword or creeper present — flee away from all threats
      let fx = 0, fz = 0
      for (const mob of threats) {
        fx += bot.entity.position.x - mob.position.x
        fz += bot.entity.position.z - mob.position.z
      }
      const len = Math.sqrt(fx * fx + fz * fz) || 1
      const nx = fx / len
      const nz = fz / len
      const fleeX = Math.round(bot.entity.position.x + nx * 32)
      const fleeZ = Math.round(bot.entity.position.z + nz * 32)
      let fled = false
      try {
        await bot.pathfinder.goto(new GoalXZ(fleeX, fleeZ))
        fled = true
      } catch (_) {}

      if (!fled) {
        // Pathfinder failed — sprint away manually
        try {
          // yaw: atan2(-dx, -dz) points bot in direction (nx, nz)
          const yaw = Math.atan2(-nx, -nz)
          await bot.look(yaw, 0, true)
          bot.setControlState('sprint', true)
          bot.setControlState('forward', true)
          bot.setControlState('jump', true)
          await new Promise(r => setTimeout(r, 2500))
        } catch (_2) {}
        bot.setControlState('sprint', false)
        bot.setControlState('forward', false)
        bot.setControlState('jump', false)
      }
      console.log('[survival] fled from', threats.length, 'mob(s)')
    }
    return
  }

  // No threats — eat to restore food/health
  if (bot.food < 18 || bot.health < 16) {
    const food = bot.inventory.items().find(i => FOOD_ITEMS.includes(i.name))
    if (food) {
      try {
        await bot.equip(food, 'hand')
        await bot.consume()
        console.log('[survival] ate', food.name)
      } catch (err) {
        console.error('[survival] eat error:', err.message)
      }
    } else if (bot.food < 10) {
      await forage(bot)
      // Whether forage found something or not, apply cooldown so other behaviors can run
      forageCooldownUntil = Date.now() + 30000
    }
  }
}

module.exports = { canAct, act }
