const survival = require('../behaviors/survival')
const craft = require('../behaviors/craft')
const gather = require('../behaviors/gather')
const smelt = require('../behaviors/smelt')
const logger = require('./logger')

let running = false
let stuckCount = 0

const posHistory = []
const POS_HISTORY_SIZE = 8
const STUCK_DIST_THRESHOLD = 3

const LOG_BLOCKS = ['oak_log','birch_log','spruce_log','jungle_log','acacia_log','dark_oak_log','mangrove_log']

// Determine the current progression stage based on inventory state.
function getStage(bot) {
  const has = name => bot.inventory.items().some(i => i.name === name)
  const count = names => {
    const list = Array.isArray(names) ? names : [names]
    return bot.inventory.items().filter(i => list.includes(i.name)).reduce((s, i) => s + i.count, 0)
  }

  // Stage 1: need wood
  if (count(LOG_BLOCKS) < 12) return { id: 'gather_wood' }

  // Stage 2: need wooden tools (pickaxe + sword)
  if (!has('wooden_pickaxe') || !has('wooden_sword')) return { id: 'wooden_tools' }

  // Stage 3: need stone & coal
  if (count('cobblestone') < 32 || count('coal') < 16) return { id: 'gather_stone' }

  // Stage 4: need stone tools
  if (!has('stone_pickaxe') || !has('stone_sword')) return { id: 'stone_tools' }

  // Stage 5: need raw iron (count both raw and already-smelted)
  const rawIron = count(['raw_iron', 'iron_ore', 'deepslate_iron_ore'])
  if (rawIron + count('iron_ingot') < 24) return { id: 'mine_iron' }

  // Stage 6: smelt iron
  if (count('iron_ingot') < 16) return { id: 'smelt_iron' }

  // Stage 7: craft iron tools & armor
  if (!has('iron_pickaxe') || !has('iron_sword') || !has('iron_chestplate') || !has('iron_leggings')) return { id: 'iron_tools' }

  // Stage 8: mine diamonds
  if (count('diamond') < 8) return { id: 'mine_diamonds' }

  // Stage 9: craft diamond tools
  return { id: 'diamond_tools' }
}

function checkStuck(bot, behavior) {
  if (behavior !== 'gather' && behavior !== 'craft') {
    posHistory.length = 0
    stuckCount = 0
    return false
  }

  const pos = bot.entity.position
  posHistory.push({ x: pos.x, z: pos.z })
  if (posHistory.length > POS_HISTORY_SIZE) posHistory.shift()

  if (posHistory.length >= POS_HISTORY_SIZE) {
    const first = posHistory[0]
    const last = posHistory[posHistory.length - 1]
    const dist = Math.sqrt((last.x - first.x) ** 2 + (last.z - first.z) ** 2)
    if (dist < STUCK_DIST_THRESHOLD) stuckCount++
    else stuckCount = 0
  }

  return stuckCount >= 2
}

async function unstick(bot) {
  console.log('[loop] stuck detected, attempting to break free...')
  stuckCount = 0
  posHistory.length = 0

  const { goals: { GoalNear } } = require('mineflayer-pathfinder')
  const pos = bot.entity.position
  const angle = Math.random() * 2 * Math.PI
  const dist = 16 + Math.random() * 16
  const tx = Math.floor(pos.x + Math.cos(angle) * dist)
  const tz = Math.floor(pos.z + Math.sin(angle) * dist)
  const ty = pos.y < 62 ? Math.floor(pos.y + 20) : Math.floor(pos.y)

  try {
    await bot.pathfinder.goto(new GoalNear(tx, ty, tz, 3))
  } catch (_) {}
}

async function tick(bot, logPath) {
  if (running) return
  running = true

  const stage = getStage(bot)
  let currentBehavior = stage.id

  try {
    if (survival.canAct(bot)) {
      currentBehavior = 'survival'
      await survival.act(bot)
    } else if (craft.canAct(bot, stage)) {
      currentBehavior = 'craft'
      await craft.act(bot, stage)
    } else if (smelt.canAct(bot, stage)) {
      currentBehavior = 'smelt'
      await smelt.act(bot, stage)
    } else if (gather.canAct(bot, stage)) {
      currentBehavior = 'gather'
      await gather.act(bot, stage)
    }

    if (checkStuck(bot, currentBehavior)) {
      await unstick(bot)
    }
  } catch (err) {
    console.error(`[loop] error in ${currentBehavior}:`, err.message)
  }

  try {
    logger.snapshot(bot, currentBehavior, logPath)
  } catch (err) {
    console.error('[loop] logger error:', err.message)
  }

  running = false
}

function start(bot, config) {
  console.log(`[loop] starting with interval ${config.loopIntervalMs}ms`)
  setInterval(() => tick(bot, config.logPath), config.loopIntervalMs)
}

module.exports = { start }
