class_name LCurupiraView
extends LUnitView
## Curupira (versão de fogo), modelo procedural detalhado: corpo atlético com musculatura (peitoral,
## abdômen, deltoides, bíceps, panturrilhas), veios de brasa luminosos na pele, pintura de urucum
## no rosto, cabeleira de dezenas de mechas de fogo, pés virados para trás com dedos, tanga de
## fibras, braçadeiras e colar de sementes. Chamas acompanham o movimento.

const SKIN := Color(0.40, 0.22, 0.12)
const HAIR_STRANDS := 38

var _body: Node3D
var _hip_l: Node3D
var _hip_r: Node3D
var _knee_l: Node3D
var _knee_r: Node3D
var _arm_l: Node3D
var _arm_r: Node3D
var _elbow_l: Node3D
var _elbow_r: Node3D
var _head: Node3D
var _hair: Node3D
var _ember_mat: ShaderMaterial
var _eye_mat: StandardMaterial3D
var _hair_fire: CPUParticles3D
var _trail_fire: CPUParticles3D
var _light: OmniLight3D
var _fibers: Array[Node3D] = []
var _flames: Array[MeshInstance3D] = []
var _jet: Node3D
var _punch := 0.0
var _org_mats: Array[ShaderMaterial] = []
var _hand_fire: CPUParticles3D

func head_height() -> float:
    return 2.05

func model_id() -> String:
    return "curupira"

func _joint(parent: Node3D, pos: Vector3, rot_deg: Vector3 = Vector3.ZERO) -> Node3D:
    var j := Node3D.new()
    j.position = pos
    j.rotation_degrees = rot_deg
    parent.add_child(j)
    return j

