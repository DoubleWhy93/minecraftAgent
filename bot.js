const mineflayer = require('mineflayer')
const { pathfinder, Movements } = require('mineflayer-pathfinder')
const { mineflayer: mineflayerViewer } = require('prismarine-viewer')
const config = require('./config.json')
const loop = require('./core/loop')
const { initConsoleCapture } = require('./core/logger')

initConsoleCapture(config.logPath)

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
  // Allow the pathfinder to drop up to 20 blocks in one move so it can
  // navigate from a tree canopy (y≈82) down to the forest floor (y≈64).
  // The default of 4 means any gap larger than 4 blocks — common between the
  // bottom of a spruce canopy and the ground — returns 'noPath'.
  movements.maxDropDown = 20

  // Leaves are physically passable in Minecraft (no collision box) but
  // mineflayer's block data reports them with boundingBox:'block', causing the
  // pathfinder to treat them as solid walls. This produces A* timeouts in dense
  // forests and makes flee/explore/unstick all fail. Adding leaf block IDs to
  // replaceables tells the pathfinder they can be freely entered, matching the
  // actual in-game physics.
  const leafIds = Object.values(mcData.blocks)
    .filter(b => b.name.endsWith('_leaves'))
    .map(b => b.id)
  for (const id of leafIds) movements.replaceables.add(id)

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
