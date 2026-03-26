const survival = require('../behaviors/survival')
const gather = require('../behaviors/gather')
const logger = require('./logger')

let running = false

async function tick(bot, logPath) {
  if (running) return
  running = true

  let currentBehavior = 'idle'

  try {
    if (survival.canAct(bot)) {
      currentBehavior = 'survival'
      await survival.act(bot)
    } else if (gather.canAct(bot)) {
      currentBehavior = 'gather'
      await gather.act(bot)
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
