class_name LTrainingDummy
extends RefCounted
## Boneco de treino: entidade inimiga que nunca morre de verdade. Mede dano total, último golpe e DPS,
## volta à vida cheia após 4 s sem apanhar e pode andar de um lado para o outro.

class DummyKit extends LKit:
    func can_basic() -> bool:
        return false

var sim: LSim
var unit: LChampion
var home := Vector2.ZERO
var total := 0.0
var last_hit := 0.0
var dps := 0.0
var moving := false
var _win := 0.0
var _win_t := 0.0
var _since_hit := 999.0
var _clock := 0.0

func _init(p_sim: LSim, p_home: Vector2) -> void:
    sim = p_sim
    home = p_home
    unit = sim.add_champion(1, "saci", "Boneco de treino", false)
    # Sem passivas nem habilidades: medição de dano limpa.
    unit.kit = DummyKit.new()
    unit.kit.bind(sim, unit)
    unit.is_dummy = true
    unit.max_hp = 3000.0
    unit.hp = 3000.0
    unit.radius = 0.6
    unit.pos = p_home
    unit.facing = Vector2.LEFT

## Chamar depois de cada LSim.step(), com os eventos do tick ainda na lista.
func after_step() -> void:
    for e in sim.events:
        if e["type"] != "damage" or e["tgt"] != unit.id:
            continue
        var v := float(e["value"])
        total += v
        _win += v
        if v >= 1.0:
            last_hit = v
        _since_hit = 0.0
    _since_hit += LSim.DT
    _win_t += LSim.DT
    if _win_t >= 1.0:
        dps = _win / _win_t
        _win = 0.0
        _win_t = 0.0
    if not unit.alive or unit.hp < 1.0:
        unit.alive = true
        unit.hp = unit.max_hp
        unit.respawn = 0.0
        unit.pos = home
    if _since_hit > 4.0 and unit.hp < unit.max_hp:
        unit.hp = unit.max_hp
    var mv := Vector2.ZERO
    if moving:
        _clock += LSim.DT
        mv = Vector2(0.0, 1.0 if sin(_clock * 0.8) >= 0.0 else -1.0)
    elif unit.pos.distance_to(home) > 0.3 and unit.forced_time <= 0.0 and _since_hit > 2.0:
        mv = (home - unit.pos).normalized()  # volta ao lugar depois de empurrado
    var cmd := LCommand.new()
    cmd.move = mv
    cmd.aim = unit.pos + Vector2.LEFT
    sim.set_command(unit.id, cmd)

func reset() -> void:
    total = 0.0
    last_hit = 0.0
    dps = 0.0
    unit.hp = unit.max_hp
    unit.status.clear()
    unit.pos = home
