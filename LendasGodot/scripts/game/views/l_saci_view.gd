class_name LSaciView
extends LUnitView
## Saci-Pererê: corpo pequeno e expressivo, uma única perna, carapuça vermelha, cachimbo e
## redemoinhos ao redor. Anda aos pulos numa perna só.

var _body: Node3D
var _leg: MeshInstance3D
var _cap: Node3D
var _tornado: CPUParticles3D
var _spin := 0.0
var _kick := 0.0

func head_height() -> float:
    return 1.35

func _build() -> void:
    var skin := LMat.lit(Color(0.33, 0.2, 0.12), 0.6)
    var red := LMat.lit(Color(0.8, 0.07, 0.05), 0.7)
    var cloth := LMat.lit(Color(0.85, 0.78, 0.62), 0.9)
    var white := LMat.lit(Color(0.97, 0.97, 0.95), 0.4)
    var dark := LMat.lit(Color(0.05, 0.04, 0.03), 0.4)
    var wood := LMat.lit(Color(0.42, 0.27, 0.13), 0.7)

    _body = Node3D.new()
    model.add_child(_body)
    # Uma única perna, com o pé.
    _leg = LMat.part(_body, LMat.capsule(0.075, 0.62), Vector3(0, 0.32, 0), skin, Vector3.ONE, Vector3.ZERO, "Perna")
    LMat.part(_body, LMat.sphere(0.09), Vector3(0, 0.03, 0.06), skin, Vector3(1.0, 0.45, 1.6), Vector3.ZERO, "Pé")
    LMat.part(_body, LMat.cylinder(0.18, 0.2, 0.14), Vector3(0, 0.66, 0), cloth, Vector3(1, 1, 0.85), Vector3.ZERO, "Calção")
    LMat.part(_body, LMat.sphere(0.5), Vector3(0, 0.88, 0), skin, Vector3(0.32, 0.48, 0.26), Vector3.ZERO, "Tronco")
    # Braços abertos, gesto travesso.
    LMat.part(_body, LMat.capsule(0.045, 0.38), Vector3(-0.21, 0.9, 0.04), skin, Vector3.ONE, Vector3(10, 0, -40))
    LMat.part(_body, LMat.capsule(0.045, 0.38), Vector3(0.21, 0.92, 0.07), skin, Vector3.ONE, Vector3(-30, 0, 35))

    var head := LMat.part(_body, LMat.sphere(0.17), Vector3(0, 1.2, 0.02), skin, Vector3(1, 1.05, 0.97), Vector3.ZERO, "Cabeça")
    for side in [-1.0, 1.0]:
        var eye := LMat.part(head, LMat.sphere(0.05), Vector3(0.065 * side, 0.03, 0.14), white, Vector3(1.0, 0.8, 0.7))
        LMat.part(eye, LMat.sphere(0.025), Vector3(0.012 * side, 0.0, 0.035), dark)
    LMat.part(head, LMat.box(Vector3(0.12, 0.016, 0.02)), Vector3(0, -0.07, 0.155), dark, Vector3.ONE, Vector3(0, 0, 0), "Sorriso")
    # Carapuça vermelha caída para trás.
    _cap = Node3D.new()
    _cap.position = Vector3(0, 0.1, -0.01)
    head.add_child(_cap)
    LMat.part(_cap, LMat.cylinder(0.18, 0.185, 0.04), Vector3.ZERO, red, Vector3.ONE, Vector3.ZERO, "Aba")
    LMat.part(_cap, LMat.cone(0.18, 0.5), Vector3(0, 0.25, -0.08), red, Vector3.ONE, Vector3(-35, 0, 0), "Carapuça")
    # Cachimbo (elemento visual) com fumaça.
    LMat.part(head, LMat.cylinder(0.012, 0.012, 0.16), Vector3(0.05, -0.08, 0.2), wood, Vector3.ONE, Vector3(80, 20, 0), "Cachimbo")
    var bowl := LMat.part(head, LMat.cylinder(0.03, 0.025, 0.05), Vector3(0.08, -0.05, 0.28), wood)
    var smoke := LFx.swirl(bowl, 0.02, 0.6, Color(0.85, 0.85, 0.85, 0.35), 6, 2.0)
    smoke.position = Vector3(0, 0.03, 0)
    # Redemoinhos ao redor do corpo.
    LFx.swirl(model, 0.45, 0.6, Color(0.7, 0.55, 0.35, 0.6), 20)
    _tornado = LFx.swirl(model, 0.6, 3.2, Color(0.75, 0.62, 0.42, 0.85), 200, 14.0)
    _tornado.emitting = false

func on_basic_attack() -> void:
    _kick = 1.0  # pulo-chute giratório

func sync_view(dt: float) -> void:
    super.sync_view(dt)
    if unit == null:
        return
    var kit: LSaciKit = null
    if unit is LChampion:
        kit = (unit as LChampion).kit as LSaciKit
    var tornado := kit != null and kit.is_tornado()
    var spd := unit.vel.length()
    var hop_freq := 5.5 + spd * 0.4 if spd > 0.5 else 2.2
    var hop := absf(sin(anim_time * hop_freq * PI * 0.5)) * (0.28 if spd > 0.5 else 0.06)
    _body.position = Vector3(0, hop, 0) + hit_shake()
    _leg.scale = Vector3(1, 1.0 - (0.28 - hop) * 0.35, 1)
    _body.rotation_degrees = Vector3(12.0 if spd > 0.5 else 0.0, 0, sin(anim_time * 3.0) * 4.0)
    _cap.rotation_degrees = Vector3(-hop * 40.0, sin(anim_time * 4.0) * 10.0, 0)
    if _kick > 0.0:
        _kick = maxf(0.0, _kick - dt * 4.0)
    if tornado:
        _spin += dt * 1440.0
    else:
        _spin = (1.0 - _kick) * 360.0 if _kick > 0.0 else 0.0
    model.rotation_degrees.y = _spin
    model.scale = Vector3(0.7, 1.1, 0.7) if tornado else Vector3.ONE
    _tornado.emitting = tornado
