class_name LCurupiraKit
extends LKit
## CURUPIRA (versão de fogo) — especialista em fogo, mobilidade e domínio de território.
## Domínio Térmico: acertos geram Calor; Calor aumenta chamas, raio do círculo, dano das pegadas
## e da Suprema; acima de 60 tudo incendeia. Na Suprema as labaredas seguem a mira.

const MAX_HEAT := 100.0
const HOT := 60.0
const HOT_POWER := 1.3
const FLAME_SPEED := 15.0
const FLAME_RANGE := 12.0

var heat := 0.0
var _since_gain := 999.0
## Chamas Invertidas em voo: {"origin", "dir", "pos", "traveled", "phase", "alive", "hot"}
var flames: Array = []
var _to_fire := 0
var _flame_timer := 0.0
var _flame_dir := Vector2.RIGHT
var _dash_t := 0.0
var _dash_dir := Vector2.RIGHT
var _step_acc := 0.0
var wrath: LZone = null
var _jet_timer := 0.0
var jet_dir := Vector2.RIGHT

func is_hot() -> bool:
    return heat >= HOT

## Potência térmica: 1,0 (frio) até 1,5 (Calor máximo).
func power() -> float:
    return 1.0 + 0.5 * (heat / MAX_HEAT)

func is_dashing() -> bool:
    return _dash_t > 0.0

func wrath_active() -> bool:
    return wrath != null and wrath.rem > 0.0

func speed_mult() -> float:
    return 1.1 if is_hot() else 1.0

func can_basic() -> bool:
    return not is_dashing()

func res_name() -> String:
    return "Calor"

func res_value() -> float:
    return heat

func res_max() -> float:
    return MAX_HEAT

func _gain(a: float) -> void:
    heat = minf(MAX_HEAT, heat + a)
    _since_gain = 0.0

func _ability_hit(u: LUnit) -> void:
    _gain(6.0)
    if is_hot():
        sim.apply_status(u, LStatus.QUEIM, 2.0, 20.0, owner)

func on_basic_hit(t: LUnit) -> void:
    _gain(12.0)
    if is_hot():
        sim.apply_status(t, LStatus.QUEIM, 1.5, 15.0, owner)

func cast(slot: int, aim: Vector2) -> bool:
    var dir := (aim - owner.pos).normalized()
    if dir.length_squared() < 0.01:
        dir = owner.facing
    match slot:
        1:
            _to_fire = 3 + int(heat / 33.0)
            _flame_timer = 0.0
            _flame_dir = dir
            return true
        2:
            _dash_dir = dir
            _dash_t = 0.4
            _step_acc = 0.6
            owner.invuln = maxf(owner.invuln, 0.1)
            return true
        3:
            var center := owner.pos + (aim - owner.pos).limit_length(8.0)
            var z := sim.add_zone("circulo", owner, center, 4.5 + 1.5 * (heat / MAX_HEAT), 5.0)
            z.power = power()
            return true
        4:
            var dmg := 120.0 * power()
            for u in sim.enemies_in_radius(owner.pos, 7.0, owner.team):
                sim.damage(owner, u, dmg)
                u.push((u.pos - owner.pos).normalized() * 10.0, 0.3)
                _ability_hit(u)
            wrath = sim.add_zone("ira", owner, owner.pos, 9.0, 5.0)
            wrath.power = power()
            _jet_timer = 0.3
            jet_dir = owner.facing
            _gain(30.0)
            sim.emit("wrath", {"src": owner.id, "pos": owner.pos})
            return true
    return false

func tick() -> void:
    var dt := LSim.DT
    _since_gain += dt
    if _since_gain > 3.0:
        heat = maxf(0.0, heat - 10.0 * dt)

    # Chamas Invertidas: uma a cada 0,12 s, partindo da posição atual.
    if _to_fire > 0:
        _flame_timer -= dt
        if _flame_timer <= 0.0:
            _flame_timer = 0.12
            flames.append({"origin": owner.pos, "dir": _flame_dir, "pos": owner.pos, "traveled": 0.0,
                "phase": 0.0 if _to_fire % 2 == 0 else PI, "alive": true, "hot": is_hot()})
            _to_fire -= 1
    var i := flames.size() - 1
    while i >= 0:
        var f: Dictionary = flames[i]
        if not f["alive"]:
            flames.remove_at(i)
            i -= 1
            continue
        f["traveled"] = float(f["traveled"]) + FLAME_SPEED * dt
        var fd: Vector2 = f["dir"]
        var lateral := sin(float(f["traveled"]) * 0.9 + float(f["phase"])) * 1.4
        f["pos"] = (f["origin"] as Vector2) + fd * float(f["traveled"]) + LMath.perp(fd) * lateral
        if float(f["traveled"]) >= FLAME_RANGE or sim.is_blocked(f["pos"], 0.1):
            f["alive"] = false
            i -= 1
            continue
        var hit: LUnit = null
        for u in sim.hostiles(owner.team):
            if u.targetable() and u.pos.distance_to(f["pos"]) <= u.radius + 0.5:
                hit = u
                break
        if hit != null:
            sim.damage(owner, hit, 40.0)
            if hit.alive:
                _ability_hit(hit)
            sim.emit("projectile_hit", {"src": owner.id, "tgt": hit.id, "pos": f["pos"]})
            f["alive"] = false
        i -= 1

    if is_dashing():
        _dash_t -= dt
        owner.forced_vel = _dash_dir * (7.0 / 0.4)
        owner.forced_time = dt * 1.01
        _step_acc += (7.0 / 0.4) * dt
        if _step_acc >= 1.2:
            _step_acc = 0.0
            var z := sim.add_zone("pegada", owner, owner.pos, 2.0, 1.5)
            z.power = power()
            z.angle = atan2(_dash_dir.x, _dash_dir.y)

    if wrath_active():
        jet_dir = owner.facing  # Domínio Térmico: as labaredas seguem a mira
        _jet_timer -= dt
        if _jet_timer <= 0.0:
            _jet_timer = 0.5
            var a := wrath.pos
            var b := a + jet_dir * wrath.radius
            for u in sim.enemies_in_radius(a.lerp(b, 0.5), wrath.radius * 0.6, owner.team):
                if LMath.dist_to_segment(u.pos, a, b) > 1.5 + u.radius:
                    continue
                sim.damage(owner, u, 35.0 * wrath.power)
                _ability_hit(u)
            sim.emit("jet", {"src": owner.id, "pos": a})
    else:
        wrath = null

func on_death() -> void:
    heat = 0.0
    flames.clear()
    _to_fire = 0
    _dash_t = 0.0
    wrath = null

func bot_use(ctx: LBotContext) -> void:
    var t := ctx.target
    if wrath_active() and t != null:
        ctx.move_towards(t.pos)
        return
    if t == null:
        return
    var dist := ctx.dist
    if ctx.ready(4) and dist < 5.5 and is_hot() and ctx.chance(0.2):
        ctx.use(4, t.pos)
        return
    if ctx.ready(1) and dist < 10.0 and ctx.chance(0.5):
        ctx.use(1, t.pos)
        return
    if ctx.ready(3) and dist < 7.0 and ctx.chance(0.25):
        ctx.use(3, t.pos)
        return
    if ctx.ready(2) and dist > 3.0 and dist < 8.0 and ctx.chance(0.35):
        ctx.use(2, t.pos)
