const mineflayer = require('mineflayer')
const { pathfinder, Movements } = require('mineflayer-pathfinder')
const { mineflayer: mineflayerViewer } = require('prismarine-viewer')
const config = require('./config.json')
const loop = require('./core/loop')

const bot = mineflayer.createBot({
  host: config.host,
  port: config.port,
  username: config.username,
  version: config.version || undefined
})

bot.loadPlugin(pathfinder)

bot.once('spawn', () => {
  const mcData = require('minecraft-data')(bot.version)
  const movements = new Movements(bot, mcData)
  bot.pathfinder.setMovements(movements)

  mineflayerViewer(bot, { port: 3007, firstPerson: false })
  console.log('[bot] viewer running at http://localhost:3007')

  console.log(`[bot] spawned as ${bot.username} on ${config.host}:${config.port}`)
  loop.start(bot, config)
})

bot.on('death', () => {
  console.log('[bot] died, respawning...')
  const fs = require('fs')
  const path = require('path')
  const entry = {
    timestamp: new Date().toISOString(),
    health: 0,
    food: bot.food,
    position: {
      x: Math.round(bot.entity.position.x),
      y: Math.round(bot.entity.position.y),
      z: Math.round(bot.entity.position.z)
    },
    inventory: Object.fromEntries(bot.inventory.items().map(i => [i.name, i.count])),
    currentBehavior: 'death',
    nearbyBlocks: []
  }
  const logPath = path.resolve(__dirname, config.logPath)
  fs.appendFileSync(logPath, JSON.stringify(entry) + '\n')
  bot.respawn()
})

bot.on('error', err => {
  console.error('[bot] error:', err.message)
  process.exit(1)
})

bot.on('end', reason => {
  console.log('[bot] disconnected:', reason)
  process.exit(0)
})
