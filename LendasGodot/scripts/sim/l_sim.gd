class_name LSim
extends RefCounted
## Simulação autoritativa da Arena de Teste — porte 1:1 do núcleo C# (LendasODespertar/Assets/Scripts/Core).
## Tick fixo de 30 Hz; mesmos números e regras da versão Unity.

const DT := 1.0 / 30.0
const ARENA_MIN := Vector2(-20.0, -20.0)
const ARENA_MAX := Vector2(20.0, 20.0)
const WATER_CENTER := Vector2(0.0, 12.0)
const WATER_RADIUS := 4.0
const BUSH_CENTER := Vector2(0.0, -12.0)
const BUSH_RADIUS := 3.5

var time := 0.0
var next_id := 1
var champions: Array[LChampion] = []
var decoys: Array[LDecoy] = []
var zones: Array[LZone] = []
## Eventos do tick para a apresentação: {"type", "src", "tgt", "pos", "value", "slot", "text"}
var events: Array[Dictionary] = []
var commands := {}
var bots := {}
## Arena de Teste: energia e Suprema infinitas, recargas 4x mais rápidas.
var infinite := true
var synergy: LSynergy

func _init() -> void:
    synergy = LSynergy.new()
    synergy.sim = self

## Quebra referências circulares (kits ↔ campeões ↔ simulação) ao descartar a arena.
func dispose() -> void:
    for c in champions:
        if c.kit != null:
            c.kit.unbind()
    for b in bots.values():
        b.sim = null
        b.me = null
    bots.clear()
    synergy.sim = null
    champions.clear()
    decoys.clear()
    zones.clear()

func new_id() -> int:
    next_id += 1
    return next_id - 1

func emit(type: String, data: Dictionary = {}) -> void:
    var e := {"type": type, "src": 0, "tgt": 0, "pos": Vector2.ZERO, "value": 0.0, "slot": 0, "text": ""}
    e.merge(data, true)
    events.append(e)

# ------------------------------------------------------------------ terreno

func terrain_at(p: Vector2) -> String:
    if p.distance_to(WATER_CENTER) <= WATER_RADIUS:
        return "agua"
    if p.distance_to(BUSH_CENTER) <= BUSH_RADIUS:
        return "mata"
    return "solo"

func clamp_pos(p: Vector2, r: float) -> Vector2:
    return Vector2(clampf(p.x, ARENA_MIN.x + r, ARENA_MAX.x - r), clampf(p.y, ARENA_MIN.y + r, ARENA_MAX.y - r))

func is_blocked(p: Vector2, r: float) -> bool:
    return p.x < ARENA_MIN.x + r or p.x > ARENA_MAX.x - r or p.y < ARENA_MIN.y + r or p.y > ARENA_MAX.y - r

# ------------------------------------------------------------------ montagem

func add_champion(team: int, char_id: String, p_name: String, bot: bool) -> LChampion:
    var st := LCharacters.stats(char_id)
    var c := LChampion.new(new_id(), team)
    c.name = p_name
    c.char_id = char_id
    c.stats = st
    c.is_bot = bot
    c.max_hp = st.max_hp
    c.hp = st.max_hp
    c.radius = st.radius
    c.facing = Vector2(1.0 if team == 0 else -1.0, 0.0)
    c.kit = LCharacters.kit(char_id)
    champions.append(c)
    c.kit.bind(self, c)
    if bot:
        bots[c.id] = LAllyBot.new(self, c)
    return c

func set_command(champion_id: int, cmd: LCommand) -> void:
    commands[champion_id] = cmd

# ------------------------------------------------------------------ laço principal

func step() -> void:
    time += DT
    for c in champions:
        if not c.alive:
            c.respawn -= DT
            if c.respawn <= 0.0:
                _revive(c)
            continue
        var cmd: LCommand
        if c.is_bot and bots.has(c.id):
            cmd = bots[c.id].think()
        elif commands.has(c.id):
            cmd = commands[c.id]
        else:
            cmd = LCommand.new()
        _timers(c)
        _process(c, cmd)
        c.kit.tick()
        if not c.is_bot:
            cmd.pressed = 0  # botões valem só no tick em que chegam
    for c in champions:
        _tick_unit_status(c)
    _integrate()
    _tick_zones()
    _tick_decoys()
    synergy.tick()

func _timers(c: LChampion) -> void:
    for s in range(5):
        if c.cd[s] > 0.0:
            c.cd[s] -= DT
    if c.dodge_cd > 0.0:
        c.dodge_cd -= DT
    if c.jump_cd > 0.0:
        c.jump_cd -= DT
    if c.cast_lock > 0.0:
        c.cast_lock -= DT
    c.since_damaged += DT
    c.since_attack += DT
    c.energy = minf(c.max_energy, c.energy + c.stats.regen * DT)
    c.ult = minf(100.0, c.ult + DT)
    if infinite:
        c.energy = c.max_energy
        c.ult = 100.0

