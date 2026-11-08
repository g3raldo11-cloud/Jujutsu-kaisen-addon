class_name LFx
extends RefCounted
## Efeitos visuais procedurais em camadas (CPUParticles3D funciona em qualquer placa de vídeo).
## Fogo = labaredas em forma de gota + núcleo quente + fagulhas; impactos com clarão e faíscas;
## explosões com bola de fogo, onda de choque, fumaça e luz temporária; rajadas de vento;
## cones de luz; redemoinhos de poeira e folhas; funis de tornado.

static var _mats := {}
static var _shrink_curve: Curve
static var _grow_shrink_curve: Curve

static func mat(tex: Texture2D, key: String, additive: bool, align_velocity: bool = false) -> StandardMaterial3D:
    var k := "%s_%s_%s" % [key, additive, align_velocity]
    if _mats.has(k):
        return _mats[k]
    var m := StandardMaterial3D.new()
    m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
    if additive:
        m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
    m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
    m.vertex_color_use_as_albedo = true
    m.albedo_texture = tex
    m.cull_mode = BaseMaterial3D.CULL_DISABLED
    m.billboard_mode = BaseMaterial3D.BILLBOARD_DISABLED if align_velocity else BaseMaterial3D.BILLBOARD_PARTICLES
    m.disable_receive_shadows = true
    _mats[k] = m
    return m

static func _quad(size: Vector2) -> QuadMesh:
    var q := QuadMesh.new()
    q.size = size
    return q

static func _ramp(stops: Array) -> Gradient:
    var g := Gradient.new()
    var offs := PackedFloat32Array()
    var cols := PackedColorArray()
    for s in stops:
        offs.append(float(s[0]))
        cols.append(s[1])
    g.offsets = offs
    g.colors = cols
    return g

static func shrink() -> Curve:
    if _shrink_curve == null:
        _shrink_curve = Curve.new()
        _shrink_curve.add_point(Vector2(0.0, 1.0))
        _shrink_curve.add_point(Vector2(1.0, 0.1))
    return _shrink_curve

static func grow_shrink() -> Curve:
    if _grow_shrink_curve == null:
        _grow_shrink_curve = Curve.new()
        _grow_shrink_curve.add_point(Vector2(0.0, 0.45))
        _grow_shrink_curve.add_point(Vector2(0.25, 1.0))
        _grow_shrink_curve.add_point(Vector2(1.0, 0.2))
    return _grow_shrink_curve

static func _emitter(parent: Node3D, amount: int, life: float, mesh: Mesh, material: Material) -> CPUParticles3D:
    var p := CPUParticles3D.new()
    p.amount = maxi(1, amount)
    p.lifetime = life
    p.mesh = mesh
    p.material_override = material
    p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
    p.randomness = 0.5
    parent.add_child(p)
    return p

# ------------------------------------------------------------------ fogo contínuo

## Fogo em camadas. Retorna o emissor principal; as fagulhas são filhas dele (use set_rate).
static func fire(parent: Node3D, radius: float, amount: int, c1: Color = Color(1.0, 0.75, 0.25), c2: Color = Color(1.0, 0.18, 0.02)) -> CPUParticles3D:
    var size := clampf(radius * 1.4 + 0.25, 0.3, 1.6)
    var p := _emitter(parent, amount, 0.75, _quad(Vector2(size * 0.6, size)), mat(LTex.flame(), "flame", true))
    p.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
    p.emission_sphere_radius = radius
    p.direction = Vector3.UP
    p.spread = 18.0
    p.initial_velocity_min = 0.5
    p.initial_velocity_max = 1.4
    p.gravity = Vector3(0, 2.2, 0)
    p.damping_min = 0.5
    p.damping_max = 1.2
    p.angle_min = -12.0
    p.angle_max = 12.0
    p.scale_amount_min = 0.6
    p.scale_amount_max = 1.15
    p.scale_amount_curve = grow_shrink()
    p.color_ramp = _ramp([[0.0, Color(1.0, 0.95, 0.75, 0.0)], [0.12, Color(c1.r, c1.g, c1.b, 0.95)],
        [0.55, Color(c2.r, c2.g * 1.4, c2.b, 0.7)], [1.0, Color(c2.r * 0.5, c2.g * 0.3, c2.b * 0.3, 0.0)]])
    # fagulhas que sobem e se espalham
    var s := _emitter(p, maxi(2, amount / 4), 1.3, _quad(Vector2(0.07, 0.07)), mat(LTex.spark(), "spark", true))
    s.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
    s.emission_sphere_radius = radius * 0.8
    s.direction = Vector3.UP
    s.spread = 45.0
    s.initial_velocity_min = 1.0
    s.initial_velocity_max = 2.8
    s.gravity = Vector3(0, 0.6, 0)
    s.damping_min = 0.8
    s.damping_max = 1.6
    s.scale_amount_min = 0.5
    s.scale_amount_max = 1.3
    s.color_ramp = _ramp([[0.0, Color(1.0, 0.9, 0.5, 1.0)], [0.6, Color(1.0, 0.45, 0.08, 0.9)], [1.0, Color(0.8, 0.15, 0.02, 0.0)]])
    return p

