class_name LUnitView
extends Node3D
## Base da apresentação de uma unidade: a simulação decide; a vista interpola, anima e mostra status.

var unit: LUnit
var model: Node3D
var anim_time := 0.0
var last_hit := -10.0
var _burn: CPUParticles3D
var _wind: CPUParticles3D
var _slow_ring: MeshInstance3D
var _blind: MeshInstance3D

func head_height() -> float:
    return 1.6

static func now() -> float:
    return Time.get_ticks_msec() / 1000.0

func bind(u: LUnit) -> void:
    unit = u
    name = "Unidade_%d" % u.id
    model = Node3D.new()
    model.name = "Modelo"
    add_child(model)
    _build()
    _build_status_fx()
    position = LMath.to_world(u.pos)
    rotation.y = LMath.facing_yaw(u.facing)

func _build() -> void:
    pass

func _build_status_fx() -> void:
    _burn = LFx.fire(self, 0.35, 24)
    _burn.position = Vector3(0, 0.8, 0)
    _burn.emitting = false
    _wind = LFx.swirl(self, 0.6, 1.2, Color(0.85, 0.95, 1.0, 0.8), 40)
    _wind.emitting = false
    _slow_ring = LMat.disc(self, 0.9, LMat.transparent(Color(0.3, 0.6, 1.0, 0.35)), 0.03)
    _slow_ring.visible = false
    _blind = LMat.part(self, LMat.sphere(0.3), Vector3(0, head_height(), 0), LMat.glow(Color(1.0, 0.95, 0.6, 0.45)))
    _blind.visible = false

func on_hit() -> void:
    last_hit = now()

func on_basic_attack() -> void:
    pass

## Tremida curta ao receber dano.
func hit_shake() -> Vector3:
    var k := clampf(1.0 - (now() - last_hit) / 0.2, 0.0, 1.0)
    if k <= 0.0:
        return Vector3.ZERO
    var t := now()
    return Vector3(sin(t * 90.0), 0.0, cos(t * 70.0)) * 0.06 * k

func sync_view(dt: float) -> void:
    if unit == null:
        return
    anim_time += dt
    var h := 0.0
    if unit.is_air():
        h = sin(clampf(1.0 - unit.airborne / 0.65, 0.0, 1.0) * PI) * 1.2
    var target := LMath.to_world(unit.pos, h)
    position = position.lerp(target, 1.0 - exp(-dt * 25.0))
    if position.distance_squared_to(target) > 9.0:
        position = target  # teleporte (troca, salto entre redemoinhos)
    rotation.y = lerp_angle(rotation.y, LMath.facing_yaw(unit.facing), 1.0 - exp(-dt * 14.0))
    var st := unit.status
    _burn.emitting = st.has(LStatus.QUEIM)
    _wind.emitting = st.has(LStatus.VENT)
    _slow_ring.visible = st.has(LStatus.LENT)
    _blind.visible = st.has(LStatus.OFUSC)
    if _blind.visible:
        _blind.scale = Vector3.ONE * (1.0 + sin(anim_time * 10.0) * 0.15)
    visible = unit.alive
