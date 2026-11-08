class_name LZoneView
extends Node3D
## Zonas: Rastro de Fogo, Reino dos Redemoinhos, âncoras, Tempestade de Brasas,
## pegadas incandescentes, Fogo Guardião e Ira do Curupira.

var zone: LZone
var _disc: MeshInstance3D
var _fx: CPUParticles3D
var _footprint := false

func bind(z: LZone) -> void:
    zone = z
    name = "Zona_%s_%d" % [z.kind, z.id]
    position = LMath.to_world(z.pos)
    match z.kind:
        "fogo":
            _disc = LMat.disc(self, z.radius, LMat.transparent(Color(1.0, 0.3, 0.02, 0.35)), 0.02)
            _fx = LFx.fire(self, z.radius * 0.7, 30)
        "reino":
            _disc = LMat.disc(self, z.radius, LMat.transparent(Color(0.75, 0.9, 1.0, 0.16)), 0.03)
            _fx = LFx.swirl(self, z.radius * 0.9, 0.8, Color(0.9, 0.95, 1.0, 0.7), 160, 3.0)
        "ancora":
            _fx = LFx.swirl(self, 0.5, 2.6, Color(0.72, 0.6, 0.42, 0.8), 70, 10.0)
            _disc = LMat.disc(self, 0.6, LMat.transparent(Color(0.6, 0.5, 0.35, 0.4)), 0.02)
        "tempestade":
            _fx = LFx.swirl(self, z.radius * 0.6, 4.0, Color(1.0, 0.45, 0.08, 0.9), 260, 12.0)
            _disc = LMat.disc(self, z.radius, LMat.transparent(Color(1.0, 0.35, 0.05, 0.3)), 0.02)
            LFx.fire(self, z.radius * 0.5, 60)
        "pegada":
            # Pegada virada para trás (pés do Curupira), pulsando até explodir.
            _footprint = true
            _disc = LMat.part(self, LMat.sphere(0.5), Vector3(0, 0.03, 0), LMat.emissive(Color(1.0, 0.35, 0.05), Color(1.0, 0.4, 0.05), 4.0), Vector3(0.35, 0.04, 0.7))
            rotation.y = z.angle + PI
            _fx = LFx.fire(self, 0.2, 14)
        "circulo":
            _disc = LMat.disc(self, z.radius, LMat.transparent(Color(1.0, 0.4, 0.05, 0.12)), 0.02)
            var count := clampi(int(z.radius * 2.2), 8, 18)
            for i in range(count):
                var a := float(i) / count * TAU
                var post := Node3D.new()
                post.position = Vector3(cos(a) * z.radius, 0.2, sin(a) * z.radius)
                add_child(post)
                LFx.fire(post, 0.35, 18)
        "ira":
            _disc = LMat.disc(self, z.radius, LMat.transparent(Color(1.0, 0.25, 0.02, 0.28)), 0.02)
            _fx = LFx.fire(self, z.radius * 0.8, 140)
            _fx.emission_shape = CPUParticles3D.EMISSION_SHAPE_RING
            _fx.emission_ring_axis = Vector3.UP
            _fx.emission_ring_radius = z.radius * 0.85
            _fx.emission_ring_inner_radius = 0.5
            _fx.emission_ring_height = 0.1

func sync_view(dt: float) -> void:
    if zone == null:
        return
    position = position.lerp(LMath.to_world(zone.pos), 1.0 - exp(-dt * 20.0))
    if _footprint and _disc != null:
        var pulse := 1.0 + sin(LUnitView.now() * lerpf(30.0, 8.0, clampf(zone.rem / 1.5, 0.0, 1.0))) * 0.15
        _disc.scale = Vector3(0.35, 0.04, 0.7) * pulse
    elif _disc != null and zone.kind != "ancora":
        var fade := clampf(zone.rem / 0.5, 0.0, 1.0)
        var k := 0.6 + 0.4 * fade
        _disc.scale = Vector3(k, 1.0, k)
    if _fx != null and zone.rem < 0.4:
        _fx.emitting = false