## Liga/desliga ou ajusta a intensidade de um emissor e das camadas filhas.
static func set_rate(p: CPUParticles3D, ratio: float) -> void:
    if p == null:
        return
    var on := ratio > 0.01
    if "amount_ratio" in p:
        p.amount_ratio = clampf(ratio, 0.0, 1.0)
    p.emitting = on
    for c in p.get_children():
        if c is CPUParticles3D:
            set_rate(c as CPUParticles3D, ratio)

# ------------------------------------------------------------------ vento, poeira e folhas

## Redemoinho de poeira e folhas secas, em coordenadas locais de um nó que gira.
static func swirl(parent: Node3D, radius: float, height: float, color: Color, amount: int = 60, spin_speed: float = 7.0) -> CPUParticles3D:
    var spinner := LSpin.new()
    spinner.speed = spin_speed
    parent.add_child(spinner)
    var p := _emitter(spinner, amount, 1.0, _quad(Vector2(0.4, 0.4)), mat(LTex.smoke(), "dust", true))
    p.local_coords = true
    p.emission_shape = CPUParticles3D.EMISSION_SHAPE_RING
    p.emission_ring_axis = Vector3.UP
    p.emission_ring_radius = radius
    p.emission_ring_inner_radius = radius * 0.55
    p.emission_ring_height = 0.1
    p.direction = Vector3.UP
    p.spread = 10.0
    p.initial_velocity_min = height * 0.6
    p.initial_velocity_max = height
    p.gravity = Vector3.ZERO
    p.angle_min = 0.0
    p.angle_max = 360.0
    p.scale_amount_min = 0.35
    p.scale_amount_max = 0.9
    p.scale_amount_curve = grow_shrink()
    var a := color.a * 0.55
    p.color_ramp = _ramp([[0.0, Color(color.r, color.g, color.b, 0.0)], [0.2, Color(color.r, color.g, color.b, a)], [1.0, Color(color.r, color.g, color.b, 0.0)]])
    # folhas secas girando junto
    var l := _emitter(p, maxi(2, amount / 5), 1.2, _quad(Vector2(0.09, 0.13)), mat(LTex.leaf(), "leaf", false))
    l.local_coords = true
    l.emission_shape = CPUParticles3D.EMISSION_SHAPE_RING
    l.emission_ring_axis = Vector3.UP
    l.emission_ring_radius = radius * 1.05
    l.emission_ring_inner_radius = radius * 0.7
    l.emission_ring_height = 0.2
    l.direction = Vector3.UP
    l.spread = 20.0
    l.initial_velocity_min = height * 0.5
    l.initial_velocity_max = height * 1.1
    l.gravity = Vector3.ZERO
    l.angle_min = 0.0
    l.angle_max = 360.0
    l.angular_velocity_min = -400.0
    l.angular_velocity_max = 400.0
    l.color_initial_ramp = _ramp([[0.0, Color(0.55, 0.42, 0.18)], [0.5, Color(0.62, 0.5, 0.2)], [1.0, Color(0.42, 0.5, 0.2)]])
    l.color_ramp = _ramp([[0.0, Color(1, 1, 1, 1)], [0.8, Color(1, 1, 1, 1)], [1.0, Color(1, 1, 1, 0)]])
    return p

