const fs = require('fs')
const path = require('path')

function snapshot(bot, currentBehavior, logPath) {
  const nearbyBlocks = []
  const pos = bot.entity.position
  for (let dx = -3; dx <= 3; dx++) {
    for (let dy = -1; dy <= 2; dy++) {
      for (let dz = -3; dz <= 3; dz++) {
        const block = bot.blockAt(pos.offset(dx, dy, dz))
        if (block && block.name !== 'air' && !nearbyBlocks.includes(block.name)) {
          nearbyBlocks.push(block.name)
        }
      }
    }
  }

  const inventory = {}
  for (const item of bot.inventory.items()) {
    inventory[item.name] = (inventory[item.name] || 0) + item.count
  }

  const entry = {
    timestamp: new Date().toISOString(),
    health: bot.health,
    food: bot.food,
    position: {
      x: Math.round(pos.x),
      y: Math.round(pos.y),
      z: Math.round(pos.z)
    },
    inventory,
    currentBehavior,
    nearbyBlocks
  }

  const dir = path.dirname(logPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.appendFileSync(logPath, JSON.stringify(entry) + '\n')
}

module.exports = { snapshot }
