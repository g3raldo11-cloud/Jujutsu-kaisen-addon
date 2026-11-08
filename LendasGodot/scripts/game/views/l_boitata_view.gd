class_name LBoitataView
extends LUnitView
## Boitatá, modelo procedural detalhado: um único corpo serpentino contínuo, refeito a cada quadro
## passando exatamente pelos segmentos da simulação (colisão segmentada), coberto de escamas com
## relevo e frestas incandescentes; barbatanas de fogo ao longo da espinha; cabeça esculpida com
## focinho, mandíbula articulada, presas, crista de chifres de fogo e olhos enormes com pupila em
## fenda. O brilho das escamas acompanha o Calor.

const SIDES := 22
const FINS := 14

var _head: Node3D
var _jaw: Node3D
var _scale_mat: ShaderMaterial
var _eye_mat: StandardMaterial3D
var _light: OmniLight3D
var _body_mi: MeshInstance3D
var _body_mesh := ArrayMesh.new()
var _fins: Array[MeshInstance3D] = []
var _fires: Array[CPUParticles3D] = []
var _bite := 0.0
var _charge_fire: CPUParticles3D

func head_height() -> float:
    return 1.5

func model_id() -> String:
    return "boitata"

func _joint(parent: Node3D, pos: Vector3, rot_deg: Vector3 = Vector3.ZERO) -> Node3D:
    var j := Node3D.new()
    j.position = pos
    j.rotation_degrees = rot_deg
    parent.add_child(j)
    return j