## Rajada de vento: riscos que voam ao longo da direção, dentro de um cone (Vento Travesso).
static func wind_gust(parent: Node3D, pos: Vector3, dir: Vector3, length: float, cone_deg: float) -> void:
    var holder := Node3D.new()
    holder.position = pos
    parent.add_child(holder)
    if dir.length_squared() > 1e-4:
        holder.look_at(pos + dir, Vector3.UP)
    var p := _emitter(holder, 70, length / 14.0 + 0.25, _quad(Vector2(0.05, 0.7)), mat(LTex.glow_dot(), "streak", true, true))
    p.one_shot = true
    p.explosiveness = 0.85
    p.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
    p.emission_sphere_radius = 0.4
    p.direction = Vector3(0, 0, -1)
    p.spread = cone_deg * 0.5
    p.flatness = 0.6
    p.initial_velocity_min = 12.0
    p.initial_velocity_max = 18.0
    p.gravity = Vector3.ZERO
    p.particle_flag_align_y = true
    p.color_ramp = _ramp([[0.0, Color(0.9, 0.97, 1.0, 0.0)], [0.15, Color(0.9, 0.97, 1.0, 0.65)], [1.0, Color(0.8, 0.9, 1.0, 0.0)]])
    var dust := _emitter(holder, 26, 0.9, _quad(Vector2(0.7, 0.7)), mat(LTex.smoke(), "dust", true))
    dust.one_shot = true
    dust.explosiveness = 0.8
    dust.direction = Vector3(0, 0, -1)
    dust.spread = cone_deg * 0.5
    dust.initial_velocity_min = 5.0
    dust.initial_velocity_max = 9.0
    dust.damping_min = 4.0
    dust.damping_max = 6.0
    dust.gravity = Vector3.ZERO
    dust.scale_amount_curve = grow_shrink()
    dust.color_ramp = _ramp([[0.0, Color(0.8, 0.7, 0.5, 0.0)], [0.2, Color(0.8, 0.7, 0.5, 0.35)], [1.0, Color(0.8, 0.7, 0.5, 0.0)]])
    p.emitting = true
    dust.emitting = true
    _free_later(holder, 1.6)

## Cone de luz que se abre e some (Olhar Incandescente).
static func light_cone(parent: Node3D, pos: Vector3, dir: Vector3, length: float, cone_deg: float, color: Color) -> void:
    var holder := Node3D.new()
    holder.position = pos
    parent.add_child(holder)
    if dir.length_squared() > 1e-4:
        holder.look_at(pos + dir, Vector3.UP)
    var r := tan(deg_to_rad(cone_deg * 0.5)) * length
    var cone := LMesh.tube([Vector3(0, 0, 0), Vector3(0, 0, -length * 0.5), Vector3(0, 0, -length)], [0.05, r * 0.55, r], 28, 3, 0.55, Vector3(0, 1, 0),
        Color(1, 1, 1, 1), Color(1, 1, 1, 0.0), 0.0, 6.0, false)
    var mi := MeshInstance3D.new()
    mi.mesh = cone
    var m := StandardMaterial3D.new()
    m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
    m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
    m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
    m.vertex_color_use_as_albedo = true
    m.cull_mode = BaseMaterial3D.CULL_DISABLED
    m.albedo_color = Color(color.r, color.g, color.b, 0.9)
    mi.material_override = m
    mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
    holder.add_child(mi)
    var tw := holder.create_tween()
    mi.scale = Vector3(0.3, 0.3, 0.3)
    tw.tween_property(mi, "scale", Vector3.ONE, 0.12)
    tw.parallel().tween_property(m, "albedo_color:a", 0.0, 0.45).set_delay(0.1)
    tw.tween_callback(holder.queue_free)
    flash(parent, pos + dir.normalized() * 0.3, color, 1.2, 0.25)

# ------------------------------------------------------------------ explosões e impactos

## Clarão: bola de luz que cresce e some rapidamente.
static func flash(parent: Node3D, pos: Vector3, color: Color, size: float = 1.0, duration: float = 0.2) -> void:
    var mi := MeshInstance3D.new()
    mi.mesh = _quad(Vector2(size, size))
    var m := StandardMaterial3D.new()
    m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
    m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
    m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
    m.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
    m.albedo_texture = LTex.glow_dot()
    m.albedo_color = Color(color.r * 1.5, color.g * 1.5, color.b * 1.5, 1.0)
    m.no_depth_test = true
    mi.material_override = m
    mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
    mi.position = pos
    mi.scale = Vector3.ONE * 0.3
    parent.add_child(mi)
    var tw := mi.create_tween()
    tw.tween_property(mi, "scale", Vector3.ONE * 1.3, duration).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
    tw.parallel().tween_property(m, "albedo_color:a", 0.0, duration)
    tw.tween_callback(mi.queue_free)

