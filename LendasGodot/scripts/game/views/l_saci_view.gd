class_name LSaciView
extends LUnitView
## Saci-Pererê, modelo procedural detalhado: cabeça expressiva (olhos meio fechados de travessura,
## sobrancelhas, nariz, orelhas grandes, sorriso com dentes), carapuça vermelha de tecido com
## dobras caindo para trás, calção de algodão cru com cinto de corda, braços com cotovelos e mãos
## com dedos, uma única perna musculosa com pé e dedos, e cachimbo de barro com brasa e fumaça.
## Anda aos pulos numa perna só.

const SKIN := Color(0.30, 0.17, 0.10)

var _body: Node3D
var _leg: Node3D
var _cap: Node3D
var _head: Node3D
var _arm_l: Node3D
var _arm_r: Node3D
var _elbow_l: Node3D
var _elbow_r: Node3D
var _ember: StandardMaterial3D
var _tornado: CPUParticles3D
var _funnel: LFunnel
var _spin := 0.0
var _kick := 0.0
var _ghost_leg: CPUParticles3D

func head_height() -> float:
    return 1.95 if imported_model != null else 1.45

func model_id() -> String:
    return "saci"

func _joint(parent: Node3D, pos: Vector3, rot_deg: Vector3 = Vector3.ZERO) -> Node3D:
    var j := Node3D.new()
    j.position = pos
    j.rotation_degrees = rot_deg
    parent.add_child(j)
    return j

