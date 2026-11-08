class_name LSaciKit
extends LKit
## SACI-PERERÊ — mobilidade e confusão. Mecânica exclusiva: controle de trajetórias.
## Mudar de direção acumula Travessura; o Redemoinho deixa âncoras; a Suprema salta entre elas.

const MAX_STACKS := 4
const STACK_SPEED := 0.07

var stacks := 0
var _stack_timer := 0.0
var _gate := 0.0
var _last_dir := Vector2.ZERO
var tornado := 0.0
var fused := false
var _hits := {}
var decoy_id := -1
var _swap_timer := 0.0
var realm: LZone = null
var _blink_cd := 0.0

func is_tornado() -> bool:
    return tornado > 0.0

func realm_active() -> bool:
    return realm != null and realm.rem > 0.0

func speed_mult() -> float:
    return (1.0 + STACK_SPEED * stacks) * (1.75 if is_tornado() else 1.0)

func can_basic() -> bool:
    return not is_tornado()

func ignores_slows() -> bool:
    return is_tornado()

func damage_taken_mult() -> float:
    return 1.0 - 0.04 * stacks

func res_name() -> String:
    return "Travessura"

func res_value() -> float:
    return float(stacks)

func res_max() -> float:
    return float(MAX_STACKS)

func is_recast(slot: int) -> bool:
    return (slot == 2 and decoy_id >= 0) or (slot == 4 and realm_active())

func on_move_input(dir: Vector2) -> void:
    if dir.length_squared() < 0.25:
        return
    var d := dir.normalized()
    if _last_dir.length_squared() > 0.25 and _gate <= 0.0 and LMath.angle_between(_last_dir, d) > 50.0 * LMath.DEG:
        stacks = mini(MAX_STACKS, stacks + 1)
        _stack_timer = 2.0
        _gate = 0.25
    _last_dir = d

func tick() -> void:
    var dt := LSim.DT
    if _gate > 0.0:
        _gate -= dt
    if _stack_timer > 0.0:
        _stack_timer -= dt
        if _stack_timer <= 0.0:
            stacks = 0
    if _blink_cd > 0.0:
        _blink_cd -= dt
    if is_tornado():
        tornado -= dt
        for u in sim.enemies_in_radius(owner.pos, owner.radius + 1.2, owner.team):
            if _hits.has(u.id):
                continue
            _hits[u.id] = true
            sim.damage(owner, u, 70.0)
            var side := (u.pos - owner.pos).normalized()
            if side.length_squared() < 0.01:
                side = LMath.perp(owner.facing)
            u.push(side * 9.0, 0.25)
        if tornado <= 0.0:
            tornado = 0.0
            sim.add_zone("ancora", owner, owner.pos, 1.0, 12.0)
    if decoy_id >= 0:
        _swap_timer -= dt
        var d := sim.unit(decoy_id)
        if d == null or not d.alive:
            decoy_id = -1
        elif _swap_timer <= 0.0:
            _swap(d as LDecoy)
    if realm != null and realm.rem <= 0.0:
        realm = null

func try_recast(slot: int, aim: Vector2) -> bool:
    if slot == 2 and decoy_id >= 0:
        var d := sim.unit(decoy_id)
        # Troca antecipada só depois de 0,3 s, para evitar trocas instantâneas abusivas.
        if d != null and d.alive and _swap_timer <= 1.1:
            _swap(d as LDecoy)
            return true
        return false
    if slot == 4 and realm_active():
        if _blink_cd > 0.0:
            return false
        var best: LZone = null
        var best_d := INF
        for z in sim.zones:
            if z.owner_id != owner.id or z.kind != "ancora":
                continue
            if z.pos.distance_to(realm.pos) > realm.radius + 0.5:
                continue
            if z.pos.distance_to(owner.pos) < 1.5:
                continue
            var dd := z.pos.distance_to(aim)
            if dd < best_d:
                best_d = dd
                best = z
        if best == null:
            return false
        owner.pos = sim.resolve(best.pos, owner.radius)
        _blink_cd = 0.6
        for u in sim.enemies_in_radius(owner.pos, 3.0, owner.team):
            sim.damage(owner, u, 80.0)
        owner.count("saltos")
        sim.emit("blink", {"src": owner.id, "pos": owner.pos})
        return true
    return false

func cast(slot: int, aim: Vector2) -> bool:
    var dir := (aim - owner.pos).normalized()
    if dir.length_squared() < 0.01:
        dir = owner.facing
    match slot:
        1:
            tornado = 1.8
            fused = false
            _hits.clear()
            return true
        2:
            if decoy_id >= 0:
                return false
            var d := sim.add_decoy(owner, owner.pos, dir, sim.speed(owner), 2.2)
            decoy_id = d.id
            _swap_timer = 1.4
            return true
        3:
            var hit := sim.cone(owner.pos, dir, 9.0, 70.0, owner.team)
            for u in hit:
                sim.damage(owner, u, 35.0)
                if not u.alive:
                    continue
                u.push(dir * 13.0, 0.3)
                sim.apply_status(u, LStatus.VENT, 2.0, 3.2, owner, dir)
            sim.synergy.try_brasa(owner, owner.pos, dir, 9.0, hit)
            return true
        4:
            var center := sim.resolve(owner.pos + (aim - owner.pos).limit_length(8.0), 0.5)
            realm = sim.add_zone("reino", owner, center, 10.0, 7.0)
            for i in range(4):
                var p := sim.resolve(center + LMath.from_angle(i * PI * 0.5 + 0.4) * 6.0, 0.5)
                sim.add_zone("ancora", owner, p, 1.0, 7.0)
            sim.add_zone("ancora", owner, center, 1.0, 7.0)
            _blink_cd = 0.2
            return true
    return false

func _swap(d: LDecoy) -> void:
    var a := owner.pos
    owner.pos = sim.resolve(d.pos, owner.radius)
    d.pos = a
    d.life = minf(d.life, 0.8)
    decoy_id = -1
    sim.emit("swap", {"src": owner.id, "tgt": d.id, "pos": owner.pos})

func on_death() -> void:
    tornado = 0.0
    stacks = 0
    decoy_id = -1
    realm = null

func bot_use(ctx: LBotContext) -> void:
    var t := ctx.target
    if decoy_id >= 0 and owner.hp_frac() < 0.5:
        ctx.use(2, owner.pos)
        return
    if realm_active() and t != null and t.pos.distance_to(owner.pos) > 3.0:
        ctx.use(4, t.pos)
        return
    if t == null:
        return
    var dist := ctx.dist
    if ctx.ready(4) and dist < 9.0 and ctx.chance(0.15):
        ctx.use(4, t.pos)
        return
    if ctx.ready(3) and dist < 7.0 and ctx.chance(0.4):
        ctx.use(3, t.pos)
        return
    if ctx.ready(1) and dist < 6.0 and ctx.chance(0.35):
        ctx.use(1, t.pos)
        return
    if ctx.ready(2) and dist < 8.0 and ctx.chance(0.1):
        ctx.use(2, owner.pos + LMath.perp(t.pos - owner.pos).normalized() * 6.0)
    if is_tornado():
        ctx.move_towards(t.pos)