## Onda de choque: anel no chão que se expande e some.
static func shock_ring(parent: Node3D, pos: Vector3, radius: float, color: Color, duration: float = 0.45) -> void:
    var mi := MeshInstance3D.new()
    mi.mesh = LMesh.ring(Vector2(1.0, 1.0), 0.06, 6, 48)
    var m := StandardMaterial3D.new()
    m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
    m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
    m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
    m.albedo_color = Color(color.r, color.g, color.b, 0.9)
    mi.material_override = m
    mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
    mi.position = Vector3(pos.x, 0.08, pos.z)
    mi.scale = Vector3(0.2, 1.0, 0.2)
    parent.add_child(mi)
    var tw := mi.create_tween()
    tw.tween_property(mi, "scale", Vector3(radius, 1.6, radius), duration).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
    tw.parallel().tween_property(m, "albedo_color:a", 0.0, duration)
    tw.tween_callback(mi.queue_free)

## Impacto: clarão + faíscas (+ poeira se não for fogo).
static func impact(parent: Node3D, pos: Vector3, color: Color, size: float = 1.0, fiery: bool = true) -> void:
    flash(parent, pos, color, 0.9 * size, 0.16)
    var holder := Node3D.new()
    holder.position = pos
    parent.add_child(holder)
    var s := _emitter(holder, int(14 * size), 0.45, _quad(Vector2(0.06, 0.4)), mat(LTex.glow_dot(), "streak", true, true))
    s.one_shot = true
    s.explosiveness = 1.0
    s.direction = Vector3.UP
    s.spread = 180.0
    s.initial_velocity_min = 4.0 * size
    s.initial_velocity_max = 8.0 * size
    s.gravity = Vector3(0, -9.0, 0)
    s.particle_flag_align_y = true
    var c := color.lightened(0.3)
    s.color_ramp = _ramp([[0.0, Color(c.r, c.g, c.b, 1.0)], [1.0, Color(color.r, color.g, color.b, 0.0)]])
    s.emitting = true
    if not fiery:
        var d := _emitter(holder, 8, 0.6, _quad(Vector2(0.5, 0.5)), mat(LTex.smoke(), "dust", true))
        d.one_shot = true
        d.explosiveness = 1.0
        d.spread = 180.0
        d.initial_velocity_min = 1.0
        d.initial_velocity_max = 2.0
        d.gravity = Vector3.ZERO
        d.scale_amount_curve = grow_shrink()
        d.color_ramp = _ramp([[0.0, Color(0.8, 0.7, 0.5, 0.3)], [1.0, Color(0.8, 0.7, 0.5, 0.0)]])
        d.emitting = true
    _free_later(holder, 1.0)

## Explosão: bola de fogo, onda de choque, fagulhas, fumaça e luz temporária.
static func explosion(parent: Node3D, pos: Vector3, radius: float, color: Color = Color(1.0, 0.55, 0.12)) -> void:
    flash(parent, pos + Vector3(0, 0.6, 0), color, radius * 1.4, 0.3)
    shock_ring(parent, pos, radius, color, 0.5)
    var holder := Node3D.new()
    holder.position = pos
    parent.add_child(holder)
    var ball := _emitter(holder, int(16 + radius * 8), 0.8, _quad(Vector2(1.0, 1.4)), mat(LTex.flame(), "flame", true))
    ball.one_shot = true
    ball.explosiveness = 0.9
    ball.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
    ball.emission_sphere_radius = radius * 0.25
    ball.direction = Vector3.UP
    ball.spread = 70.0
    ball.initial_velocity_min = radius * 1.2
    ball.initial_velocity_max = radius * 2.6
    ball.damping_min = radius * 1.5
    ball.damping_max = radius * 3.0
    ball.gravity = Vector3(0, 2.5, 0)
    ball.angle_min = -30.0
    ball.angle_max = 30.0
    ball.scale_amount_min = 0.7 + radius * 0.15
    ball.scale_amount_max = 1.2 + radius * 0.3
    ball.scale_amount_curve = grow_shrink()
    ball.color_ramp = _ramp([[0.0, Color(1.0, 0.95, 0.8, 1.0)], [0.25, Color(1.0, 0.7, 0.2, 0.95)], [0.6, Color(color.r, color.g * 0.7, color.b, 0.7)], [1.0, Color(0.3, 0.06, 0.02, 0.0)]])
    var embers := _emitter(holder, int(20 + radius * 10), 1.4, _quad(Vector2(0.08, 0.08)), mat(LTex.spark(), "spark", true))
    embers.one_shot = true
    embers.explosiveness = 0.95
    embers.direction = Vector3.UP
    embers.spread = 80.0
    embers.initial_velocity_min = radius * 2.0
    embers.initial_velocity_max = radius * 4.5
    embers.gravity = Vector3(0, -4.0, 0)
    embers.damping_min = 0.5
    embers.damping_max = 1.0
    embers.color_ramp = _ramp([[0.0, Color(1.0, 0.9, 0.5, 1.0)], [1.0, Color(1.0, 0.3, 0.05, 0.0)]])
    var smoke := _emitter(holder, 10, 1.8, _quad(Vector2(1.4, 1.4)), mat(LTex.smoke(), "smoke", false))
    smoke.one_shot = true
    smoke.explosiveness = 0.7
    smoke.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
    smoke.emission_sphere_radius = radius * 0.3
    smoke.direction = Vector3.UP
    smoke.spread = 40.0
    smoke.initial_velocity_min = 0.8
    smoke.initial_velocity_max = 1.8
    smoke.gravity = Vector3(0, 0.6, 0)
    smoke.angle_min = 0.0
    smoke.angle_max = 360.0
    smoke.scale_amount_min = 0.8 + radius * 0.2
    smoke.scale_amount_max = 1.4 + radius * 0.3
    smoke.scale_amount_curve = grow_shrink()
    smoke.color_ramp = _ramp([[0.0, Color(0.25, 0.2, 0.18, 0.0)], [0.25, Color(0.22, 0.18, 0.16, 0.5)], [1.0, Color(0.35, 0.32, 0.3, 0.0)]])
    for e in [ball, embers, smoke]:
        (e as CPUParticles3D).emitting = true
    var light := OmniLight3D.new()
    light.light_color = color
    light.light_energy = 5.0
    light.omni_range = radius * 3.0 + 3.0
    light.position = Vector3(0, 0.8, 0)
    holder.add_child(light)
    var tw := light.create_tween()
    tw.tween_property(light, "light_energy", 0.0, 0.5)
    _free_later(holder, 2.2)