func _build() -> void:
    _scale_mat = LMat.scales_mat()
    _eye_mat = LMat.emissive(Color(1.0, 0.9, 0.5), Color(1.0, 0.8, 0.3), 3.0)
    var dark := LMat.lit(Color(0.05, 0.015, 0.01), 0.4)
    var fang := LMat.lit(Color(0.95, 0.88, 0.7), 0.3)
    var mouth := LMat.emissive(Color(0.5, 0.06, 0.02), Color(1.0, 0.3, 0.04), 1.5)
    var fire := LMat.fire_vc(1.5)

    # ---------------- cabeça
    _head = _joint(model, Vector3(0, 0.55, 0))
    # crânio e focinho (ao longo de +Z), achatados
    LMat.part(_head, LMesh.tube([Vector3(0, 0.02, -0.4), Vector3(0, 0.07, -0.12), Vector3(0, 0.06, 0.15), Vector3(0, 0.02, 0.42), Vector3(0, -0.01, 0.6)],
        [0.36, 0.38, 0.33, 0.2, 0.09], SIDES, 4, 0.62, Vector3(0, 1, 0)), Vector3.ZERO, _scale_mat)
    # arcadas acima dos olhos e narinas
    for side in [-1.0, 1.0]:
        LMat.part(_head, LMesh.tube([Vector3(0.1 * side, 0.2, 0.32), Vector3(0.2 * side, 0.26, 0.18), Vector3(0.27 * side, 0.22, 0.0)],
            [0.04, 0.07, 0.05], 12, 4, 0.7), Vector3.ZERO, _scale_mat)
        var eye := _joint(_head, Vector3(0.215 * side, 0.15, 0.17))
        LMat.part(eye, LMesh.ellipsoid(Vector3(0.1, 0.085, 0.1), 20, 14), Vector3.ZERO, _eye_mat)
        LMat.part(eye, LMesh.ellipsoid(Vector3(0.012, 0.07, 0.02), 10, 10), Vector3(0.05 * side, 0, 0.075), dark, Vector3.ONE, Vector3(0, 35 * side, 0))
        LMat.part(_head, LMesh.ellipsoid(Vector3(0.03, 0.02, 0.03), 10, 8), Vector3(0.06 * side, 0.06, 0.58), mouth)
    # crista de chifres de fogo varrendo para trás
    for k in range(5):
        var x := (k - 2) * 0.08
        var base := Vector3(x, 0.22 - absf(x) * 0.4, 0.05 - absf(x) * 0.5)
        var h := 0.45 - absf(k - 2) * 0.09
        LMat.part(_head, LMesh.tube([base, base + Vector3(x * 0.3, h * 0.45, -h * 0.35), base + Vector3(x * 0.6, h * 0.7, -h * 0.95)],
            [0.055, 0.035, 0.0], 10, 4, 0.6, Vector3(1, 0, 0), Color(0.9, 0.2, 0.03), Color(1.0, 0.85, 0.3)), Vector3.ZERO, fire)
    # mandíbula articulada com língua de brasa e dentes
    _jaw = _joint(_head, Vector3(0, -0.06, -0.12))
    LMat.part(_jaw, LMesh.tube([Vector3(0, 0, 0), Vector3(0, -0.06, 0.25), Vector3(0, -0.06, 0.48), Vector3(0, -0.04, 0.62)],
        [0.25, 0.22, 0.13, 0.05], SIDES, 4, 0.4, Vector3(0, 1, 0)), Vector3.ZERO, _scale_mat)
    LMat.part(_jaw, LMesh.tube([Vector3(0, 0.02, 0.1), Vector3(0, 0.0, 0.35), Vector3(0, 0.02, 0.55)], [0.13, 0.09, 0.03], 14, 4, 0.3, Vector3(0, 1, 0)), Vector3.ZERO, mouth)
    for side in [-1.0, 1.0]:
        # presas superiores grandes e curvas
        LMat.part(_head, LMesh.tube([Vector3(0.12 * side, -0.03, 0.42), Vector3(0.125 * side, -0.12, 0.45), Vector3(0.11 * side, -0.2, 0.43)],
            [0.03, 0.02, 0.0], 10, 4), Vector3.ZERO, fang)
        for t in range(4):
            var z := 0.15 + t * 0.07
            LMat.part(_jaw, LMesh.tube([Vector3((0.16 - t * 0.02) * side, 0.0, z), Vector3((0.16 - t * 0.02) * side, 0.05, z + 0.01)], [0.015, 0.0], 6, 2), Vector3.ZERO, fang)
    var crest_fire := LFx.fire(_head, 0.18, 12, Color(1.0, 0.8, 0.3), Color(1.0, 0.25, 0.02))
    crest_fire.position = Vector3(0, 0.35, -0.15)
    _charge_fire = LFx.fire(self, 0.5, 70, Color(1.0, 0.85, 0.4), Color(1.0, 0.25, 0.02))
    _charge_fire.position = Vector3(0, 0.5, 0)
    LFx.set_rate(_charge_fire, 0.0)

    _light = OmniLight3D.new()
    _light.light_color = Color(1.0, 0.5, 0.18)
    _light.omni_range = 7.0
    _light.position = Vector3(0, 0.8, 0)
    _head.add_child(_light)

    # ---------------- corpo contínuo (malha refeita a cada quadro), barbatanas e chamas
    _body_mi = MeshInstance3D.new()
    _body_mi.mesh = _body_mesh
    _body_mi.material_override = _scale_mat
    _body_mi.top_level = true
    add_child(_body_mi)
    var fin_mesh := LMesh.tube([Vector3(0, 0, 0.12), Vector3(0, 0.16, 0.02), Vector3(0, 0.3, -0.16), Vector3(0, 0.36, -0.32)], [0.1, 0.075, 0.04, 0.0], 8, 4,
        0.22, Vector3(1, 0, 0), Color(0.85, 0.15, 0.02), Color(1.0, 0.82, 0.3))
    for i in range(FINS):
        var f := MeshInstance3D.new()
        f.mesh = fin_mesh
        f.material_override = fire
        f.top_level = true
        f.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
        add_child(f)
        _fins.append(f)
    for i in range(6):
        var holder := Node3D.new()
        holder.top_level = true
        add_child(holder)
        _fires.append(LFx.fire(holder, 0.3, 18, Color(1.0, 0.65, 0.15), Color(1.0, 0.15, 0.02)))

func on_basic_attack() -> void:
    _bite = 1.0

## Raio do corpo ao longo do comprimento (0 = pescoço, 1 = ponta da cauda).
static func _body_radius(t: float) -> float:
    if t < 0.22:
        return lerpf(0.36, 0.48, t / 0.22)
    return lerpf(0.48, 0.03, pow((t - 0.22) / 0.78, 1.15))

