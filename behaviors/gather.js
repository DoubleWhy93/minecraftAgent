const { goals } = require('mineflayer-pathfinder')

const LOG_GOAL = 32
const STONE_GOAL = 32
const SEARCH_RADIUS = 32

const LOG_BLOCKS = ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'mangrove_log']
const STONE_BLOCKS = ['stone', 'cobblestone']

function countItem(bot, names) {
  return bot.inventory.items()
    .filter(i => (Array.isArray(names) ? names.includes(i.name) : i.name === names))
    .reduce((sum, i) => sum + i.count, 0)
}

function canAct(bot) {
  const logs = countItem(bot, LOG_BLOCKS)
  const stone = countItem(bot, STONE_BLOCKS)
  return logs < LOG_GOAL || stone < STONE_GOAL
}

async function act(bot) {
  const logs = countItem(bot, LOG_BLOCKS)
  const targetBlocks = logs < LOG_GOAL ? LOG_BLOCKS : STONE_BLOCKS

  const block = bot.findBlock({
    matching: b => targetBlocks.includes(b.name),
    maxDistance: SEARCH_RADIUS
  })

  if (!block) {
    console.log(`[gather] no ${targetBlocks[0]} found within ${SEARCH_RADIUS} blocks`)
    return
  }

  try {
    await bot.pathfinder.goto(new goals.GoalGetToBlock(block.position.x, block.position.y, block.position.z))
    await bot.dig(block)
  } catch (err) {
    console.log(`[gather] could not reach block at ${block.position}: ${err.message}`)
  }
}

module.exports = { canAct, act }
