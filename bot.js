const mineflayer = require('mineflayer')
const { pathfinder, Movements } = require('mineflayer-pathfinder')
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

  console.log(`[bot] spawned as ${bot.username} on ${config.host}:${config.port}`)
  loop.start(bot, config)
})

bot.on('death', () => {
  console.log('[bot] died, respawning...')
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