func _build() -> void:
    _ember_mat = LMat.ember_skin(SKIN)
    var skin := _ember_mat
    var plain_skin := LMat.skin(SKIN, 0.5, 3.0)
    var urucum := LMat.lit(Color(0.72, 0.12, 0.05), 0.7)
    var fiber := LMat.straw(Vector2(1.0, 6.0))
    var seed := LMat.lit(Color(0.28, 0.12, 0.06), 0.35)
    var seed_red := LMat.lit(Color(0.6, 0.06, 0.04), 0.3)
    var bone := LMat.lit(Color(0.9, 0.85, 0.72), 0.5)
    _eye_mat = LMat.emissive(Color(1.0, 0.8, 0.4), Color(1.0, 0.6, 0.15), 3.5)

    _body = Node3D.new()
    model.add_child(_body)

    # ---------------- pernas: coxa → joelho → canela → pé virado para trás
    _hip_l = _joint(_body, Vector3(-0.105, 0.95, 0))
    _hip_r = _joint(_body, Vector3(0.105, 0.95, 0))
    _knee_l = _build_leg(_hip_l, -1.0, skin, plain_skin, seed_red)
    _knee_r = _build_leg(_hip_r, 1.0, skin, plain_skin, seed_red)

    # ---------------- quadril, cintura fina, tórax largo
    LMat.part(_body, LMesh.loft([[0.9, 0.162, 0.112, 0.0], [0.98, 0.168, 0.116, 0.0], [1.06, 0.142, 0.102, 0.01], [1.14, 0.136, 0.1, 0.016],
        [1.24, 0.162, 0.116, 0.02], [1.34, 0.196, 0.13, 0.02], [1.44, 0.216, 0.126, 0.0], [1.52, 0.2, 0.11, -0.01], [1.575, 0.1, 0.08, -0.01]],
        32, 3, 0.03, 7.0), Vector3.ZERO, skin)
    # peitorais, abdômen, deltoides e trapézio
    for side in [-1.0, 1.0]:
        LMat.part(_body, LMesh.ellipsoid(Vector3(0.095, 0.06, 0.042), 18, 12), Vector3(0.078 * side, 1.385, 0.098), skin, Vector3.ONE, Vector3(0, 0, -8 * side))
        LMat.part(_body, LMesh.ellipsoid(Vector3(0.075, 0.08, 0.075), 18, 12), Vector3(0.215 * side, 1.475, 0.0), skin)
        for row in range(3):
            LMat.part(_body, LMesh.ellipsoid(Vector3(0.036, 0.03, 0.016), 12, 8), Vector3(0.04 * side, 1.25 - row * 0.065, 0.112 - row * 0.004), skin)
    LMat.part(_body, LMesh.ellipsoid(Vector3(0.13, 0.06, 0.07), 18, 10), Vector3(0, 1.53, -0.045), skin)
    # pescoço
    LMat.part(_body, LMesh.tube([Vector3(0, 1.55, 0), Vector3(0, 1.61, 0.01), Vector3(0, 1.67, 0.016)], [0.064, 0.06, 0.058], 16, 3), Vector3.ZERO, skin)

    # ---------------- colar de sementes com pingente de dente
    for k in range(13):
        var a := lerpf(-1.2, 1.2, k / 12.0)
        var p := Vector3(sin(a) * 0.115, 1.535 - (1.0 - cos(a)) * 0.08, 0.06 + cos(a) * 0.05)
        LMat.part(_body, LMesh.ellipsoid(Vector3(0.016, 0.02, 0.016), 10, 8), p, seed_red if k % 2 == 0 else seed)
    LMat.part(_body, LMesh.tube([Vector3(0, 1.43, 0.118), Vector3(0.005, 1.39, 0.122), Vector3(0.0, 1.35, 0.118)], [0.014, 0.012, 0.0], 8, 4), Vector3.ZERO, bone)

    # ---------------- tanga de fibras: cinto trançado e tiras que balançam
    LMat.part(_body, LMesh.ring(Vector2(0.172, 0.122), 0.022, 10, 44, 0.12), Vector3(0, 0.965, 0), fiber)
    for k in range(26):
        var front := k < 13
        var i := k % 13
        var a := lerpf(-0.95, 0.95, i / 12.0) + (0.0 if front else PI)
        var root := Vector3(sin(a) * 0.17, 0.95, cos(a) * 0.122)
        var strip := _joint(_body, root)
        var length := 0.26 + 0.06 * sin(i * 1.7)
        var out := Vector3(sin(a), 0, cos(a)) * 0.03
        LMat.part(strip, LMesh.tube([Vector3.ZERO, out + Vector3(0, -length * 0.5, 0), out * 1.4 + Vector3(0, -length, 0)],
            [0.018, 0.016, 0.006], 6, 3, 0.25, Vector3(sin(a), 0, cos(a)), Color(1, 1, 1), Color(0.75, 0.68, 0.55)), Vector3.ZERO, fiber)
        _fibers.append(strip)

    # ---------------- braços: ombro → cotovelo → mão
    _arm_l = _joint(_body, Vector3(-0.245, 1.465, 0), Vector3(0, 0, -10))
    _arm_r = _joint(_body, Vector3(0.245, 1.465, 0), Vector3(0, 0, 10))
    _elbow_l = _build_arm(_arm_l, -1.0, skin, fiber, seed_red)
    _elbow_r = _build_arm(_arm_r, 1.0, skin, fiber, seed_red)

    # ---------------- cabeça: mandíbula marcada, sobrancelha, nariz, maçãs, olhos de brasa, orelhas
    _head = _joint(_body, Vector3(0, 1.665, 0.016))
    LMat.part(_head, LMesh.loft([[0.0, 0.052, 0.058, 0.04], [0.035, 0.084, 0.094, 0.026], [0.1, 0.1, 0.11, 0.004], [0.16, 0.107, 0.114, -0.008],
        [0.22, 0.1, 0.108, -0.014], [0.27, 0.072, 0.082, -0.02], [0.295, 0.0, 0.0, -0.022]], 32, 3, 0.02, 8.0), Vector3.ZERO, plain_skin)
    LMat.part(_head, LMesh.ellipsoid(Vector3(0.092, 0.022, 0.032), 16, 8), Vector3(0, 0.178, 0.088), plain_skin)
    LMat.part(_head, LMesh.tube([Vector3(0, 0.17, 0.1), Vector3(0, 0.135, 0.122), Vector3(0, 0.112, 0.128)], [0.017, 0.022, 0.02], 12, 3), Vector3.ZERO, plain_skin)
    for side in [-1.0, 1.0]:
        LMat.part(_head, LMesh.ellipsoid(Vector3(0.035, 0.022, 0.025), 12, 8), Vector3(0.062 * side, 0.13, 0.086), plain_skin)
        LMat.part(_head, LMesh.ellipsoid(Vector3(0.021, 0.012, 0.01), 12, 8), Vector3(0.04 * side, 0.155, 0.1), _eye_mat)
        # orelhas levemente pontudas
        LMat.part(_head, LMesh.tube([Vector3(0.1 * side, 0.15, 0.0), Vector3(0.12 * side, 0.175, -0.01), Vector3(0.13 * side, 0.21, -0.025)],
            [0.022, 0.016, 0.0], 10, 3, 0.45, Vector3(1, 0, 0)), Vector3.ZERO, plain_skin)
        # pintura de urucum: faixas sob os olhos
        for b in range(2):
            LMat.part(_head, LMesh.tube([Vector3(0.025 * side, 0.128 - b * 0.02, 0.105 - b * 0.002), Vector3(0.06 * side, 0.124 - b * 0.02, 0.098), Vector3(0.09 * side, 0.115 - b * 0.02, 0.07)],
                [0.006, 0.007, 0.004], 6, 3, 0.4), Vector3.ZERO, urucum)
    LMat.part(_head, LMesh.tube([Vector3(-0.03, 0.084, 0.112), Vector3(0, 0.08, 0.12), Vector3(0.03, 0.084, 0.112)], [0.005, 0.006, 0.005], 6, 3, 0.5), Vector3.ZERO, LMat.lit(Color(0.2, 0.05, 0.03), 0.6))

    # ---------------- cabeleira de fogo: dezenas de mechas (vermelho escuro na raiz, amarelo nas pontas)
    _hair = _joint(_head, Vector3(0, 0.235, -0.03))
    var rng := RandomNumberGenerator.new()
    rng.seed = 77
    var fire_mat := LMat.fire_vc(1.7)
    for k in range(HAIR_STRANDS):
        var theta := lerpf(-2.6, 2.6, float(k) / (HAIR_STRANDS - 1)) + rng.randf_range(-0.1, 0.1)
        var phi := rng.randf_range(0.15, 0.95)
        var dir := Vector3(sin(theta) * cos(phi), sin(phi), -absf(cos(theta)) * cos(phi) * 0.6 - 0.25).normalized()
        var root := Vector3(sin(theta) * 0.085 * cos(phi), sin(phi) * 0.05 - 0.02, cos(theta) * 0.07 * cos(phi) - 0.01)
        var length := rng.randf_range(0.3, 0.55)
        var curl := Vector3(rng.randf_range(-0.06, 0.06), 0.0, rng.randf_range(-0.04, 0.02))
        var p1 := root + dir * length * 0.35 + Vector3(0, length * 0.18, 0)
        var p2 := root + dir * length * 0.65 + Vector3(0, length * 0.42, -length * 0.15) + curl
        var p3 := root + dir * length + Vector3(0, length * 0.62, -length * 0.32) + curl * 2.0
        LMat.part(_hair, LMesh.tube([root, p1, p2, p3], [0.03, 0.026, 0.016, 0.0], 8, 3, 0.7, Vector3(0, 1, 0),
            Color(0.55, 0.04, 0.02), Color(1.0, 0.78, 0.22)), Vector3.ZERO, fire_mat)
    _hair_fire = LFx.fire(_hair, 0.14, 60, Color(1.0, 0.6, 0.12), Color(1.0, 0.12, 0.02))
    _hair_fire.position = Vector3(0, 0.2, -0.12)

    # chamas que acompanham o movimento (rastro nos pés)
    _trail_fire = LFx.fire(model, 0.25, 40, Color(1.0, 0.55, 0.12), Color(1.0, 0.2, 0.02))
    _trail_fire.position = Vector3(0, 0.15, 0)
    _light = OmniLight3D.new()
    _light.light_color = Color(1.0, 0.45, 0.15)
    _light.omni_range = 6.0
    _light.position = Vector3(0, 0.4, 0)
    _head.add_child(_light)

    # ---------------- Chamas Invertidas e labareda da Suprema
    _jet = Node3D.new()
    _jet.top_level = true
    add_child(_jet)
    var flame := LMat.part(_jet, LMesh.tube([Vector3(0, 0, 0), Vector3(0.0, 0.1, 3.0), Vector3(0.0, 0.25, 6.0), Vector3(0, 0.3, 9.0)], [0.25, 0.7, 0.95, 0.4], 18, 4,
        1.0, Vector3(0, 1, 0), Color(1.0, 0.85, 0.35), Color(0.9, 0.12, 0.02)), Vector3.ZERO, LMat.fire_vc(1.3))
    flame.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
    var jf := LFx.fire(_jet, 0.6, 90, Color(1.0, 0.7, 0.2), Color(1.0, 0.2, 0.02))
    jf.position = Vector3(0, 0, 4.5)
    jf.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
    jf.emission_box_extents = Vector3(0.6, 0.3, 4.5)
    _jet.visible = false

