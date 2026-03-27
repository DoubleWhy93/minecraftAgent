# Changelog

## 2026-03-27 (session 5)

### behaviors/gather.js — Fix `isCave` false positive inside tree canopy (critical)
**Problem:** Spruce leaves have `boundingBox === 'block'` in mineflayer, so the bot standing inside a tree canopy at y:82 counted 5+ leaf blocks as "solid ceiling" and concluded it was underground. This caused `gatherWood` to call `surface()` every tick instead of mining the nearby tree. `surface()` pathfinds to `y + 20 = 102`, which fails through dense leaves, so the bot was permanently frozen. Confirmed in logs: 1,000+ consecutive entries at `{x:-101, y:82, z:-213}` surrounded only by `spruce_leaves` and `snow`, empty inventory, for 20+ minutes.
**Fix:** `isCave` now excludes blocks whose name contains `'leaves'` or whose name is `'snow'`/`'snow_block'` from the solid-block count. These are surface biome blocks, not cave ceiling indicators. After this fix, the bot correctly reads y:82 in a tree as "surface", calls `findBlock` for logs, and the pathfinder navigates there (breaking leaves as needed via `allowBreaking`).

---

### core/loop.js — Fix `unstick` to dig out before pathfinding
**Problem:** When physically trapped (inside a leaf canopy, a narrow cave, or any dense obstruction), `unstick` called `pathfinder.goto` with a random target. If the pathfinder can't navigate there due to the same obstruction, unstick does nothing — the bot detects stuck again 10 seconds later, unstick fails again, and the cycle repeats indefinitely.
**Fix:** Before pathfinding, `unstick` now iterates over 9 blocks immediately adjacent to the bot (above, all 4 horizontal, and 4 diagonal-above) and calls `bot.dig()` on any solid non-bedrock block it finds. This physically carves an opening around the bot so the subsequent pathfinder call has a navigable path. Digs are best-effort (errors ignored); pathfinding then proceeds as before.

---

### behaviors/smelt.js — Fix crash when bot has more coal than needed for smelting
**Problem:** When `fuelItem.count > coalNeeded`, the code built a partial-fuel object with `{ ...fuelItem, count: coalToUse }` — a plain JS object, not a mineflayer `Item` instance. `furnace.putFuel()` requires an actual inventory Item; passing a plain object caused a crash that silently aborted the entire smelt session and left raw iron un-smelted. This blocked iron tool progression since iron ingots were never produced.
**Fix:** Removed the partial-fuel logic entirely. `furnace.putFuel(fuelItem)` now loads the full coal stack. Coal is mined in 16-unit batches and is abundant enough that loading extra is not a concern; correctness is more important than coal conservation at this stage.

---

## 2026-03-27 (session 4)

### config.json — Reduce loopIntervalMs from 3000 to 1000
**Problem:** With a 3-second tick interval, there was a multi-second death window between `gather.act` being interrupted (pathfinder.stop fires on health ≤8) and the next tick running `survival.act`. Logs confirmed: health=7.33 in gather mode at 03:01:17, dead at 03:01:24 — exactly the 3-second gap.
**Fix:** Reduced loopIntervalMs to 1000ms. Survival now gets a chance to respond within 1 second of any other behavior completing.

---

### core/loop.js — Run survival immediately after any interrupted behavior
**Problem:** When a mob attacked during `gather.act` or `craft.act`, the pathfinder was stopped, the behavior returned, `running` was set to false — then up to 3 seconds passed before survival ran. A zombie deals ~2.5 damage every 1.5s, so 2 free hits in that window = ~5 damage, fatal from 7hp.
**Fix:** After each non-survival behavior (`craft`, `smelt`, `gather`) completes or is interrupted, the tick loop immediately re-checks `survival.canAct()` and runs `survival.act()` within the same tick. No wait for the next interval.

---

### behaviors/gather.js — Bail early when hostile mobs are nearby
**Problem:** `gather.act` would start long `pathfinder.goto` navigation even when hostile mobs were already within 16 blocks. By the time pathfinder.stop fired (health ≤8) and the behavior exited, significant health was already lost.
**Fix:** Added a `hostileNearby(bot)` check at the top of `act()`. If any hostile mob is within 16 blocks, gather returns immediately, letting the loop's post-behavior survival check engage combat without delay.

---

