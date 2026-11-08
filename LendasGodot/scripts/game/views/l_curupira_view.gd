class_name LCurupiraView
extends LUnitView
## Curupira (versão de fogo): corpo atlético e sobrenatural, cabelos vermelhos em combustão,
## pés voltados para trás, marcas luminosas como brasas e chamas que acompanham o movimento.

var _body: Node3D
var _leg_l: Node3D
var _leg_r: Node3D
var _arm_l: Node3D
var _arm_r: Node3D
var _ember_mat: StandardMaterial3D
var _hair_mat: StandardMaterial3D
var _hair_fire: CPUParticles3D
var _trail_fire: CPUParticles3D
var _light: OmniLight3D
var _flames: Array[MeshInstance3D] = []
var _jet: Node3D
var _punch := 0.0

func head_height() -> float:
    return 2.0

func _build() -> void:
    var skin := LMat.lit(Color(0.42, 0.24, 0.14), 0.55)
    var dark := LMat.lit(Color(0.12, 0.06, 0.03), 0.6)
    var cloth := LMat.lit(Color(0.55, 0.4, 0.2), 0.9)
    _ember_mat = LMat.emissive(Color(0.6, 0.15, 0.03), Color(1.0, 0.4, 0.05), 2.0)
    _hair_mat = LMat.emissive(Color(0.85, 0.12, 0.03), Color(1.0, 0.3, 0.02), 2.5)
    var eye_mat := LMat.emissive(Color(1.0, 0.85, 0.5), Color(1.0, 0.7, 0.2), 4.0)

    _body = Node3D.new()
    model.add_child(_body)
    _leg_l = _make_leg(-0.14, skin)
    _leg_r = _make_leg(0.14, skin)
    # Tanga de fibras e tronco atlético (ombros largos, cintura fina).
    LMat.part(_body, LMat.cylinder(0.2, 0.21, 0.16), Vector3(0, 0.95, 0), cloth, Vector3(1, 1, 0.75))
    LMat.part(_body, LMat.capsule(0.21, 0.66), Vector3(0, 1.25, 0), skin, Vector3(1, 1, 0.68))
    LMat.part(_body, LMat.sphere(0.5), Vector3(0, 1.47, 0), skin, Vector3(0.6, 0.22, 0.3))
    # Marcas luminosas semelhantes a brasas.
    for i in range(3):
        LMat.part(_body, LMat.box(Vector3(0.3 - i * 0.05, 0.025, 0.02)), Vector3(0, 1.15 + i * 0.1, 0.15), _ember_mat)
    LMat.part(_body, LMat.box(Vector3(0.025, 0.3, 0.02)), Vector3(0, 1.32, 0.155), _ember_mat)
    _arm_l = _make_arm(-1.0, skin)
    _arm_r = _make_arm(1.0, skin)

    var head := LMat.part(_body, LMat.sphere(0.15), Vector3(0, 1.72, 0.01), skin, Vector3(0.95, 1.08, 1.0), Vector3.ZERO, "Cabeça")
    for side in [-1.0, 1.0]:
        LMat.part(head, LMat.sphere(0.035), Vector3(0.055 * side, 0.02, 0.13), eye_mat, Vector3(1.3, 0.8, 0.8))
        LMat.part(head, LMat.box(Vector3(0.06, 0.012, 0.01)), Vector3(0.09 * side, -0.045, 0.125), _ember_mat, Vector3.ONE, Vector3(0, 0, 20 * side))
    LMat.part(head, LMat.box(Vector3(0.07, 0.01, 0.01)), Vector3(0, -0.085, 0.14), dark)
    # Cabelos vermelhos em combustão: mechas para cima e para trás + fogo.
    var hair := Node3D.new()
    hair.position = Vector3(0, 0.1, -0.03)
    head.add_child(hair)
    for i in range(9):
        var a := (i / 8.0 - 0.5) * 140.0
        var tilt := -25.0 - (i % 3) * 18.0
        var h := 0.28 + (i % 2) * 0.12
        LMat.part(hair, LMat.cone(0.06, h), Vector3(sin(deg_to_rad(a)) * 0.1, 0.0, -absf(a) * 0.0006), _hair_mat, Vector3.ONE, Vector3(tilt, 0, -a * 0.6))
    _hair_fire = LFx.fire(hair, 0.12, 50, Color(1.0, 0.6, 0.12), Color(1.0, 0.12, 0.02))
    _hair_fire.position = Vector3(0, 0.2, -0.05)
    # Chamas que acompanham o movimento (rastro nos pés).
    _trail_fire = LFx.fire(model, 0.25, 40, Color(1.0, 0.55, 0.12), Color(1.0, 0.2, 0.02))
    _trail_fire.position = Vector3(0, 0.15, 0)
    _light = OmniLight3D.new()
    _light.light_color = Color(1.0, 0.45, 0.15)
    _light.omni_range = 6.0
    _light.position = Vector3(0, 0.5, 0)
    head.add_child(_light)
    # Labareda da Ira do Curupira (direção controlada pela mira).
    _jet = Node3D.new()
    _jet.top_level = true
    add_child(_jet)
    var flame := LMat.part(_jet, LMat.cylinder(0.25, 0.9, 9.0, 16), Vector3(0, 0, 4.5), LMat.glow(Color(1.0, 0.45, 0.08, 0.45)), Vector3.ONE, Vector3(90, 0, 0))
    flame.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
    var jf := LFx.fire(_jet, 0.6, 90, Color(1.0, 0.7, 0.2), Color(1.0, 0.2, 0.02))
    jf.position = Vector3(0, 0, 4.5)
    jf.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
    jf.emission_box_extents = Vector3(0.6, 0.3, 4.5)
    _jet.visible = false

