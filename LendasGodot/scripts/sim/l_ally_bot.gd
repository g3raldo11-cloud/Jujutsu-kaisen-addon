class_name LAllyBot
extends RefCounted
## Aliado controlado pelo computador: escolhe o alvo mais próximo, mantém distância de ataque
## e usa as habilidades pela mesma lógica de bot de cada kit (para testar Ressonâncias).

var sim: LSim
var me: LChampion
var target: LUnit
var override_move := Vector2.ZERO
var has_override := false
var _timer := 0.0
var _cmd := LCommand.new()

func _init(p_sim: LSim, p_me: LChampion) -> void:
    sim = p_sim
    me = p_me

func think() -> LCommand:
    _timer -= LSim.DT
    if _timer <= 0.0:
        _timer = 0.3
        has_override = false
        var best: LUnit = null
        var best_d := INF
        for f in sim.hostiles(me.team):
            var d := f.pos.distance_to(me.pos)
            if d < best_d:
                best_d = d
                best = f
        target = best
        var cmd := LCommand.new()
        cmd.aim = best.pos if best != null else me.pos + me.facing * 3.0
        var ctx := LBotContext.new()
        ctx.sim = sim
        ctx.me = me
        ctx.target = best
        ctx.dist = best_d if best != null else 0.0
        ctx.cmd = cmd
        ctx.bot = self
        me.kit.bot_use(ctx)
        _cmd = cmd
    else:
        _cmd = _cmd.duplicate_cmd()
        _cmd.pressed = 0
    var t := target
    if t != null and t.alive:
        var reach := me.stats.basic_range * me.kit.radius_mult() + t.radius
        var d := t.pos.distance_to(me.pos)
        if _cmd.pressed == 0:
            _cmd.aim = t.pos
        _cmd.attack = d <= reach
        if has_override:
            _cmd.move = override_move
        else:
            var keep := t.pos + (me.pos - t.pos).normalized() * (me.stats.basic_range * 0.7)
            var to := keep - me.pos
            _cmd.move = to.normalized() if to.length() > 0.4 else Vector2.ZERO
    return _cmd