func sync_view(dt: float) -> void:
    super.sync_view(dt)
    var kit := (unit as LChampion).kit as LBoitataKit
    if kit == null:
        return
    var heat01 := kit.heat / LBoitataKit.MAX_HEAT
    var sc := kit.radius_mult()
    # Escamas em brasa: frestas mais quentes com Calor; na forma gigante, chama mais viva.
    _scale_mat.set_shader_parameter("emission_energy", lerpf(0.8, 3.2, heat01) * (1.3 if kit.giant_form() else 1.0) + sin(anim_time * 4.0) * 0.1)
    _eye_mat.emission_energy_multiplier = lerpf(2.0, 4.5, heat01)
    _light.light_energy = lerpf(0.8, 3.0, heat01) * (1.5 if kit.giant_form() else 1.0)
    _light.omni_range = 6.0 * sc + heat01 * 4.0
    _head.scale = Vector3.ONE * sc
    _head.position = Vector3(0, 0.55 * sc + sin(anim_time * 6.0) * 0.04, 0) + hit_shake()
    if _bite > 0.0:
        _bite = maxf(0.0, _bite - dt * 5.0)
    _head.rotation_degrees = Vector3(-_bite * 20.0, 0, sin(anim_time * 4.0) * 5.0)
    _jaw.rotation_degrees = Vector3(_bite * 35.0 + 6.0 + sin(anim_time * 2.0) * 2.0, 0, 0)
    LFx.set_rate(_charge_fire, 1.0 if kit.is_charging() else 0.0)

    # ---------------- corpo: pescoço (atrás da cabeça) + segmentos da simulação
    var ctrl := []
    var neck := global_position + Vector3(0, 0.5 * sc, 0) - Vector3(sin(rotation.y), 0, cos(rotation.y)) * 0.3 * sc
    ctrl.append(neck)
    var segs := kit.segments
    for i in range(segs.size()):
        var wave := sin(anim_time * 7.0 - i * 0.7) * 0.05
        ctrl.append(LMath.to_world(segs[i], (0.45 + wave) * sc * lerpf(1.0, 0.25, float(i) / maxf(1.0, segs.size() - 1))))
    var pts := LMesh.smooth_points(ctrl, 3)
    var n := pts.size()
    var rx := PackedFloat32Array()
    var ry := PackedFloat32Array()
    var cols := PackedColorArray()
    for i in range(n):
        var t := float(i) / maxf(1.0, n - 1)
        var r := _body_radius(t) * sc
        rx.append(r)
        ry.append(r * 0.82)
        cols.append(Color(1, 1, 1))
    _body_mesh.clear_surfaces()
    if unit.alive and n >= 2:
        _body_mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, LMesh.sweep_arrays(pts, rx, ry, SIDES, Vector3.UP, cols, 0.0, 6.0, true))
    _body_mi.visible = unit.alive

    # barbatanas de fogo ao longo da espinha, orientadas pelo corpo
    for i in range(_fins.size()):
        var f := _fins[i]
        var t := (float(i) + 0.6) / (FINS + 1.0)
        var k := clampi(int(t * (n - 1)), 1, maxi(1, n - 2))
        f.visible = unit.alive and n >= 3
        if not f.visible:
            continue
        var tangent := (pts[k - 1] - pts[k + 1])
        tangent.y = 0.0
        var r := _body_radius(float(k) / (n - 1)) * sc
        f.global_position = pts[k] + Vector3(0, r * 0.78, 0)
        if tangent.length_squared() > 1e-6:
            f.rotation = Vector3(0, atan2(tangent.x, tangent.z), 0)
        var flick := 1.0 + sin(anim_time * 13.0 + i * 1.3) * 0.12
        f.scale = Vector3.ONE * (r / 0.45) * (0.7 + heat01 * 0.6) * flick
    for i in range(_fires.size()):
        var t := (float(i) + 0.5) / _fires.size()
        var k := clampi(int(t * (n - 1)), 0, maxi(0, n - 1))
        var holder := _fires[i].get_parent() as Node3D
        if n > 0:
            holder.global_position = pts[k] + Vector3(0, _body_radius(t) * sc * 0.6, 0)
        LFx.set_rate(_fires[i], 0.0 if not unit.alive else (1.0 if heat01 >= 0.6 else 0.2 + heat01 * 0.6))
