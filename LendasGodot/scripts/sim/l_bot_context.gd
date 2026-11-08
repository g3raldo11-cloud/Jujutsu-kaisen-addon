class_name LBotContext
extends RefCounted
## Percepção e atuadores de um bot num instante de decisão (usado pelos kits).

var sim: LSim
var me: LChampion
var target: LUnit
var dist := 0.0
var used := false
var cmd: LCommand
var bot: LAllyBot

func ready(slot: int) -> bool:
    return not used and sim.can_cast(me, slot)

func use(slot: int, aim: Vector2) -> void:
    if used:
        return
    used = true
    cmd.pressed |= LCommand.SLOT_BTN[slot]
    cmd.aim = aim

func chance(p: float) -> bool:
    return randf() < p

func move_towards(p: Vector2) -> void:
    var d := p - me.pos
    bot.override_move = d.normalized() if d.length_squared() > 0.01 else Vector2.ZERO
    bot.has_override = true

func strafe(p: Vector2, bias: float) -> void:
    var to := (p - me.pos).normalized()
    bot.override_move = (LMath.perp(to) + to * bias).normalized()
    bot.has_override = true
