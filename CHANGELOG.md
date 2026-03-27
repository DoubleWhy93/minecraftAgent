# Changelog

## 2026-03-27

### behaviors/survival.js — Eat rotten_flesh instead of starving
**Problem:** The bot collected `rotten_flesh` from zombie kills (confirmed in logs: `rotten_flesh:2` in inventory) but `FOOD_ITEMS` didn't include it. The bot would starve to death while holding a food source.

**Fix:** Added `rotten_flesh` at the end of `FOOD_ITEMS`. It's listed last so better food is always preferred first. Eating rotten flesh causes the Hunger effect, but that's far better than death by starvation.

---

### behaviors/survival.js — Fix forage infinite loop blocking all progress (critical)
**Problem:** When `food < 6` and no food items in inventory, `canAct()` returned `true`, `act()` called `forage()`, forage found no berry bushes and returned immediately, then `canAct()` was `true` again. This created an infinite no-op loop that kept the bot frozen at the same position for 18+ minutes (confirmed in logs: 00:37 to 00:56 same coordinates, same inventory, health slowly draining to 0). Gather and craft could never run.

**Fix:** Added a 30-second `forageCooldownUntil` timestamp. After `forage()` runs (regardless of success), `forageCooldownUntil` is set 30 s ahead. `canAct()` only triggers the food < 6 path if the cooldown has expired. During the cooldown, other behaviors (gather, craft) run freely.

---

### behaviors/survival.js — Increase mob detection radius from 12 to 16 blocks
**Problem:** Skeletons start shooting at ~16 blocks but `canAct()` only detected hostiles at 12 blocks. The bot would take arrow hits and creeper damage before survival mode activated.

**Fix:** Increased the detection radius in `canAct()` from 12 to 16 blocks, matching the radius already used in `act()`.

---

### behaviors/gather.js — Equip best tool before digging
**Problem:** `mineBlock()` navigated to the target block and called `bot.dig()` without equipping any tool. Logs with wooden pickaxe break 2× faster than bare hands; iron pickaxe breaks stone 12× faster. The bot was grinding slowly using whatever happened to be in its hand.

**Fix:** Added `equipBestTool()` which selects the optimal tool (axe for logs, pickaxe for stone/ore) from best to worst tier before every `bot.dig()` call.

---

### core/loop.js — Raise pathfinder-stop health threshold from ≤6 to ≤8
**Problem:** The emergency pathfinder stop (which interrupts blocking behaviors during combat) only triggered at ≤6 health (3 hearts). A skeleton volley or creeper explosion deals 8–12 damage, so the bot could go from safe to dead before the stop fired.

**Fix:** Raised the threshold to ≤8 (4 hearts), giving two extra hearts of buffer to exit the current behavior and hand control to survival.

---

## 2026-03-26

### behaviors/survival.js — Fix starvation loop
**Problem:** `canAct` returned `true` whenever `food < 18`, even if the bot had no food items in inventory. When hungry but foodless, `act` would try `forage()`, find no berry bushes, and return immediately. Next tick: same thing. The bot looped in `survival` mode for 20+ minutes doing nothing while starvation slowly drained its health to zero (observed in logs: health 16→12→8→4→0 over ~20 minutes at the same position).

**Fix:** `canAct` now only triggers eating when the bot actually *has food*, or when `food < 6` (true starvation danger). This frees the bot to craft/gather when hungry but foodless instead of spinning in a useless survival loop.

---

### behaviors/survival.js — Flee fallback with sprint
**Problem:** When pathfinder `goto` threw during a flee attempt, the error was silently swallowed and the bot froze in place while the mob continued attacking. Health would drop rapidly over subsequent ticks.

**Fix:** If pathfinder flee fails, fall back to direct movement controls: face the flee direction, then sprint+forward+jump for 2.5 s. Also increased flee distance from 24 → 32 blocks.

---

### behaviors/survival.js — Flee from creepers even when armed
**Problem:** The bot would approach and melee a creeper when holding a sword. Creepers explode at close range, dealing heavy damage.

**Fix:** Always flee from creepers regardless of whether the bot has a sword. Only engage in melee with non-creeper mobs.

---

### behaviors/survival.js — Larger forage search + explore fallback
**Problem:** `forage()` searched only 48 blocks for berry bushes. When none were found it printed a message and returned, causing repeated no-op ticks.

**Fix:** Extended search radius to 128 blocks. If still no bush is found, the bot now explores 32 blocks in a random direction instead of standing still, giving it a chance to find food or berry bushes nearby.

---

### behaviors/craft.js — Craft wooden sword before wooden axe
**Problem:** `craftWoodenTools` crafted wooden axe before wooden sword. The axe costs 3 planks + 2 sticks; the sword costs only 2 planks + 1 stick. The bot repeatedly died in melee with no combat capability because the cheaper, more critical item was last in the queue.

**Fix:** Swapped the order — wooden sword is now crafted immediately after the wooden pickaxe. Wooden axe is crafted last.

---

### core/loop.js — Health watcher aborts mid-behavior pathfinding
**Problem:** `craft.act` and `gather.act` block the tick loop for several seconds (pathfinding to crafting table, mining, etc.). When a mob attacked during this window, health could drop to zero before the next survival check ran.

**Fix:** Added a `bot.on('health')` handler in `loop.start`. Whenever health drops to ≤ 6 while a behavior is executing (`running === true`), `bot.pathfinder.stop()` is called. This causes the current `await pathfinder.goto(...)` to throw, the behavior exits via its catch block, and the next tick (3 s) runs survival with the bot in a safe state.

---

### core/watcher.js — Fix stuck detection never firing
**Problem:** `STUCK_THRESHOLD = 60` but `recentEntries` was capped at 20 entries. The check `this.recentEntries.length >= STUCK_THRESHOLD` could never be true (max 20 < 60). Stuck detection was completely broken.

**Fix:** Lowered `STUCK_THRESHOLD` to 20 (= 60 s at a 3 s loop interval) and updated the buffer cap to `STUCK_THRESHOLD` so they stay in sync.

---

### core/watcher.js — Detect stuck in survival and smelt, not just gather
**Problem:** Stuck detection only checked `currentBehavior === 'gather'`. The bot was stuck in `survival` mode at the same coordinates for 20+ minutes — this was never detected, so no improvement was triggered.

**Fix:** Stuck detection now fires for any behavior in `['gather', 'survival', 'smelt']` — all behaviors that require the bot to move around.