func _build() -> void:
    var skin := LMat.skin(SKIN, 0.5, 3.0)
    var cotton := LMat.cloth(Color(0.86, 0.8, 0.66), 8.0)
    var rope := LMat.straw(Vector2(1.0, 10.0))
    var red := LMat.cloth(Color(0.78, 0.07, 0.05), 5.0)
    var white := LMat.lit(Color(0.97, 0.96, 0.92), 0.25)
    var iris := LMat.lit(Color(0.18, 0.09, 0.04), 0.2)
    var black := LMat.lit(Color(0.02, 0.02, 0.02), 0.2)
    var mouth := LMat.lit(Color(0.25, 0.04, 0.04), 0.6)
    var clay := LMat.lit(Color(0.45, 0.25, 0.14), 0.75)
    _ember = LMat.emissive(Color(0.9, 0.3, 0.05), Color(1.0, 0.4, 0.05), 3.0)

    _body = Node3D.new()
    model.add_child(_body)

    # ---------------- perna única (quadril → joelho → tornozelo) e pé
    _leg = _joint(_body, Vector3(0.0, 0.64, 0.0))
    LMat.part(_leg, LMesh.tube([Vector3(0, 0.02, 0), Vector3(0, -0.14, 0.02), Vector3(0, -0.28, 0.05), Vector3(0, -0.42, 0.0), Vector3(0, -0.57, -0.01)],
        [0.078, 0.084, 0.06, 0.068, 0.045], 16, 4), Vector3.ZERO, skin)
    var foot := _joint(_leg, Vector3(0, -0.58, 0))
    LMat.part(foot, LMesh.tube([Vector3(0, -0.015, -0.07), Vector3(0, -0.03, 0.0), Vector3(0, -0.04, 0.09), Vector3(0, -0.042, 0.15)],
        [0.05, 0.064, 0.06, 0.036], 16, 4, 0.55), Vector3.ZERO, skin)
    for k in range(4):
        var x := -0.033 + k * 0.022
        LMat.part(foot, LMesh.tube([Vector3(x, -0.045, 0.145), Vector3(x, -0.05, 0.175), Vector3(x, -0.055, 0.195)],
            [0.017, 0.015, 0.011], 8, 3), Vector3.ZERO, skin)

    # ---------------- calção de algodão cru com dobras + cinto de corda com nó
    LMat.part(_body, LMesh.loft([[0.77, 0.14, 0.112], [0.71, 0.162, 0.128], [0.63, 0.172, 0.135], [0.565, 0.162, 0.125]],
        28, 3, 0.07, 16.0), Vector3.ZERO, cotton)
    LMat.part(_body, LMesh.ring(Vector2(0.146, 0.118), 0.013, 8, 40, 0.15), Vector3(0, 0.755, 0), rope)
    LMat.part(_body, LMesh.ellipsoid(Vector3(0.025, 0.02, 0.018), 10, 8), Vector3(0.06, 0.75, 0.11), rope)
    LMat.part(_body, LMesh.tube([Vector3(0.06, 0.74, 0.115), Vector3(0.07, 0.68, 0.125), Vector3(0.065, 0.62, 0.12)], [0.009, 0.008, 0.006], 6, 3), Vector3.ZERO, rope)
    LMat.part(_body, LMesh.tube([Vector3(0.05, 0.74, 0.115), Vector3(0.045, 0.69, 0.13), Vector3(0.05, 0.64, 0.125)], [0.009, 0.008, 0.006], 6, 3), Vector3.ZERO, rope)

    # ---------------- tronco magro com costelas leves, pescoço
    LMat.part(_body, LMesh.loft([[0.74, 0.126, 0.1, 0.0], [0.82, 0.12, 0.095, 0.012], [0.9, 0.136, 0.1, 0.004], [0.98, 0.152, 0.104, -0.006],
        [1.03, 0.122, 0.09, -0.01], [1.07, 0.06, 0.055, 0.0]], 28, 3, 0.03, 9.0), Vector3.ZERO, skin)
    LMat.part(_body, LMesh.tube([Vector3(0, 1.04, 0), Vector3(0, 1.08, 0.008), Vector3(0, 1.12, 0.012)], [0.046, 0.044, 0.046], 14, 3), Vector3.ZERO, skin)

    # ---------------- braços (ombro → cotovelo → mão com dedos)
    _arm_l = _joint(_body, Vector3(-0.15, 1.0, 0.0), Vector3(0, 0, -28))
    _arm_r = _joint(_body, Vector3(0.15, 1.0, 0.0), Vector3(0, 0, 28))
    _elbow_l = _build_arm(_arm_l, -1.0, skin)
    _elbow_r = _build_arm(_arm_r, 1.0, skin)

    # ---------------- cabeça
    _head = _joint(_body, Vector3(0, 1.11, 0.012))
    LMat.part(_head, LMesh.loft([[0.0, 0.055, 0.06, 0.035], [0.04, 0.1, 0.108, 0.022], [0.1, 0.152, 0.148, 0.004], [0.17, 0.176, 0.168, -0.008],
        [0.25, 0.17, 0.164, -0.014], [0.31, 0.132, 0.13, -0.02], [0.345, 0.0, 0.0, -0.02]], 32, 3, 0.02, 7.0), Vector3.ZERO, skin)
    # bochechas, nariz redondo, orelhas grandes
    for side in [-1.0, 1.0]:
        LMat.part(_head, LMesh.ellipsoid(Vector3(0.045, 0.035, 0.03), 14, 10), Vector3(0.085 * side, 0.095, 0.115), skin)
        var ear := LMat.part(_head, LMesh.ellipsoid(Vector3(0.026, 0.062, 0.042), 14, 10), Vector3(0.172 * side, 0.17, -0.005), skin, Vector3.ONE, Vector3(0, -20 * side, 14 * side))
        LMat.part(ear, LMesh.ellipsoid(Vector3(0.012, 0.04, 0.026), 10, 8), Vector3(0.012 * side, 0.0, 0.004), LMat.skin(SKIN.darkened(0.35), 0.6, 3.0))
    LMat.part(_head, LMesh.tube([Vector3(0, 0.135, 0.15), Vector3(0, 0.123, 0.188), Vector3(0, 0.108, 0.203)], [0.026, 0.032, 0.027], 14, 3), Vector3.ZERO, skin)
    for side in [-1.0, 1.0]:
        LMat.part(_head, LMesh.ellipsoid(Vector3(0.008, 0.006, 0.006), 8, 6), Vector3(0.012 * side, 0.106, 0.205), black)
    # olhos com íris, pupila e brilho; pálpebra de cima (olhar de travessura); sobrancelhas
    for side in [-1.0, 1.0]:
        var eye := _joint(_head, Vector3(0.066 * side, 0.19, 0.134))
        LMat.part(eye, LMesh.ellipsoid(Vector3(0.042, 0.046, 0.03), 18, 12), Vector3.ZERO, white)
        LMat.part(eye, LMesh.ellipsoid(Vector3(0.022, 0.024, 0.01), 14, 10), Vector3(0.004 * side, -0.004, 0.026), iris)
        LMat.part(eye, LMesh.ellipsoid(Vector3(0.011, 0.012, 0.006), 10, 8), Vector3(0.004 * side, -0.004, 0.034), black)
        LMat.part(eye, LMesh.ellipsoid(Vector3(0.005, 0.005, 0.004), 8, 6), Vector3(0.012 * side, 0.006, 0.037), LMat.emissive(Color.WHITE, Color.WHITE, 1.5))
        LMat.part(eye, LMesh.ellipsoid(Vector3(0.048, 0.03, 0.036), 18, 10), Vector3(0, 0.026, 0.002), skin, Vector3.ONE, Vector3(-12, 0, -10 * side))
        LMat.part(_head, LMesh.tube([Vector3(0.028 * side, 0.248, 0.168), Vector3(0.07 * side, 0.262, 0.16), Vector3(0.112 * side, 0.25, 0.138)],
            [0.011, 0.014, 0.009], 8, 4, 0.6), Vector3.ZERO, black)
    # sorriso largo com dentes
    LMat.part(_head, LMesh.tube([Vector3(-0.078, 0.092, 0.148), Vector3(-0.042, 0.07, 0.172), Vector3(0, 0.064, 0.178), Vector3(0.042, 0.07, 0.172), Vector3(0.078, 0.094, 0.148)],
        [0.01, 0.017, 0.02, 0.017, 0.01], 10, 4, 0.55), Vector3.ZERO, mouth)
    LMat.part(_head, LMesh.tube([Vector3(-0.052, 0.082, 0.166), Vector3(0, 0.076, 0.183), Vector3(0.052, 0.082, 0.166)],
        [0.009, 0.011, 0.009], 8, 4, 0.55), Vector3.ZERO, white)

    # ---------------- carapuça vermelha de pano, com dobras, caindo para trás
    _cap = _joint(_head, Vector3(0, 0.275, -0.012))
    LMat.part(_cap, LMesh.tube([Vector3(0, -0.01, 0), Vector3(0, 0.1, -0.02), Vector3(0, 0.19, -0.07), Vector3(0, 0.245, -0.16), Vector3(0, 0.205, -0.27), Vector3(0, 0.12, -0.32)],
        [0.188, 0.168, 0.128, 0.088, 0.048, 0.0], 28, 5, 1.0, Vector3(0, 0, 1), Color(1, 1, 1), Color(0.75, 0.75, 0.75), 0.07, 9.0), Vector3.ZERO, red)
    LMat.part(_cap, LMesh.ring(Vector2(0.186, 0.176), 0.024, 10, 40, 0.1), Vector3(0, 0.0, 0.0), red)

    # ---------------- cachimbo de barro com brasa e fumaça
    var pipe := _joint(_head, Vector3(0.062, 0.078, 0.165))
    LMat.part(pipe, LMesh.tube([Vector3(0, 0, 0), Vector3(0.05, -0.012, 0.075), Vector3(0.075, 0.0, 0.135)], [0.011, 0.011, 0.012], 8, 4), Vector3.ZERO, LMat.wood(Vector2(1, 2)))
    var bowl := _joint(pipe, Vector3(0.08, 0.0, 0.145))
    LMat.part(bowl, LMesh.loft([[-0.02, 0.018, 0.018], [0.0, 0.03, 0.03], [0.035, 0.034, 0.034], [0.05, 0.03, 0.03]], 16, 3), Vector3.ZERO, clay)
    LMat.part(bowl, LMesh.ellipsoid(Vector3(0.024, 0.006, 0.024), 12, 6), Vector3(0, 0.048, 0), _ember)
    var smoke := LFx.swirl(bowl, 0.02, 0.6, Color(0.85, 0.85, 0.85, 0.35), 8, 2.0)
    smoke.position = Vector3(0, 0.06, 0)

    # ---------------- redemoinhos ao redor do corpo
    LFx.swirl(model, 0.45, 0.6, Color(0.7, 0.55, 0.35, 0.6), 24)
    _tornado = LFx.swirl(model, 0.6, 3.2, Color(0.75, 0.62, 0.42, 0.85), 160, 14.0)
    LFx.set_rate(_tornado, 0.0)
    _funnel = LFunnel.make(self, 0.25, 1.15, 2.7, Color(0.9, 0.8, 0.6))
    _funnel.set_strength(0.0)

