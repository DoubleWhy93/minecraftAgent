function canAct(bot) {
  return bot.food < 14 || bot.health < 6
}

async function act(bot) {
  if (bot.health < 6) {
    const mob = Object.values(bot.entities).find(e =>
      e.type === 'mob' && e.position.distanceTo(bot.entity.position) < 16
    )
    if (mob) {
      const away = bot.entity.position.plus(
        bot.entity.position.minus(mob.position).normalize().scale(10)
      )
      try {
        await bot.pathfinder.goto(new (require('mineflayer-pathfinder').goals.GoalXZ)(
          Math.round(away.x), Math.round(away.z)
        ))
      } catch (_) {}
    }
    return
  }

  if (bot.food < 14) {
    const food = bot.inventory.items().find(item =>
      item.name.includes('bread') ||
      item.name.includes('cooked') ||
      item.name.includes('apple') ||
      item.name.includes('beef') ||
      item.name.includes('chicken') ||
      item.name.includes('porkchop') ||
      item.name.includes('carrot') ||
      item.name.includes('potato') ||
      item.name.includes('melon')
    )
    if (food) {
      await bot.equip(food, 'hand')
      await bot.consume()
    } else {
      console.log('[survival] hungry but no food in inventory')
    }
  }
}

module.exports = { canAct, act }
