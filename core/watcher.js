const fs = require('fs')
const EventEmitter = require('events')

// 20 entries × 3 s loop interval = 60 s — must match the buffer size below
const STUCK_THRESHOLD = 20
const TIMER_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes

class Watcher extends EventEmitter {
  constructor(logPath) {
    super()
    this.logPath = logPath
    this.recentEntries = []
    this.timer = null
  }

  start() {
    // Watch for new lines appended to the log file
    let fileSize = 0
    try { fileSize = fs.statSync(this.logPath).size } catch (_) {}

    fs.watchFile(this.logPath, { interval: 1000 }, () => {
      const stat = fs.statSync(this.logPath)
      if (stat.size <= fileSize) return

      const buf = Buffer.alloc(stat.size - fileSize)
      const fd = fs.openSync(this.logPath, 'r')
      fs.readSync(fd, buf, 0, buf.length, fileSize)
      fs.closeSync(fd)
      fileSize = stat.size

      const lines = buf.toString().split('\n').filter(l => l.trim())
      for (const line of lines) {
        try {
          const entry = JSON.parse(line)
          this._onEntry(entry)
        } catch (_) {}
      }
    })

    // Timer trigger
    this.timer = setInterval(() => {
      console.log('[watcher] timer trigger')
      this.emit('trigger', 'timer')
    }, TIMER_INTERVAL_MS)

    console.log('[watcher] started')
  }

  stop() {
    fs.unwatchFile(this.logPath)
    if (this.timer) clearInterval(this.timer)
  }

  _onEntry(entry) {
    this.recentEntries.push(entry)
    if (this.recentEntries.length > STUCK_THRESHOLD) this.recentEntries.shift()

    // Death trigger
    if (entry.health <= 0) {
      console.log('[watcher] death trigger')
      this.emit('trigger', 'death')
      return
    }

    // Stuck trigger — any behavior that should involve movement
    const movingBehaviors = ['gather', 'survival', 'smelt']
    if (movingBehaviors.includes(entry.currentBehavior) && this.recentEntries.length >= STUCK_THRESHOLD) {
      const recent = this.recentEntries.slice(-STUCK_THRESHOLD)
      const first = recent[0].position
      const allSame = recent.every(e =>
        Math.abs(e.position.x - first.x) <= 2 &&
        Math.abs(e.position.z - first.z) <= 2
      )
      if (allSame) {
        console.log(`[watcher] stuck trigger (behavior: ${entry.currentBehavior})`)
        this.emit('trigger', 'stuck')
      }
    }
  }
}

module.exports = Watcher