func _make_leg(x: float, skin: Material) -> Node3D:
    var hip := Node3D.new()
    hip.position = Vector3(x, 0.92, 0)
    _body.add_child(hip)
    LMat.part(hip, LMat.capsule(0.075, 0.9), Vector3(0, -0.45, 0), skin)
    # Pé voltado para trás: calcanhar à frente, dedos atrás.
    var foot := LMat.part(hip, LMat.sphere(0.5), Vector3(0, -0.88, -0.1), skin, Vector3(0.14, 0.08, 0.32), Vector3.ZERO, "Pé (virado para trás)")
    for t in range(3):
        LMat.part(foot, LMat.sphere(0.5), Vector3((t - 1) * 0.3, 0.0, -0.5), skin, Vector3(0.3, 0.6, 0.25))
    return hip

func _make_arm(side: float, skin: Material) -> Node3D:
    var shoulder := Node3D.new()
    shoulder.position = Vector3(0.3 * side, 1.48, 0)
    _body.add_child(shoulder)
    LMat.part(shoulder, LMat.capsule(0.06, 0.64), Vector3(0, -0.32, 0), skin)
    return shoulder

func on_basic_attack() -> void:
    _punch = 1.0

func sync_view(dt: float) -> void:
    super.sync_view(dt)
    var kit := (unit as LChampion).kit as LCurupiraKit
    if kit == null:
        return
    var heat01 := kit.heat / LCurupiraKit.MAX_HEAT
    var spd := unit.vel.length()
    var swing := sin(anim_time * (6.0 + spd)) * 40.0 if spd > 0.5 else sin(anim_time * 2.0) * 3.0
    _leg_l.rotation_degrees.x = swing
    _leg_r.rotation_degrees.x = -swing
    if _punch > 0.0:
        _punch = maxf(0.0, _punch - dt * 5.0)
    _arm_l.rotation_degrees = Vector3(-swing, 0, -8)
    _arm_r.rotation_degrees = Vector3(swing - _punch * 100.0, 0, 8)
    _body.rotation_degrees.x = clampf(spd * 2.0, 0.0, 15.0) + (25.0 if kit.is_dashing() else 0.0)
    _body.position = Vector3(0, absf(sin(anim_time * (6.0 + spd))) * 0.06 if spd > 0.5 else 0.0, 0) + hit_shake()
    # Domínio Térmico visível: brasas e cabelo mais intensos com Calor.
    _ember_mat.emission_energy_multiplier = lerpf(0.8, 2.6, heat01)
    _hair_mat.emission = Color(1.0, 0.55, 0.1) if kit.is_hot() else Color(1.0, 0.3, 0.02)
    _hair_mat.emission_energy_multiplier = lerpf(1.2, 2.6, heat01)
    LFx.set_rate(_hair_fire, 0.45 + heat01 * 0.55)
    LFx.set_rate(_trail_fire, (0.5 + heat01 * 0.5) if (spd > 0.5 or kit.is_dashing()) else 0.0)
    _light.light_energy = 1.0 + heat01 * 2.5
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
        var f := LMat.part(self, LMat.sphere(0.2), Vector3.ZERO, LMat.emissive(Color(1.0, 0.45, 0.08), Color(1.0, 0.4, 0.05), 1.6))
        f.top_level = true
        LFx.fire(f, 0.12, 30, Color(1.0, 0.75, 0.25), Color(1.0, 0.25, 0.02))
        _flames.append(f)
    for i in range(_flames.size()):
        var on := i < flames.size() and bool(flames[i]["alive"])
        _flames[i].visible = on
        if on:
            _flames[i].global_position = LMath.to_world(flames[i]["pos"], 1.1)