func _process(c: LChampion, cmd: LCommand) -> void:
    var to_aim := cmd.aim - c.pos
    if to_aim.length_squared() > 0.04 and c.can_act():
        c.facing = to_aim.normalized()
    for s in range(1, 5):
        if cmd.pressed & LCommand.SLOT_BTN[s]:
            try_cast(c, s, cmd.aim)
    if cmd.pressed & LCommand.DODGE:
        _dodge(c, cmd.move)
    if cmd.pressed & LCommand.JUMP:
        _jump(c)
    if cmd.attack:
        _basic(c)
    var mv := cmd.move.limit_length(1.0)
    c.kit.on_move_input(mv)
    var wants := cmd.sprint and mv.length_squared() > 0.01 and c.stamina > 1.0
    c.sprinting = wants and c.can_move()
    if c.sprinting:
        c.stamina = maxf(0.0, c.stamina - 22.0 * DT)
    else:
        c.stamina = minf(100.0, c.stamina + 14.0 * DT)
    c.vel = mv * speed(c) if c.can_move() else Vector2.ZERO
    var w := c.status.find(LStatus.VENT)
    if not w.is_empty() and not c.status.has(LStatus.IMPAR):
        c.vel += (w["dir"] as Vector2) * float(w["mag"])

func speed(c: LChampion) -> float:
    var s := c.stats.speed * c.kit.speed_mult()
    if terrain_at(c.pos) == "agua" and not c.is_air():
        s *= 1.2 if c.kit.aquatic() else 0.8
    if not c.kit.ignores_slows() and not c.status.has(LStatus.IMPAR):
        s *= 1.0 - clampf(c.status.mag(LStatus.LENT), 0.0, 0.8)
    s *= 1.0 + c.status.mag(LStatus.PRESSA)
    if c.sprinting:
        s *= 1.3
    return s

func can_cast(c: LChampion, slot: int) -> bool:
    if not c.can_act():
        return false
    if slot < 0 or slot >= c.stats.abilities.size():
        return false
    var a := c.stats.abilities[slot]
    if c.cd[slot] > 0.0 or c.energy < a.cost:
        return false
    if slot == 4 and c.ult < 100.0:
        return false
    return true

func try_cast(c: LChampion, slot: int, aim: Vector2) -> bool:
    if not c.alive:
        return false
    if c.can_act() and c.kit.try_recast(slot, aim):
        emit("recast", {"src": c.id, "slot": slot, "text": c.stats.abilities[slot].name, "pos": c.pos})
        return true
    if not can_cast(c, slot):
        return false
    var a := c.stats.abilities[slot]
    if not c.kit.cast(slot, aim):
        return false
    c.cd[slot] = a.cd * 0.25 if infinite else a.cd
    c.energy -= a.cost
    if slot == 4:
        c.ult = 0.0
    c.since_attack = 0.0
    emit("cast", {"src": c.id, "slot": slot, "text": a.name, "pos": c.pos})
    return true

func _dodge(c: LChampion, move: Vector2) -> void:
    if c.dodge_cd > 0.0 or not c.can_move():
        return
    var d := move.normalized() if move.length_squared() > 0.01 else c.facing
    c.forced_vel = d * (5.0 / 0.2)
    c.forced_time = 0.2
    c.invuln = 0.25
    c.dodge_cd = 4.5
    emit("dodge", {"src": c.id, "pos": c.pos})

func _jump(c: LChampion) -> void:
    if c.jump_cd > 0.0 or c.is_air() or not c.can_move():
        return
    c.airborne = 0.65
    c.jump_cd = 1.2
    emit("jump", {"src": c.id, "pos": c.pos})

func _basic(c: LChampion) -> void:
    if not c.can_act() or not c.kit.can_basic() or c.cd[0] > 0.0:
        return
    c.cd[0] = c.stats.basic_interval
    c.since_attack = 0.0
    emit("basic", {"src": c.id, "pos": c.pos})
    if c.status.has(LStatus.OFUSC):
        emit("miss", {"src": c.id, "pos": c.pos})
        return
    for u in cone(c.pos, c.facing, c.stats.basic_range * c.kit.radius_mult(), c.stats.basic_arc, c.team):
        damage(c, u, c.stats.basic_damage * c.kit.damage_mult())
        c.kit.on_basic_hit(u)

# ------------------------------------------------------------------ dano e controle