func _build_arm(shoulder: Node3D, side: float, skin: Material) -> Node3D:
    LMat.part(shoulder, LMesh.ellipsoid(Vector3(0.05, 0.045, 0.045), 14, 10), Vector3.ZERO, skin)
    LMat.part(shoulder, LMesh.tube([Vector3(0, 0, 0), Vector3(0, -0.11, 0.004), Vector3(0, -0.22, 0)], [0.044, 0.047, 0.037], 14, 4), Vector3.ZERO, skin)
    var elbow := _joint(shoulder, Vector3(0, -0.22, 0), Vector3(-25, 0, 0))
    LMat.part(elbow, LMesh.tube([Vector3(0, 0, 0), Vector3(0, -0.1, 0.004), Vector3(0, -0.2, 0)], [0.037, 0.04, 0.029], 14, 4), Vector3.ZERO, skin)
    var hand := _joint(elbow, Vector3(0, -0.215, 0))
    LMat.part(hand, LMesh.ellipsoid(Vector3(0.034, 0.042, 0.017), 14, 10), Vector3(0, -0.02, 0), skin)
    for k in range(4):
        var x := -0.024 + k * 0.016
        LMat.part(hand, LMesh.tube([Vector3(x, -0.055, 0.0), Vector3(x, -0.08, 0.008), Vector3(x, -0.1, 0.02)], [0.0085, 0.008, 0.0065], 8, 3), Vector3.ZERO, skin)
    LMat.part(hand, LMesh.tube([Vector3(0.03 * side, -0.02, 0.008), Vector3(0.045 * side, -0.045, 0.022), Vector3(0.05 * side, -0.065, 0.03)], [0.01, 0.009, 0.007], 8, 3), Vector3.ZERO, skin)
    return elbow