func _build_leg(hip: Node3D, side: float, skin: Material, plain: Material, beads: Material) -> Node3D:
    LMat.part(hip, LMesh.tube([Vector3(0, 0.02, 0), Vector3(0, -0.12, 0.022), Vector3(0, -0.26, 0.028), Vector3(0, -0.43, 0.01)],
        [0.1, 0.106, 0.09, 0.066], 18, 4, 1.0, Vector3(0, 0, 1), Color.WHITE, Color.WHITE, 0.03, 9.0), Vector3.ZERO, skin)
    var knee := _joint(hip, Vector3(0, -0.44, 0.01))
    LMat.part(knee, LMesh.ellipsoid(Vector3(0.05, 0.045, 0.045), 14, 10), Vector3(0, 0, 0.022), skin)
    LMat.part(knee, LMesh.tube([Vector3(0, 0, 0), Vector3(0, -0.1, -0.028), Vector3(0, -0.24, -0.012), Vector3(0, -0.4, 0)],
        [0.066, 0.078, 0.058, 0.044], 18, 4, 1.0, Vector3(0, 0, 1), Color.WHITE, Color.WHITE, 0.03, 9.0), Vector3.ZERO, skin)
    # tornozeleira de sementes
    LMat.part(knee, LMesh.ring(Vector2(0.05, 0.05), 0.011, 8, 28), Vector3(0, -0.34, 0), beads)
    var ankle := _joint(knee, Vector3(0, -0.41, 0))
    # PÉ VIRADO PARA TRÁS: calcanhar na frente, dedos atrás.
    LMat.part(ankle, LMesh.tube([Vector3(0, -0.015, 0.06), Vector3(0, -0.035, 0.0), Vector3(0, -0.045, -0.09), Vector3(0, -0.045, -0.165)],
        [0.05, 0.058, 0.052, 0.034], 16, 4, 0.5), Vector3.ZERO, plain)
    LMat.part(ankle, LMesh.ellipsoid(Vector3(0.042, 0.035, 0.04), 12, 8), Vector3(0, -0.03, 0.065), plain)
    for t in range(5):
        var x := -0.032 + t * 0.016
        var reach := 0.045 if t == 2 else (0.04 if t in [1, 3] else 0.032)
        LMat.part(ankle, LMesh.tube([Vector3(x, -0.05, -0.16), Vector3(x, -0.055, -0.16 - reach * 0.6), Vector3(x, -0.06, -0.16 - reach)],
            [0.0135, 0.012, 0.009], 8, 3), Vector3.ZERO, plain)
    return knee

