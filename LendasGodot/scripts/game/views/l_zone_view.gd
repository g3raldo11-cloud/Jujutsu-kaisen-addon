class_name LZoneView
extends Node3D
## Zonas: Rastro de Fogo, Reino dos Redemoinhos, âncoras de redemoinho, Tempestade de Brasas,
## pegadas incandescentes, Fogo Guardião e Ira do Curupira — com efeitos em camadas.

var zone: LZone
var _disc: MeshInstance3D
var _disc_mat: StandardMaterial3D
var _fx: Array[CPUParticles3D] = []
var _funnel: LFunnel
var _footprint := false
var _spin_root: Node3D
var _t := 0.0

func _glow_disc(r: float, color: Color, y: float = 0.03) -> MeshInstance3D:
    var m := StandardMaterial3D.new()
    m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
    m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
    m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
    m.albedo_texture = LTex.glow_dot()
    m.albedo_color = color
    var mi := MeshInstance3D.new()
    var q := PlaneMesh.new()
    q.size = Vector2(r * 2.0, r * 2.0)
    mi.mesh = q
    mi.material_override = m
    mi.position = Vector3(0, y, 0)
    mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
    add_child(mi)
    _disc_mat = m
    return mi

func _ring_band(r: float, color: Color) -> void:
    var m := StandardMaterial3D.new()
    m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
    m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
    m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
    m.albedo_color = color
    var mi := MeshInstance3D.new()
    mi.mesh = LMesh.ring(Vector2(r, r), 0.12, 6, 64)
    mi.material_override = m
    mi.position = Vector3(0, 0.05, 0)
    mi.scale = Vector3(1.0, 0.3, 1.0)
    mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
    add_child(mi)

func bind(z: LZone) -> void:
    zone = z
    name = "Zona_%s_%d" % [z.kind, z.id]
    position = LMath.to_world(z.pos)
    match z.kind:
        "fogo":
            _disc = _glow_disc(z.radius * 1.3, Color(1.0, 0.35, 0.05, 0.75))
            _fx.append(LFx.fire(self, z.radius * 0.6, 24))
        "reino":
            # área de vento: chão claro, anel de poeira na borda e correntes girando
            _disc = _glow_disc(z.radius * 1.1, Color(0.7, 0.85, 1.0, 0.25))
            _ring_band(z.radius, Color(0.85, 0.92, 1.0, 0.45))
            _fx.append(LFx.swirl(self, z.radius * 0.95, 0.6, Color(0.92, 0.95, 1.0, 0.8), 140, 2.5))
            _fx.append(LFx.swirl(self, z.radius * 0.5, 0.9, Color(0.85, 0.8, 0.65, 0.7), 70, -3.5))
        "ancora":
            _funnel = LFunnel.make(self, 0.15, 0.7, 2.4, Color(0.9, 0.8, 0.6))
            _fx.append(LFx.swirl(self, 0.45, 2.4, Color(0.75, 0.62, 0.42, 0.8), 50, 10.0))
        "tempestade":
            _funnel = LFunnel.make(self, 0.5, z.radius * 0.8, 4.5, Color(1.0, 0.5, 0.12), true)
            _funnel.spin = 12.0
            _disc = _glow_disc(z.radius * 1.2, Color(1.0, 0.4, 0.05, 0.8))
            _fx.append(LFx.swirl(self, z.radius * 0.6, 4.0, Color(1.0, 0.5, 0.1, 0.9), 160, 12.0))
            _fx.append(LFx.fire(self, z.radius * 0.5, 50))
        "pegada":
            # pegada virada para trás (pés do Curupira), pulsando até explodir
            _footprint = true
            _disc = LMat.part(self, LMesh.ellipsoid(Vector3(0.17, 0.02, 0.33), 16, 8), Vector3(0, 0.03, 0), LMat.emissive(Color(1.0, 0.35, 0.05), Color(1.0, 0.4, 0.05), 3.0))
            for t in range(4):
                LMat.part(_disc, LMesh.ellipsoid(Vector3(0.035, 0.02, 0.05), 8, 6), Vector3((t - 1.5) * 0.08, 0, -0.42), _disc.material_override)
            rotation.y = z.angle + PI
            _glow_disc(0.9, Color(1.0, 0.35, 0.05, 0.6))
            _fx.append(LFx.fire(self, 0.18, 10))
        "circulo":
            # Fogo Guardião: muralha circular de labaredas + faixa incandescente no chão
            _disc = _glow_disc(z.radius * 1.15, Color(1.0, 0.35, 0.05, 0.35))
            _ring_band(z.radius, Color(1.0, 0.45, 0.08, 0.9))
            var count := clampi(int(z.radius * 3.2), 12, 26)
            for i in range(count):
                var a := float(i) / count * TAU
                var post := Node3D.new()
                post.position = Vector3(cos(a) * z.radius, 0.15, sin(a) * z.radius)
                add_child(post)
                var f := LFx.fire(post, 0.4, 16)
                f.scale_amount_min = 1.0
                f.scale_amount_max = 1.8
                _fx.append(f)
        "ira":
            _disc = _glow_disc(z.radius * 1.2, Color(1.0, 0.3, 0.03, 0.7))
            _ring_band(z.radius, Color(1.0, 0.5, 0.1, 0.8))
            var ring_fire := LFx.fire(self, z.radius * 0.8, 120)
            ring_fire.emission_shape = CPUParticles3D.EMISSION_SHAPE_RING
            ring_fire.emission_ring_axis = Vector3.UP
            ring_fire.emission_ring_radius = z.radius * 0.9
            ring_fire.emission_ring_inner_radius = 0.6
            ring_fire.emission_ring_height = 0.1
            _fx.append(ring_fire)

func sync_view(dt: float) -> void:
    if zone == null:
        return
    _t += dt
    position = position.lerp(LMath.to_world(zone.pos), 1.0 - exp(-dt * 20.0))
    if _footprint and _disc != null:
        var pulse := 1.0 + sin(_t * lerpf(30.0, 8.0, clampf(zone.rem / 1.5, 0.0, 1.0))) * 0.15
        _disc.scale = Vector3.ONE * pulse
    elif _disc != null and _disc_mat != null:
        var fade := clampf(zone.rem / 0.5, 0.0, 1.0)
        _disc.scale = Vector3.ONE * (0.7 + 0.3 * fade) * (1.0 + sin(_t * 6.0) * 0.03)
    if zone.rem < 0.4:
        for f in _fx:
            LFx.set_rate(f, 0.0)
        if _funnel != null:
            _funnel.set_strength(zone.rem / 0.4)
