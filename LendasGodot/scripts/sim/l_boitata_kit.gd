class_name LBoitataKit
extends LKit
## BOITATÁ — serpente de fogo; dano em área e controle.
## Mecânica exclusiva: corpo segmentado. Cada segmento ocupa sua posição, bloqueia e (quente) queima.

const MAX_HEAT := 100.0
const BURNING_HEAT := 60.0
const SEGS := 7
const GIANT_SEGS := 12
const SPACING := 0.9
const SEG_RADIUS := 0.55

var heat := 0.0
var _trail: Array[Vector2] = []
var segments: Array[Vector2] = []
var _charge := 0.0
var _charge_t := 0.0
var _charge_dir := Vector2.RIGHT
var _charge_hits := {}
var _trail_t := 0.0
var _trail_drop := 0.0
var _giant := 0.0
var _wave := 0.0

func _on_bind() -> void:
    _reset_body()

func is_charging() -> bool:
    return _charge > 0.0

func trail_active() -> bool:
    return _trail_t > 0.0

func giant_form() -> bool:
    return _giant > 0.0

func speed_mult() -> float:
    return (1.35 if giant_form() else 1.0) * (1.15 if trail_active() else 1.0)

func damage_mult() -> float:
    return 1.0 + 0.2 * (heat / MAX_HEAT)

func radius_mult() -> float:
    return 1.5 if giant_form() else 1.0

func can_basic() -> bool:
    return not is_charging()

func res_name() -> String:
    return "Calor"

func res_value() -> float:
    return heat

func res_max() -> float:
    return MAX_HEAT

func _reset_body() -> void:
    _trail = [owner.pos]
    segments = []
    var n := GIANT_SEGS if giant_form() else SEGS
    for i in range(n):
        segments.append(owner.pos - owner.facing * SPACING * (i + 1))

func cast(slot: int, aim: Vector2) -> bool:
    var dir := (aim - owner.pos).normalized()
    if dir.length_squared() < 0.01:
        dir = owner.facing
    match slot:
        1:
            _charge_dir = dir
            _charge = 0.55
            _charge_t = 0.0
            _charge_hits.clear()
            heat = minf(MAX_HEAT, heat + 20.0)
            return true
        2:
            var blind := 3.0 if heat >= BURNING_HEAT else 2.2
            for u in sim.cone(owner.pos, dir, 8.0, 60.0, owner.team):
                sim.damage(owner, u, 25.0 * damage_mult())
                sim.apply_status(u, LStatus.OFUSC, blind, 1.0, owner)
                sim.apply_status(u, LStatus.LENT, 1.2, 0.3, owner)
            return true
        3:
            _trail_t = 4.0
            _trail_drop = 0.0
            return true
        4:
            _giant = 6.0
            _wave = 0.4
            heat = MAX_HEAT
            sim.apply_status(owner, LStatus.IMPAR, 6.0, 1.0, owner)
            owner.status.remove(LStatus.LENT)
            owner.status.remove(LStatus.RAIZ)
            owner.status.remove(LStatus.VENT)
            return true
    return false

func tick() -> void:
    var dt := LSim.DT
    var moving := owner.vel.length_squared() > 1.0 or owner.forced_time > 0.0
    if giant_form():
        heat = MAX_HEAT
    else:
        heat = clampf(heat + (14.0 if moving else -22.0) * dt, 0.0, MAX_HEAT)

    if is_charging():
        _charge_t += dt
        _charge -= dt
        # Linha serpenteante: oscilação lateral sobre a direção da investida.
        var lateral := LMath.perp(_charge_dir) * (cos(_charge_t * 18.0) * 6.0)
        owner.forced_vel = _charge_dir * (9.0 / 0.55) + lateral
        owner.forced_time = dt * 1.01
        for u in sim.enemies_in_radius(owner.pos, 1.6 * radius_mult(), owner.team):
            if _charge_hits.has(u.id):
                continue
            _charge_hits[u.id] = true
            sim.damage(owner, u, 70.0 * damage_mult())
            u.push((_charge_dir + (u.pos - owner.pos).normalized()).normalized() * 10.0, 0.25)

    if trail_active():
        _trail_t -= dt
        _trail_drop -= dt
        if _trail_drop <= 0.0:
            _trail_drop = 0.35
            var tail := segments[segments.size() - 1] if segments.size() > 0 else owner.pos
            sim.add_zone("fogo", owner, tail, 1.3, 3.5)

    if giant_form():
        _giant -= dt
        _wave -= dt
        if _wave <= 0.0:
            _wave = 0.8
            for u in sim.enemies_in_radius(owner.pos, 5.0, owner.team):
                sim.damage(owner, u, 42.0)
                sim.apply_status(u, LStatus.LENT, 1.0, 0.2, owner)
            sim.emit("wave", {"src": owner.id, "pos": owner.pos})

    _update_body()
    _body_collision()

