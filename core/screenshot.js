const fs = require('fs')
const path = require('path')

const BLOCK_COLORS = {
  grass_block:    '#5d8a3c',
  dirt:           '#8B5E3C',
  coarse_dirt:    '#7a5030',
  rooted_dirt:    '#7a5030',
  stone:          '#7d7d7d',
  cobblestone:    '#8a8a8a',
  deepslate:      '#555566',
  andesite:       '#888888',
  diorite:        '#c0c0c0',
  granite:        '#aa6655',
  sand:           '#c2b280',
  gravel:         '#909090',
  water:          '#1a6b9e',
  lava:           '#cf4800',
  log:            '#6b4c11',
  wood:           '#6b4c11',
  leaves:         '#2d7a1f',
  snow:           '#ddeeff',
  ice:            '#9bb8d8',
  ore:            '#e8aa00',
  planks:         '#a07840',
  crafting_table: '#c8a060',
  furnace:        '#888060',
  chest:          '#d4a030',
  grass:          '#4a7a2a',
  bedrock:        '#333333',
  netherrack:     '#8b3030',
  obsidian:       '#1a1030',
}

function blockColor(name) {
  for (const [key, color] of Object.entries(BLOCK_COLORS)) {
    if (name.includes(key)) return color
  }
  return '#555555'
}

function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

function shade(hex, factor) {
  const [r, g, b] = hexToRgb(hex)
  const c = v => Math.min(255, Math.max(0, Math.round(v * factor)))
  return `rgb(${c(r)},${c(g)},${c(b)})`
}

function drawBlock(ctx, sx, sy, tw, th, bd, hex) {
  const hw = tw / 2

  // Top face
  ctx.fillStyle = shade(hex, 1.2)
  ctx.beginPath()
  ctx.moveTo(sx,      sy - th)
  ctx.lineTo(sx + hw, sy)
  ctx.lineTo(sx,      sy + th)
  ctx.lineTo(sx - hw, sy)
  ctx.closePath()
  ctx.fill()

  // Left face (darker)
  ctx.fillStyle = shade(hex, 0.65)
  ctx.beginPath()
  ctx.moveTo(sx - hw, sy)
  ctx.lineTo(sx,      sy + th)
  ctx.lineTo(sx,      sy + th + bd)
  ctx.lineTo(sx - hw, sy + bd)
  ctx.closePath()
  ctx.fill()

  // Right face (mid)
  ctx.fillStyle = shade(hex, 0.85)
  ctx.beginPath()
  ctx.moveTo(sx,      sy + th)
  ctx.lineTo(sx + hw, sy)
  ctx.lineTo(sx + hw, sy + bd)
  ctx.lineTo(sx,      sy + th + bd)
  ctx.closePath()
  ctx.fill()

  // Thin edge lines
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(sx, sy - th)
  ctx.lineTo(sx + hw, sy)
  ctx.lineTo(sx, sy + th)
  ctx.lineTo(sx - hw, sy)
  ctx.closePath()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(sx, sy + th)
  ctx.lineTo(sx, sy + th + bd)
  ctx.stroke()
}

function capture(bot, outPath) {
  let createCanvas
  try { createCanvas = require('canvas').createCanvas } catch (e) {
    console.error('[screenshot] canvas not available:', e.message)
    return
  }

  const W = 640, H = 480
  // Isometric tile dimensions
  const TW = 18   // full block width  (screen pixels)
  const TH = 9    // half-height of diamond top face
  const BD = 8    // vertical depth of side faces

  const RANGE_H  = 16   // horizontal blocks each direction
  const RANGE_UP = 8    // blocks above bot feet
  const RANGE_DN = 5    // blocks below bot feet

  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  // Sky gradient background
  const sky = ctx.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, '#6ab0e8')
  sky.addColorStop(1, '#c5e0f0')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, H)

  const pos = bot.entity.position.floored()

  // Collect non-air blocks in range
  const blocks = []
  for (let dx = -RANGE_H; dx <= RANGE_H; dx++) {
    for (let dz = -RANGE_H; dz <= RANGE_H; dz++) {
      for (let dy = -RANGE_DN; dy <= RANGE_UP; dy++) {
        const block = bot.blockAt(pos.offset(dx, dy, dz))
        if (!block) continue
        if (block.name === 'air' || block.name === 'cave_air' || block.name === 'void_air') continue
        blocks.push({ dx, dy, dz, name: block.name })
      }
    }
  }

  // Painter's algorithm: viewer is NE of scene looking SW.
  // Further = smaller (dx + dz). Sort ascending so far blocks are drawn first.
  // Within same depth layer, lower dy drawn first (higher blocks on top).
  blocks.sort((a, b) => {
    const da = (a.dx + a.dz) * 1000 + a.dy
    const db = (b.dx + b.dz) * 1000 + b.dy
    return da - db
  })

  // Isometric projection origin — slightly above-center so sky shows at top
  const CX = W / 2
  const CY = Math.round(H * 0.58)

  for (const { dx, dy, dz, name } of blocks) {
    const sx = CX + (dx - dz) * (TW / 2)
    const sy = CY + (dx + dz) * (TH / 2) - dy * BD
    if (sx < -TW || sx > W + TW || sy < -BD * 3 || sy > H + TH + BD) continue
    drawBlock(ctx, sx, sy, TW, TH, BD, blockColor(name))
  }

  // Bot marker — glowing red dot at projection origin
  ctx.shadowColor = '#ff4444'
  ctx.shadowBlur = 8
  ctx.fillStyle = '#ff2020'
  ctx.beginPath()
  ctx.arc(CX, CY, 5, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1.5
  ctx.stroke()

  // HUD bar
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(0, 0, W, 20)
  ctx.fillStyle = '#ffffff'
  ctx.font = '11px monospace'
  const hp   = bot.health != null ? Math.round(bot.health) : '?'
  const food = bot.food   != null ? bot.food : '?'
  ctx.fillText(`XYZ: ${pos.x} ${pos.y} ${pos.z}   HP: ${hp}   Food: ${food}`, 4, 14)

  try {
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, canvas.toBuffer('image/png'))
    console.log('[screenshot] saved to', outPath)
  } catch (err) {
    console.error('[screenshot] write failed:', err.message)
  }
}

module.exports = { capture }
