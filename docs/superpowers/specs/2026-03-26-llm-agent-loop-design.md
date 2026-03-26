# LLM Agent Loop — Design Spec

**Date:** 2026-03-26
**Scope:** Autonomous improvement loop — triggers on game events, invokes OpenCode (powered by MiniMax) to rewrite behavior files, then restarts the bot.

---

## Goals

- Run a fully autonomous observe → improve → restart loop
- Use OpenCode (with MiniMax as the model) as the coding agent — it reads logs and source files itself
- Trigger on meaningful events, not just on a fixed timer

---

## File Structure

```
minecraftAgent/
├── agent.js          # Master process — spawns bot, listens for triggers, invokes OpenCode
├── bot.js            # (existing) runs as child process managed by agent.js
├── behaviors/        # (existing) edited in-place by OpenCode+MiniMax
├── core/
│   ├── loop.js       # (existing)
│   ├── logger.js     # (existing)
│   └── watcher.js    # NEW — tails gamestate.jsonl, emits trigger events
└── logs/
    └── gamestate.jsonl
```

---

## Trigger Conditions (`core/watcher.js`)

Tails `logs/gamestate.jsonl` and emits a `trigger` event on any of:

| Trigger | Condition |
|---|---|
| Timer | Every 10 minutes regardless of state |
| Death | `health` reaches 0 in a log entry |
| Stuck | Same position (within 2 blocks) for 5 consecutive entries while `currentBehavior === "gather"` |

---

## Agent Loop (`agent.js`)

1. Spawn `bot.js` as a child process
2. Start `watcher.js` on `logs/gamestate.jsonl`
3. On trigger:
   - Kill the bot child process
   - Spawn OpenCode: `opencode run "Improve the Minecraft survival bot in [path]. Read logs/gamestate.jsonl for recent performance data and improve the behavior files to help it survive and gather resources better."`
   - Wait for OpenCode to exit
   - Restart the bot child process
4. Repeat

---

## OpenCode + MiniMax

OpenCode is configured by the user to use MiniMax as the underlying model. No separate LLM client or prompt builder is needed — OpenCode reads the logs and source files itself and decides what to change.