## Puff de poeira (troca de lugar, esquiva, salto).
static func dust_puff(parent: Node3D, pos: Vector3, size: float = 1.0, with_leaves: bool = false) -> void:
    var holder := Node3D.new()
    holder.position = pos
    parent.add_child(holder)
    var d := _emitter(holder, int(14 * size), 0.7, _quad(Vector2(0.6, 0.6) * size), mat(LTex.smoke(), "dust", true))
    d.one_shot = true
    d.explosiveness = 1.0
    d.emission_shape = CPUParticles3D.EMISSION_SHAPE_RING
    d.emission_ring_axis = Vector3.UP
    d.emission_ring_radius = 0.4 * size
    d.emission_ring_inner_radius = 0.1
    d.emission_ring_height = 0.05
    d.direction = Vector3.UP
    d.spread = 70.0
    d.initial_velocity_min = 1.0 * size
    d.initial_velocity_max = 2.5 * size
    d.damping_min = 2.0
    d.damping_max = 4.0
    d.gravity = Vector3.ZERO
    d.angle_min = 0.0
    d.angle_max = 360.0
    d.scale_amount_curve = grow_shrink()
    d.color_ramp = _ramp([[0.0, Color(0.85, 0.72, 0.5, 0.45)], [1.0, Color(0.85, 0.72, 0.5, 0.0)]])
    d.emitting = true
    if with_leaves:
        var l := _emitter(holder, 10, 1.0, _quad(Vector2(0.09, 0.13)), mat(LTex.leaf(), "leaf", false))
        l.one_shot = true
        l.explosiveness = 1.0
        l.direction = Vector3.UP
        l.spread = 60.0
        l.initial_velocity_min = 2.0
        l.initial_velocity_max = 4.0
        l.gravity = Vector3(0, -3.0, 0)
        l.angular_velocity_min = -500.0
        l.angular_velocity_max = 500.0
        l.color_initial_ramp = _ramp([[0.0, Color(0.55, 0.42, 0.18)], [1.0, Color(0.42, 0.5, 0.2)]])
        l.emitting = true
    _free_later(holder, 1.4)

## Compatível com a versão anterior: explosão curta de faíscas coloridas.
static func burst(parent: Node3D, pos: Vector3, color: Color, amount: int = 18, speed: float = 4.0, size: float = 0.5) -> void:
    impact(parent, pos, color, clampf(size * 1.6, 0.5, 2.0), true)

static func _free_later(node: Node, seconds: float) -> void:
    var t := node.get_tree().create_timer(seconds) if node.is_inside_tree() else null
    if t != null:
        t.timeout.connect(node.queue_free)
