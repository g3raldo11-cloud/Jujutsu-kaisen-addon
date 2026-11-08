class_name LBoitataView
extends LUnitView
## Boitatá: serpente de escamas luminosas e fogo. Cada segmento é desenhado exatamente onde a
## simulação o colocou (colisão segmentada). O brilho acompanha o Calor.

var _head: Node3D
var _jaw: MeshInstance3D
var _scale_mat: StandardMaterial3D
var _light: OmniLight3D
var _segments: Array[MeshInstance3D] = []
var _seg_fire: Array[CPUParticles3D] = []
var _bite := 0.0

func head_height() -> float:
    return 1.4

func _build() -> void:
    _scale_mat = LMat.emissive(Color(0.32, 0.07, 0.02), Color(0.85, 0.2, 0.03), 0.4)
    var eye_mat := LMat.emissive(Color(1.0, 0.9, 0.55), Color(1.0, 0.85, 0.35), 3.0)
    var dark := LMat.lit(Color(0.08, 0.03, 0.02), 0.5)
    _head = Node3D.new()
    _head.position = Vector3(0, 0.55, 0)
    model.add_child(_head)
    LMat.part(_head, LMat.sphere(0.5), Vector3.ZERO, _scale_mat, Vector3(0.75, 0.5, 1.15), Vector3.ZERO, "Crânio")
    LMat.part(_head, LMat.sphere(0.5), Vector3(0, 0.12, -0.15), _scale_mat, Vector3(0.6, 0.35, 0.8))
    _jaw = LMat.part(_head, LMat.sphere(0.5), Vector3(0, -0.15, 0.15), dark, Vector3(0.55, 0.2, 0.9), Vector3.ZERO, "Mandíbula")
    # Olhos intensamente brilhantes, marca da lenda.
    for side in [-1.0, 1.0]:
        LMat.part(_head, LMat.sphere(0.1), Vector3(0.27 * side, 0.12, 0.32), eye_mat, Vector3(1.0, 0.8, 1.1))
        LMat.part(_head, LMat.cone(0.06, 0.35), Vector3(0.22 * side, 0.22, 0.05), _scale_mat, Vector3.ONE, Vector3(-60, 0, -20 * side))
    LFx.fire(_head, 0.35, 28, Color(1.0, 0.8, 0.3), Color(1.0, 0.25, 0.02))
    _light = OmniLight3D.new()
    _light.light_color = Color(1.0, 0.55, 0.2)
    _light.omni_range = 7.0
    _light.position = Vector3(0, 0.8, 0)
    _head.add_child(_light)
    for i in range(LBoitataKit.GIANT_SEGS):
        var t := float(i) / float(LBoitataKit.GIANT_SEGS - 1)
        var r := lerpf(0.95, 0.35, t)
        var seg := LMat.part(self, LMat.sphere(0.5, 14), Vector3.ZERO, _scale_mat, Vector3(r, r * 0.8, r * 1.25), Vector3.ZERO, "Segmento%d" % i)
        seg.top_level = true  # os segmentos ficam no mundo, não presos à cabeça
        _segments.append(seg)
        var f := LFx.fire(seg, 0.3, 14, Color(1.0, 0.65, 0.15), Color(1.0, 0.15, 0.02))
        _seg_fire.append(f)

func on_basic_attack() -> void:
    _bite = 1.0

func sync_view(dt: float) -> void:
    super.sync_view(dt)
    var kit := (unit as LChampion).kit as LBoitataKit
    if kit == null:
        return
    var heat01 := kit.heat / LBoitataKit.MAX_HEAT
    var sc := kit.radius_mult()
    # Escamas em brasa: laranja-avermelhado que esquenta para âmbar (sem estourar para branco).
    var glow_c := Color(1.0, 0.38, 0.06) if kit.giant_form() else Color(0.8, 0.15, 0.02).lerp(Color(1.0, 0.32, 0.05), heat01)
    _scale_mat.emission = glow_c
    _scale_mat.emission_energy_multiplier = lerpf(0.25, 0.75, heat01) * (1.15 if kit.giant_form() else 1.0)
    _light.light_energy = lerpf(0.8, 3.5, heat01) * (1.6 if kit.giant_form() else 1.0)
    _light.omni_range = 6.0 * sc + heat01 * 4.0
    _head.scale = Vector3.ONE * sc
    _head.position = Vector3(0, 0.55 * sc + sin(anim_time * 6.0) * 0.05, 0) + hit_shake()
    if _bite > 0.0:
        _bite = maxf(0.0, _bite - dt * 5.0)
    _head.rotation_degrees = Vector3(-_bite * 25.0, 0, sin(anim_time * 4.0) * 6.0)
    _jaw.rotation_degrees = Vector3(_bite * 35.0, 0, 0)
    var segs := kit.segments
    for i in range(_segments.size()):
        var node := _segments[i]
        var active := unit.alive and i < segs.size()
        node.visible = active
        LFx.set_rate(_seg_fire[i], 0.0 if not active else (1.0 if heat01 >= 0.6 else 0.25 + heat01 * 0.5))
        if not active:
            continue
        var p := LMath.to_world(segs[i], 0.42 * sc + sin(anim_time * 7.0 - i * 0.7) * 0.07)
        node.global_position = node.global_position.lerp(p, 1.0 - exp(-dt * 25.0))
        if node.global_position.distance_squared_to(p) > 9.0:
            node.global_position = p
        var ahead := global_position if i == 0 else _segments[i - 1].global_position
        var dir := ahead - node.global_position
        dir.y = 0.0
        if dir.length_squared() > 1e-4:
            node.rotation = Vector3(0, atan2(dir.x, dir.z), 0)
        var t := float(i) / float(maxi(1, segs.size() - 1))
        var r := lerpf(0.95, 0.35, t) * sc
        node.scale = Vector3(r, r * 0.8, r * 1.25)