func rig_map() -> Dictionary:
    return {"corpo": _body, "perna": _leg, "braco_l": _arm_l, "braco_r": _arm_r, "antebraco_l": _elbow_l,
            "antebraco_r": _elbow_r, "cabeca": _head, "gorro": _cap}

func rig_translate() -> Array:
    return ["corpo"]

## Modelo esculpido no Blender: perna fantasma de vento no lado da perna que falta; o cachimbo
## agora está na mão (a fumaça sai de lá, não da boca).
func _setup_imported() -> void:
    for p in _head.find_children("*", "CPUParticles3D", true, false):
        (p as CPUParticles3D).emitting = false
    var leg := imported_node("FX_perna_vento")
    if leg != null:
        _ghost_leg = LFx.swirl(leg, 0.07, 0.9, Color(0.75, 0.92, 1.0, 0.7), 60, 9.0)
        _ghost_leg.position = Vector3(0, -0.5, 0)
    var pipe := imported_node("FX_cachimbo")
    if pipe != null:
        LFx.swirl(pipe, 0.02, 0.6, Color(0.85, 0.85, 0.85, 0.35), 10, 2.0)

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
    var phase := anim_time * hop_freq * PI * 0.5
    var hop := absf(sin(phase)) * (0.28 if spd > 0.5 else 0.05)
    _body.position = Vector3(0, hop, 0) + hit_shake()
    _leg.scale = Vector3(1, 1.0 - (0.28 - hop) * 0.3, 1)
    _body.rotation_degrees = Vector3(12.0 if spd > 0.5 else 0.0, 0, sin(anim_time * 3.0) * 4.0)
    # braços balançam no ritmo dos pulos; cotovelos dobram
    var swing := sin(phase * 2.0) * (35.0 if spd > 0.5 else 6.0)
    _arm_l.rotation_degrees = Vector3(swing, 0, -28 - absf(swing) * 0.2)
    _arm_r.rotation_degrees = Vector3(-swing, 0, 28 + absf(swing) * 0.2)
    _elbow_l.rotation_degrees.x = -25.0 - maxf(0.0, swing) * 0.6
    _elbow_r.rotation_degrees.x = -25.0 - maxf(0.0, -swing) * 0.6
    _head.rotation_degrees = Vector3(-hop * 20.0, sin(anim_time * 1.3) * 8.0, sin(anim_time * 2.1) * 5.0)
    _cap.rotation_degrees = Vector3(-hop * 45.0 - spd * 1.5, sin(anim_time * 4.0) * 10.0, 0)
    _ember.emission_energy_multiplier = 2.5 + sin(anim_time * 5.0) * 0.8
    if _kick > 0.0:
        _kick = maxf(0.0, _kick - dt * 4.0)
    if tornado:
        _spin += dt * 1440.0
    else:
        _spin = (1.0 - _kick) * 360.0 if _kick > 0.0 else 0.0
    model.rotation_degrees.y = _spin
    model.scale = Vector3(0.7, 1.1, 0.7) if tornado else Vector3.ONE
    LFx.set_rate(_tornado, 1.0 if tornado else 0.0)
    _funnel.set_strength(1.0 if tornado else 0.0)
