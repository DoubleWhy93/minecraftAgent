# Minecraft Bot Goals

## Top Priority: Survival & Combat
The bot must stay alive above everything else. This means:
- Flee from hostile mobs when unarmed or low on health
- Craft weapons as early as possible (wooden sword → stone sword → iron sword → diamond sword)
- Once armed with a sword, fight back instead of fleeing
- Prioritize attacking the most dangerous nearby mob first
- Eat food before health drops too low
- Avoid falling, lava, and drowning
- If survival is at risk, drop all other tasks

## Progression
Once survival is stable, work through these stages in order:

1. Gather Wood — collect at least 12 logs
2. Craft Wooden Tools — wooden_pickaxe and wooden_axe
3. Gather Stone & Coal — 32 cobblestone and 16 coal
4. Craft Stone Tools — stone_pickaxe and stone_sword
5. Mine Iron Ore — at least 24 raw_iron
6. Smelt Iron — produce 16 iron_ingots using a furnace
7. Craft Iron Tools & Armor — iron_pickaxe, iron_sword, and at least 2 armor pieces
8. Mine Diamonds — at least 8 diamonds (target y=-55 for 1.18+, y=11 for older worlds)
9. Craft Diamond Tools — diamond_pickaxe and diamond_sword

Focus on whichever stage the bot is currently stuck on based on the log data.