## Os segmentos seguem o caminho percorrido pela cabeça.
func _update_body() -> void:
    if _trail.is_empty() or _trail[0].distance_to(owner.pos) > 0.15:
        _trail.insert(0, owner.pos)
    var count := GIANT_SEGS if giant_form() else SEGS
    var spacing := SPACING * radius_mult()
    while segments.size() < count:
        segments.append(segments[segments.size() - 1] if segments.size() > 0 else owner.pos)
    while segments.size() > count:
        segments.pop_back()
    var needed := spacing
    var seg := 0
    var acc := 0.0
    var prev := owner.pos
    for i in range(_trail.size()):
        if seg >= count:
            break
        var p := _trail[i]
        var d := prev.distance_to(p)
        while d > 0.0 and acc + d >= needed and seg < count:
            var t := (needed - acc) / d
            var point := prev.lerp(p, t)
            segments[seg] = point
            seg += 1
            d -= needed - acc
            prev = point
            acc = 0.0
            needed = spacing
        acc += d
        prev = p
    while seg < count:
        segments[seg] = segments[seg - 1] if seg > 0 else owner.pos
        seg += 1
    var max_len := spacing * (count + 2)
    var total := 0.0
    for i in range(1, _trail.size()):
        total += _trail[i - 1].distance_to(_trail[i])
        if total > max_len:
            _trail.resize(i + 1)
            break

## Colisão segmentada: o corpo empurra inimigos para o lado e, quente, os queima.
func _body_collision() -> void:
    var seg_r := SEG_RADIUS * radius_mult()
    var burning := heat >= BURNING_HEAT
    for c in sim.champions:
        if not c.alive or c.team == owner.team or c.is_air():
            continue
        if c.kit is LSaciKit and (c.kit as LSaciKit).is_tornado():
            continue  # o redemoinho passa por cima do corpo
        var cr := c.radius * c.kit.radius_mult()
        var touched := false
        for _pass in range(2):
            for i in range(segments.size()):
                var s := segments[i]
                var dv := c.pos - s
                var dist := dv.length()
                var min_d := seg_r + cr
                if dist >= min_d:
                    continue
                var n := dv / dist if dist > 1e-4 else LMath.perp(owner.facing)
                var along := (segments[i - 1] - s).normalized() if i > 0 else owner.facing
                var side := n - along * n.dot(along)
                n = side.normalized() if side.length_squared() > 0.01 else LMath.perp(along)
                var side_dist := (c.pos - s).dot(n)
                c.pos = sim.resolve(c.pos + n * (min_d - side_dist), cr)
                touched = true
        if touched and burning and sim.apply_status(c, LStatus.QUEIM, 1.0, 12.0, owner):
            owner.count("corpo")

func on_death() -> void:
    heat = 0.0
    _charge = 0.0
    _trail_t = 0.0
    _giant = 0.0

func on_respawn() -> void:
    _reset_body()

func bot_use(ctx: LBotContext) -> void:
    var t := ctx.target
    if t == null:
        return
    var dist := ctx.dist
    if ctx.ready(4) and dist < 4.0 and ctx.chance(0.15):
        ctx.use(4, t.pos)
        return
    if ctx.ready(2) and dist < 7.0 and ctx.chance(0.5):
        ctx.use(2, t.pos)
        return
    if ctx.ready(1) and dist > 3.0 and dist < 8.5 and ctx.chance(0.4):
        ctx.use(1, t.pos)
        return
    if ctx.ready(3) and dist < 6.0 and ctx.chance(0.4):
        ctx.use(3, t.pos)
    if dist < 2.5:
        ctx.strafe(t.pos, 0.6)