func _build_arm(shoulder: Node3D, side: float, skin: Material, fiber: Material, beads: Material) -> Node3D:
    LMat.part(shoulder, LMesh.tube([Vector3(0, 0, 0), Vector3(0, -0.12, 0.012), Vector3(0, -0.29, 0)], [0.068, 0.076, 0.054], 18, 4,
        1.0, Vector3(0, 0, 1), Color.WHITE, Color.WHITE, 0.03, 9.0), Vector3.ZERO, skin)
    # braçadeira trançada
    LMat.part(shoulder, LMesh.ring(Vector2(0.074, 0.074), 0.014, 8, 30, 0.1), Vector3(0, -0.07, 0.008), fiber)
    var elbow := _joint(shoulder, Vector3(0, -0.29, 0), Vector3(-15, 0, 0))
    LMat.part(elbow, LMesh.tube([Vector3(0, 0, 0), Vector3(0, -0.1, 0.008), Vector3(0, -0.25, 0)], [0.054, 0.06, 0.04], 18, 4,
        1.0, Vector3(0, 0, 1), Color.WHITE, Color.WHITE, 0.025, 9.0), Vector3.ZERO, skin)
    LMat.part(elbow, LMesh.ring(Vector2(0.044, 0.044), 0.009, 8, 26), Vector3(0, -0.22, 0), beads)
    var hand := _joint(elbow, Vector3(0, -0.265, 0))
    LMat.part(hand, LMesh.ellipsoid(Vector3(0.044, 0.054, 0.021), 14, 10), Vector3(0, -0.03, 0), skin)
    for k in range(4):
        var x := -0.03 + k * 0.02
        var length := 0.07 if k in [1, 2] else 0.06
        LMat.part(hand, LMesh.tube([Vector3(x, -0.075, 0.0), Vector3(x, -0.075 - length * 0.5, 0.012), Vector3(x, -0.075 - length, 0.03)],
            [0.0105, 0.0098, 0.008], 8, 3), Vector3.ZERO, skin)
    LMat.part(hand, LMesh.tube([Vector3(0.038 * side, -0.025, 0.01), Vector3(0.055 * side, -0.055, 0.026), Vector3(0.06 * side, -0.08, 0.036)],
        [0.012, 0.011, 0.009], 8, 3), Vector3.ZERO, skin)
    return elbow