### behaviors/smelt.js — Smelt full batch instead of single output
**Problem:** `smeltBatch` waited for ANY output to appear (first item ready after ~10s), took it, and returned. With 20 raw_iron in the furnace, only 1 ingot was collected per `act()` call. The 30-second timeout was also too short for batches larger than 2-3 items.
**Fix:** Replaced the single-wait pattern with a loop that waits for each output item in turn until all input is smelted or a deadline is reached. Timeout is now dynamic: `max(20s, itemCount × 12s)`. Any output produced before an error is also safely taken in the `catch` block.

---

## 2026-03-27 (session 3)

### behaviors/survival.js — Always trigger survival on critical health (≤8 HP)
**Problem:** `canAct` only checked health when the bot had food or nearby mobs. At health=1.65 with food=20 and no food items and no visible mobs (e.g. after fall damage), survival never activated. Confirmed in logs line 131: health=1.65, behavior='gather', died 3 ticks later.

**Fix:** Added `if (bot.health <= 8) return true` as the very first check in `canAct`. Critical health always triggers survival regardless of food or mob visibility.

---

### behaviors/survival.js — Combat loop: attack repeatedly instead of once per tick
**Problem:** Each `act()` call did one `bot.attack()` then returned. With a 3-second tick interval, the bot attacked ~once every 3 seconds. A wooden sword deals ~4 damage/hit against a zombie's 20 HP, requiring 5 hits = 15 seconds of combat. The zombie attacks ~5 times in that window (3-4 damage each = 15-20 damage total), killing the bot.

**Fix:** Combat now runs a tight loop for up to 6 seconds: equip sword, approach mob if needed (non-blocking `setGoal`), attack every 500ms, break if mob is dead or health drops to ≤4. If health drops to ≤4 during combat, `needsFlee` is set and the bot immediately falls through to the flee routine.

---

### behaviors/survival.js — Flee after critical-health combat exit
**Problem:** When the combat loop broke due to critical health (`needsFlee = true`), the code fell out of the `if (!needsFlee)` branch and hit the outer `return` without executing the flee logic. The bot stood still after near-death combat.

**Fix:** Restructured the threat block: `needsFlee` is shared between the combat and flee sections. After the combat loop, if `needsFlee` is true the code falls through to the shared flee section instead of returning early.

---

### behaviors/craft.js — Batch-craft all wooden tools in one call
**Problem:** `craftWoodenTools` had early `return` after each crafting step (planks, table, sticks, pickaxe, sword). This meant one tool per tick. After the pickaxe was crafted underground and the bot moved to gather wood, `getTable` could no longer navigate to the placed table (it was underground), so `wooden_sword` was never crafted. Confirmed in logs: pickaxe crafted at line 65, but no wooden_sword until much later.

**Fix:** Removed all the incremental `return` statements. The function now: (1) converts up to 4 logs to planks, (2) crafts a crafting table if none exists nearby, (3) crafts sticks, (4) gets/places the table, then (5) crafts pickaxe, sword, and axe in sequence before returning. All tools are crafted in one `act()` call while the bot is still at the table.

---

### behaviors/gather.js — Always surface from caves when gathering wood
**Problem:** `gatherWood` only tried to surface if `!hasPickaxe(bot) && isCave(bot)`. A bot with a wooden pickaxe that fell into a cave would NOT surface — it would try to pathfind to tree logs through solid stone, fail silently, and loop. The pathfinder cannot reach treetops at y=68-80 from y=64 through stone even with `canDig` enabled because the target Y is far above.

**Fix:** Removed the `!hasPickaxe` guard. Now `gatherWood` always calls `surface()` when `isCave()` returns true, regardless of tool status.

---

### core/loop.js — Include 'survival' in stuck detection
**Problem:** `checkStuck` only tracked position history for 'gather' and 'craft' behaviors. When the bot was frozen in 'survival' mode for 20+ minutes underground, the in-loop stuck check never fired and `unstick()` was never called.

**Fix:** Changed the guard to `!['gather', 'craft', 'survival'].includes(behavior)` so `checkStuck` also applies to survival mode.

---

### core/loop.js — Fix underground unstick target Y
**Problem:** `unstick()` only raised the target Y when `pos.y < 62`. At y=64-69 (common underground positions), `ty` stayed at the bot's current Y, sending the pathfinder to a random lateral point inside solid stone — impossible to navigate to and useless for escaping.

**Fix:** Raised the threshold to `pos.y < 70` and increased the Y offset from +20 to +30. A bot at y=65 now aims for y=95, encouraging the pathfinder to plan an upward route through the cave system to the surface.

---

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
