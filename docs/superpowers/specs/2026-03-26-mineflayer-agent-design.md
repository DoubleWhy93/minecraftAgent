# Mineflayer Survival Agent — Design Spec

**Date:** 2026-03-26
**Scope:** Simple survival bot (health/hunger + resource gathering) as the foundation for a future LLM-driven self-improving agent loop.

---

## Goals

- Connect to a local Minecraft server and survive autonomously
- Gather wood and stone as the core activity
- Log structured JSON game state to a file every tick cycle so a future LLM agent can read, analyze, and improve the bot's behavior

---

## File Structure

```
minecraftAgent/
├── bot.js              # Entry point — creates bot, loads plugins, starts loop
├── config.json         # Host, port, username, log path, loop interval
├── behaviors/
│   ├── survival.js     # Monitors health/hunger, eats food, flees mobs
│   └── gather.js       # Finds and mines wood (oak_log) then stone
├── core/
│   ├── loop.js         # Priority tick loop — delegates to behaviors
│   └── logger.js       # Appends JSON snapshots to gamestate.jsonl
└── logs/
    └── gamestate.jsonl # Newline-delimited JSON log (created at runtime)
```

---

## Dependencies

- `mineflayer` (already installed, ^4.35.0)
- `mineflayer-pathfinder` (needs to be added) — navigation to blocks

---

## Config (`config.json`)

```json
{
  "host": "localhost",
  "port": 25565,
  "username": "AgentBot",
  "version": false,
  "logPath": "./logs/gamestate.jsonl",
  "loopIntervalMs": 3000
}
```

`version: false` lets mineflayer auto-detect the server version.

---

## Behaviors

### `behaviors/survival.js`

- **`canAct(bot)`**: returns true if `bot.food < 14` OR `bot.health < 6`
- **`act(bot)`**:
  - If food < 14: find food item in inventory, equip and eat it
  - If health < 6: stop current task, pathfind away from nearest hostile mob

### `behaviors/gather.js`

- **`canAct(bot)`**: returns true if inventory has fewer than 32 oak logs OR fewer than 32 stone
- **`act(bot)`**:
  - Priority: find nearest `oak_log` within 32 blocks → navigate → mine
  - If no logs found: find nearest `stone` within 32 blocks → navigate → mine
  - If pathfinder can't reach a block, skip it and search for the next one

---

## Core Loop (`core/loop.js`)

Runs every `loopIntervalMs` (default 3000ms). Each cycle:

1. Snapshot game state
2. Log snapshot to file via `logger.js`
3. Priority check:
   - If `survival.canAct(bot)` → `survival.act(bot)`
   - Else if `gather.canAct(bot)` → `gather.act(bot)`
   - Else → idle (log only)

This file is the primary target for future LLM rewrites — adding new behaviors or adjusting priorities happens here.

---

## Logger (`core/logger.js`)

Appends one JSON line per loop cycle to `logs/gamestate.jsonl`:

```json
{
  "timestamp": "2026-03-26T10:00:00.000Z",
  "health": 18,
  "food": 12,
  "position": { "x": 10, "y": 64, "z": -5 },
  "inventory": { "oak_log": 4, "stone": 0 },
  "currentBehavior": "gather",
  "nearbyBlocks": ["oak_log", "grass_block", "stone"]
}
```

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Pathfinder can't reach block | Skip block, find next nearest |
| Bot dies | Auto-respawn via `bot.on('death', () => bot.respawn())` |
| Connection drops | Log error, exit process cleanly (no auto-reconnect) |
| No food in inventory | Log warning, skip eat action |

---

## Future LLM Loop (out of scope for v1)

The `logs/gamestate.jsonl` file is designed to be consumed by an external LLM agent that:
1. Reads recent log entries
2. Analyzes survival performance
3. Rewrites or patches behavior files (`loop.js`, `gather.js`, `survival.js`)
4. Reloads the bot

The module boundaries in this design map directly to the units the LLM will reason about and rewrite.