func damage(src: LChampion, target: LUnit, amount: float) -> float:
    if target == null or not target.targetable() or amount <= 0.0:
        return 0.0
    if src != null and src.team == target.team:
        return 0.0
    if target is LDecoy:
        kill_decoy(target as LDecoy, src)
        return 0.0
    if target is LChampion:
        amount *= (target as LChampion).kit.damage_taken_mult()
    var rem := target.status.absorb(amount)
    var dealt := minf(target.hp, rem)
    target.hp -= rem
    if src != null:
        src.damage_dealt += dealt
        src.ult = minf(100.0, src.ult + dealt * 0.05)
        src.since_attack = 0.0
    if target is LChampion:
        (target as LChampion).since_damaged = 0.0
    emit("damage", {"src": src.id if src != null else 0, "tgt": target.id, "pos": target.pos, "value": amount})
    if target.hp <= 0.0 and target is LChampion:
        _kill(target as LChampion, src)
    return amount

func apply_status(target: LUnit, type: String, dur: float, m: float, src: LChampion, dir: Vector2 = Vector2.ZERO) -> bool:
    if target == null or not target.alive:
        return false
    var hostile := type != LStatus.ESCUDO and type != LStatus.PRESSA and type != LStatus.IMPAR
    if hostile:
        if target.invuln > 0.0:
            return false
        if type != LStatus.QUEIM and target.status.has(LStatus.IMPAR):
            return false
        if src != null and src.team == target.team:
            return false
    var ok := target.status.apply(type, dur, m, src.id if src != null else 0, dir)
    if ok and type == LStatus.ATORD and target is LChampion and (target as LChampion).cast_lock > 0.0:
        (target as LChampion).cast_lock = 0.0
        emit("interrupt", {"tgt": target.id})
    return ok

func _kill(dead: LChampion, killer: LChampion) -> void:
    dead.alive = false
    dead.hp = 0.0
    dead.vel = Vector2.ZERO
    dead.forced_time = 0.0
    dead.status.clear()
    dead.respawn = 3.0
    dead.kit.on_death()
    emit("death", {"src": killer.id if killer != null else 0, "tgt": dead.id, "pos": dead.pos})

func _revive(c: LChampion) -> void:
    c.alive = true
    c.hp = c.max_hp
    c.energy = c.max_energy
    c.pos = Vector2(-6.0, 0.0)
    c.forced_time = 0.0
    c.invuln = 1.5
    c.status.clear()
    c.kit.on_respawn()

func kill_decoy(d: LDecoy, src: LChampion) -> void:
    if not d.alive:
        return
    d.alive = false
    emit("decoy_broken", {"src": src.id if src != null else 0, "tgt": d.id, "pos": d.pos})

func _tick_unit_status(u: LUnit) -> void:
    if not u.alive:
        return
    if u.invuln > 0.0:
        u.invuln -= DT
    if u.airborne > 0.0:
        u.airborne -= DT
    var burn := u.status.find(LStatus.QUEIM)
    if not burn.is_empty() and u.invuln <= 0.0:
        damage(champion(int(burn["src"])), u, float(burn["mag"]) * DT)
    u.status.tick(DT)

# ------------------------------------------------------------------ movimento

func _integrate() -> void:
    for c in champions:
        if c.alive:
            move_unit(c)
    for i in range(champions.size()):
        var a := champions[i]
        if not a.alive:
            continue
        for j in range(i + 1, champions.size()):
            var b := champions[j]
            if not b.alive or a.is_air() or b.is_air():
                continue
            var ra := a.radius * a.kit.radius_mult()
            var rb := b.radius * b.kit.radius_mult()
            var d := b.pos - a.pos
            var dist := d.length()
            var min_d := (ra + rb) * 0.9
            if dist >= min_d or dist < 1e-4:
                continue
            var n := d / dist
            var p := (min_d - dist) * 0.5
            a.pos = clamp_pos(a.pos - n * p, ra)
            b.pos = clamp_pos(b.pos + n * p, rb)

func move_unit(u: LUnit) -> void:
    var step_v: Vector2
    if u.forced_time > 0.0:
        step_v = u.forced_vel * DT
        u.forced_time -= DT
    else:
        step_v = u.vel * DT
    u.pos = clamp_pos(u.pos + step_v, u.radius * u.radius_mult())
    if not (u is LChampion) and step_v.length_squared() > 1e-6 and u.forced_time <= 0.0:
        u.facing = step_v.normalized()

func resolve(p: Vector2, r: float) -> Vector2:
    return clamp_pos(p, r)

# ------------------------------------------------------------------ zonas e ilusões

func add_zone(kind: String, owner: LChampion, p: Vector2, r: float, duration: float, follow_id: int = -1) -> LZone:
    var z := LZone.new()
    z.id = new_id()
    z.kind = kind
    z.owner_id = owner.id if owner != null else 0
    z.team = owner.team if owner != null else -1
    z.pos = p
    z.radius = r
    z.rem = duration
    z.dur = duration
    z.follow_id = follow_id
    zones.append(z)
    return z

