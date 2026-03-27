const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const config = require('./config.json')
const Watcher = require('./core/watcher')

const PROJECT_PATH = __dirname
const LOG_PATH = path.resolve(PROJECT_PATH, config.logPath)
const GOALS = fs.readFileSync(path.join(PROJECT_PATH, 'GOALS.md'), 'utf8')
const PROMPT = `Improve the Minecraft survival bot located at ${PROJECT_PATH}. Read logs/gamestate.jsonl for recent performance data and improve the behavior files (behaviors/ and core/loop.js) to help the bot survive and progress through the game.

Do not ask clarifying questions. Do not wait for input. Read the code, identify problems, make decisions, and fix them. If something is ambiguous, pick the most sensible option and implement it.

After making changes, append an entry to CHANGELOG.md in the project root. Include the date, a short description of each change, what problem it fixed, and the strategy behind the change — explain the reasoning, not just what was done.

Then commit all changes with git. Stage only the files you modified. Write a clear, descriptive commit message explaining what was improved and why — not just "update bot".

${GOALS}`

function buildAgentCommand() {
  const agent = config.codingAgent || 'opencode'
  if (agent === 'cc' || agent === 'claude') {
    return { cmd: 'claude', args: ['-p', PROMPT, '--verbose', '--dangerously-skip-permissions'] }
  }
  return { cmd: 'opencode', args: ['run', PROMPT] }
}

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

  const { cmd, args } = buildAgentCommand()
  console.log(`[agent] running ${cmd}...`)
  const oc = spawn(cmd, args, {
    cwd: PROJECT_PATH,
    stdio: ['ignore', 'inherit', 'inherit']
  })

  oc.on('exit', (code) => {
    console.log(`[agent] ${cmd} exited with code ${code}`)
    improving = false
    startBot()
  })
}

// Ensure logs dir exists
fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true })

// Start watcher
const watcher = new Watcher(LOG_PATH)
watcher.on('trigger', (reason) => runImprovement(reason))
watcher.start()

// Optionally trigger an improvement on startup (controlled by config.improveOnStartup)
if (config.improveOnStartup !== false) {
  runImprovement('startup')
} else {
  startBot()
}

console.log('[agent] running. Bot will auto-improve on death, being stuck, or every 10 minutes.')
