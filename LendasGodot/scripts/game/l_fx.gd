class_name LFx
extends RefCounted
## Efeitos de partículas procedurais (CPUParticles3D funciona em qualquer placa de vídeo).

static func _base(parent: Node3D, amount: int, life: float, additive: bool) -> CPUParticles3D:
    var p := CPUParticles3D.new()
    p.amount = amount
    p.lifetime = life
    var q := QuadMesh.new()
    q.size = Vector2(0.5, 0.5)
    p.mesh = q
    p.material_override = LMat.particle(additive)
    p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
    parent.add_child(p)
    return p

static func _gradient(c1: Color, c2: Color, start_a: float = 0.95) -> Gradient:
    var g := Gradient.new()
    g.set_color(0, Color(c1.r, c1.g, c1.b, start_a))
    g.set_color(1, Color(c2.r, c2.g, c2.b, 0.0))
    return g

static func _shrink() -> Curve:
    var c := Curve.new()
    c.add_point(Vector2(0.0, 1.0))
    c.add_point(Vector2(1.0, 0.15))
    return c

## Chamas contínuas (corpo do Boitatá, cabelo do Curupira, rastro de fogo).
static func fire(parent: Node3D, radius: float, amount: int, c1: Color = Color(1.0, 0.75, 0.25), c2: Color = Color(1.0, 0.18, 0.02)) -> CPUParticles3D:
    var p := _base(parent, amount, 0.7, true)
    p.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
    p.emission_sphere_radius = radius
    p.direction = Vector3.UP
    p.spread = 25.0
    p.initial_velocity_min = 0.4
    p.initial_velocity_max = 1.6
    p.gravity = Vector3(0, 1.6, 0)
    p.scale_amount_min = 0.5
    p.scale_amount_max = 1.2
    p.scale_amount_curve = _shrink()
    p.color_ramp = _gradient(c1, c2)
    return p

## Redemoinho: partículas em anel, em coordenadas locais; o nó-pai gira (LSpin).
static func swirl(parent: Node3D, radius: float, height: float, color: Color, amount: int = 60, spin_speed: float = 7.0) -> CPUParticles3D:
    var spinner := LSpin.new()
    spinner.speed = spin_speed
    parent.add_child(spinner)
    var p := _base(spinner, amount, 1.0, false)
    p.local_coords = true
    p.emission_shape = CPUParticles3D.EMISSION_SHAPE_RING
    p.emission_ring_axis = Vector3.UP
    p.emission_ring_radius = radius
    p.emission_ring_inner_radius = radius * 0.6
    p.emission_ring_height = 0.1
    p.direction = Vector3.UP
    p.spread = 8.0
    p.initial_velocity_min = height * 0.7
    p.initial_velocity_max = height
    p.gravity = Vector3.ZERO
    p.scale_amount_min = 0.25
    p.scale_amount_max = 0.6
    p.color_ramp = _gradient(color, color, color.a)
    return p

## Liga/desliga ou ajusta a intensidade de um emissor.
static func set_rate(p: CPUParticles3D, ratio: float) -> void:
    if p == null:
        return
    if "amount_ratio" in p:
        p.amount_ratio = clampf(ratio, 0.0, 1.0)
        p.emitting = ratio > 0.01
    else:
        p.emitting = ratio > 0.1

## Explosão curta (impactos, troca de lugar, explosões). Some sozinha.
static func burst(parent: Node3D, pos: Vector3, color: Color, amount: int = 18, speed: float = 4.0, size: float = 0.5) -> void:
    var p := _base(parent, amount, 0.55, true)
    p.position = pos
    p.one_shot = true
    p.explosiveness = 1.0
    p.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
    p.emission_sphere_radius = 0.2
    p.direction = Vector3.UP
    p.spread = 180.0
    p.initial_velocity_min = speed * 0.4
    p.initial_velocity_max = speed
    p.gravity = Vector3(0, -2.0, 0)
    p.scale_amount_min = size * 0.6
    p.scale_amount_max = size * 1.4
    p.scale_amount_curve = _shrink()
    p.color_ramp = _gradient(color, color)
    p.emitting = true
    p.finished.connect(p.queue_free)