func _tick_zones() -> void:
    var i := zones.size() - 1
    while i >= 0:
        var z := zones[i]
        z.rem -= DT
        if z.follow_id >= 0:
            var f := unit(z.follow_id)
            if f != null and f.alive:
                z.pos = f.pos
        var owner := champion(z.owner_id)
        match z.kind:
            "fogo":
                z.tick_timer -= DT
                if z.tick_timer <= 0.0:
                    z.tick_timer = 0.25
                    for u in enemies_in_radius(z.pos, z.radius, z.team):
                        if not u.is_air():
                            damage(owner, u, 24.0 * 0.25)
            "reino":
                for u in enemies_in_radius(z.pos, z.radius, z.team):
                    apply_status(u, LStatus.LENT, 0.3, 0.25, owner)
            "tempestade":
                for u in enemies_in_radius(z.pos, z.radius, z.team):
                    damage(owner, u, 45.0 * DT)
                    if not u.status.has(LStatus.IMPAR):
                        var to := z.pos - u.pos
                        if to.length_squared() > 0.25:
                            u.pos = resolve(u.pos + to.normalized() * 2.5 * DT, u.radius)
            "pegada":
                if z.rem <= 0.0:
                    var dmg := 50.0 * z.power
                    for u in enemies_in_radius(z.pos, z.radius, z.team):
                        if u.is_air():
                            continue
                        damage(owner, u, dmg)
                        if z.power >= LCurupiraKit.HOT_POWER:
                            apply_status(u, LStatus.QUEIM, 2.0, 20.0, owner)
                    emit("explode", {"src": z.owner_id, "pos": z.pos, "value": z.radius})
            "circulo":
                for u in enemies_in_radius(z.pos, z.radius + 1.0, z.team):
                    var d := u.pos.distance_to(z.pos)
                    if absf(d - z.radius) > 0.9:
                        continue
                    damage(owner, u, 40.0 * z.power * DT)
                    if not u.status.has(LStatus.IMPAR):
                        var out := (u.pos - z.pos) / d if d > 0.01 else Vector2.RIGHT
                        u.pos = resolve(z.pos + out * (z.radius + 1.0), u.radius)
            "ira":
                for u in enemies_in_radius(z.pos, z.radius, z.team):
                    if not u.is_air():
                        damage(owner, u, 20.0 * DT)
        if z.rem <= 0.0:
            zones.remove_at(i)
        i -= 1

func add_decoy(owner: LChampion, p: Vector2, dir: Vector2, spd: float, life: float) -> LDecoy:
    var d := LDecoy.new(new_id(), owner.team)
    d.owner_id = owner.id
    d.char_id = owner.char_id
    d.pos = p
    d.facing = dir.normalized() if dir.length_squared() > 0.01 else owner.facing
    d.radius = owner.radius
    d.max_hp = owner.max_hp
    d.hp = owner.hp
    d.speed = spd
    d.life = life
    d.vel = d.facing * spd
    decoys.append(d)
    return d

func _tick_decoys() -> void:
    var i := decoys.size() - 1
    while i >= 0:
        var d := decoys[i]
        d.life -= DT
        if d.alive:
            d.vel = d.facing * d.speed
            move_unit(d)
        if d.life <= 0.0:
            d.alive = false
        if not d.alive:
            decoys.remove_at(i)
        i -= 1

# ------------------------------------------------------------------ consultas

func unit(uid: int) -> LUnit:
    for c in champions:
        if c.id == uid:
            return c
    for d in decoys:
        if d.id == uid:
            return d
    return null

func champion(uid: int) -> LChampion:
    if uid <= 0:
        return null
    for c in champions:
        if c.id == uid:
            return c
    return null

func hostiles(team: int) -> Array[LUnit]:
    var out: Array[LUnit] = []
    for c in champions:
        if c.alive and c.team != team:
            out.append(c)
    for d in decoys:
        if d.alive and d.team != team:
            out.append(d)
    return out

func enemies_in_radius(center: Vector2, r: float, team: int) -> Array[LUnit]:
    var out: Array[LUnit] = []
    for u in hostiles(team):
        if u.pos.distance_to(center) <= r + u.radius:
            out.append(u)
    return out

func cone(origin: Vector2, dir: Vector2, reach: float, arc_deg: float, team: int) -> Array[LUnit]:
    var half := arc_deg * 0.5 * LMath.DEG
    var out: Array[LUnit] = []
    for u in hostiles(team):
        var to := u.pos - origin
        var d := to.length()
        if d > reach + u.radius:
            continue
        if d > u.radius + 0.3 and LMath.angle_between(dir, to) > half:
            continue
        out.append(u)
    return out
