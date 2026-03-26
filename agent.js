const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const config = require('./config.json')
const Watcher = require('./core/watcher')

const PROJECT_PATH = __dirname
const LOG_PATH = path.resolve(PROJECT_PATH, config.logPath)
const OPENCODE_PROMPT = `Improve the Minecraft survival bot located at ${PROJECT_PATH}. Read logs/gamestate.jsonl for recent performance data and improve the behavior files (behaviors/ and core/loop.js) to help the bot survive and gather resources better.`

let botProcess = null
let improving = false

function startBot() {
  console.log('[agent] starting bot...')
  botProcess = spawn('node', ['bot.js'], {
    cwd: PROJECT_PATH,
    stdio: 'inherit'
  })
  botProcess.on('exit', (code) => {
    if (!improving) {
      console.log(`[agent] bot exited with code ${code}, restarting...`)
      setTimeout(startBot, 2000)
    }
  })
}

function stopBot() {
  return new Promise(resolve => {
    if (!botProcess) return resolve()
    botProcess.removeAllListeners('exit')
    botProcess.kill()
    botProcess.once('exit', resolve)
    botProcess = null
  })
}

async function runImprovement(reason) {
  if (improving) {
    console.log('[agent] improvement already in progress, skipping')
    return
  }
  improving = true
  console.log(`[agent] improvement triggered: ${reason}`)

  await stopBot()

  console.log('[agent] running OpenCode...')
  const oc = spawn('opencode', ['run', OPENCODE_PROMPT], {
    cwd: PROJECT_PATH,
    stdio: 'inherit',
    shell: true
  })

  oc.on('exit', (code) => {
    console.log(`[agent] OpenCode exited with code ${code}`)
    improving = false
    startBot()
  })
}

// Ensure logs dir exists
fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true })

// Start bot
startBot()

// Start watcher
const watcher = new Watcher(LOG_PATH)
watcher.on('trigger', (reason) => runImprovement(reason))
watcher.start()

console.log('[agent] running. Bot will auto-improve on death, being stuck, or every 10 minutes.')
