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

  let currentBehavior = 'idle'

  try {
    if (survival.canAct(bot)) {
      currentBehavior = 'survival'
      await survival.act(bot)
    } else if (craft.canAct(bot)) {
      currentBehavior = 'craft'
      await craft.act(bot)
    } else if (smelt.canAct(bot)) {
      currentBehavior = 'smelt'
      await smelt.act(bot)
    } else if (gather.canAct(bot)) {
      currentBehavior = 'gather'
      await gather.act(bot)
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