func rig_map() -> Dictionary:
    return {"corpo": _body, "coxa_l": _hip_l, "coxa_r": _hip_r, "canela_l": _knee_l, "canela_r": _knee_r,
            "braco_l": _arm_l, "braco_r": _arm_r, "antebraco_l": _elbow_l, "antebraco_r": _elbow_r,
            "cabeca": _head, "cabelo": _hair}

func rig_translate() -> Array:
    return ["corpo"]

## Modelo esculpido no Blender: rachaduras de brasa e mechas de fogo com shader; fogo na mão do soco.
func _setup_imported() -> void:
    _org_mats = override_material("cur_pele", LOrgShaders.skin)
    _org_mats.append_array(override_material("cur_cabelo", LOrgShaders.flame))
    var hand := imported_node("FX_mao_r")
    if hand != null:
        _hand_fire = LFx.fire(hand, 0.08, 40, Color(1.0, 0.7, 0.2), Color(1.0, 0.2, 0.02))
        LFx.set_rate(_hand_fire, 0.0)

func on_basic_attack() -> void:
    _punch = 1.0

func sync_view(dt: float) -> void:
    super.sync_view(dt)
    var kit := (unit as LChampion).kit as LCurupiraKit
    if kit == null:
        return
    var heat01 := kit.heat / LCurupiraKit.MAX_HEAT
    var spd := unit.vel.length()
    var cycle := anim_time * (6.0 + spd)
    var swing := sin(cycle) * 38.0 if spd > 0.5 else sin(anim_time * 2.0) * 3.0
    _hip_l.rotation_degrees.x = swing
    _hip_r.rotation_degrees.x = -swing
    _knee_l.rotation_degrees.x = -maxf(0.0, -swing) * 1.1 if spd > 0.5 else 0.0
    _knee_r.rotation_degrees.x = -maxf(0.0, swing) * 1.1 if spd > 0.5 else 0.0
    if _punch > 0.0:
        _punch = maxf(0.0, _punch - dt * 5.0)
    _arm_l.rotation_degrees = Vector3(-swing * 0.8, 0, -10)
    _arm_r.rotation_degrees = Vector3(swing * 0.8 - _punch * 100.0, 0, 10)
    _elbow_l.rotation_degrees.x = -15.0 - (absf(swing) * 0.5 if spd > 0.5 else 0.0)
    _elbow_r.rotation_degrees.x = -15.0 - (absf(swing) * 0.5 if spd > 0.5 else 0.0) + _punch * 10.0
    _body.rotation_degrees.x = clampf(spd * 2.0, 0.0, 15.0) + (25.0 if kit.is_dashing() else 0.0)
    _body.position = Vector3(0, absf(sin(cycle)) * 0.05 if spd > 0.5 else 0.0, 0) + hit_shake()
    _head.rotation_degrees = Vector3(-_body.rotation_degrees.x * 0.5, sin(anim_time * 0.9) * 6.0, 0)
    # cabelo de fogo tremula e é empurrado para trás pela corrida
    _hair.rotation_degrees = Vector3(-8.0 - spd * 2.5 + sin(anim_time * 9.0) * 3.0, sin(anim_time * 6.0) * 4.0, sin(anim_time * 7.3) * 3.0)
    _hair.scale = Vector3.ONE * (1.0 + heat01 * 0.25 + sin(anim_time * 14.0) * 0.03)
    for i in range(_fibers.size()):
        _fibers[i].rotation_degrees.x = sin(anim_time * 5.0 + i) * 5.0 + spd * 2.0 * (1.0 if i >= 13 else -1.0)
    # Domínio Térmico visível: veios de brasa e olhos mais intensos com Calor.
    _ember_mat.set_shader_parameter("emission_energy", lerpf(0.5, 3.0, heat01) + sin(anim_time * 3.0) * 0.2)
    _eye_mat.emission_energy_multiplier = lerpf(2.0, 5.0, heat01)
    LFx.set_rate(_hair_fire, 0.45 + heat01 * 0.55)
    LFx.set_rate(_trail_fire, (0.5 + heat01 * 0.5) if (spd > 0.5 or kit.is_dashing()) else 0.0)
    _light.light_energy = 1.0 + heat01 * 2.5
    for m in _org_mats:
        m.set_shader_parameter("heat", heat01)
    if _hand_fire != null:
        LFx.set_rate(_hand_fire, 1.0 if _punch > 0.05 else 0.15 + heat01 * 0.3)
    _sync_flames(kit)
    _jet.visible = kit.wrath_active()
    if _jet.visible:
        _jet.global_position = global_position + Vector3(0, 0.8, 0)
        _jet.rotation = Vector3(0, LMath.facing_yaw(kit.jet_dir), 0)
        var flick := 1.0 + sin(anim_time * 40.0) * 0.08
        _jet.scale = Vector3(flick, flick, 1.0)

func _sync_flames(kit: LCurupiraKit) -> void:
    var flames := kit.flames
    while _flames.size() < flames.size():
        var f := LMat.part(self, LMesh.tube([Vector3(0, 0, 0.18), Vector3(0, 0.02, 0.0), Vector3(0, 0.08, -0.3)], [0.17, 0.12, 0.0], 12, 4,
            1.0, Vector3(0, 1, 0), Color(1.0, 0.9, 0.45), Color(0.95, 0.15, 0.02)), Vector3.ZERO, LMat.fire_vc(1.6))
        f.top_level = true
        LFx.fire(f, 0.12, 30, Color(1.0, 0.75, 0.25), Color(1.0, 0.25, 0.02))
        _flames.append(f)
    for i in range(_flames.size()):
        var on := i < flames.size() and bool(flames[i]["alive"])
        _flames[i].visible = on
        if on:
            var p: Vector2 = flames[i]["pos"]
            var d: Vector2 = flames[i]["dir"]
            _flames[i].global_position = LMath.to_world(p, 1.1)
            _flames[i].rotation = Vector3(0, LMath.facing_yaw(d), 0)
