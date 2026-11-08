class_name LFunnel
extends Node3D
## Funil de tornado: cone invertido translúcido que gira, com textura de vento rolando para cima.
## Usado no Redemoinho e nas âncoras do Saci, e na Tempestade de Brasas (versão de fogo).

var spin := 9.0
var scroll := 1.6
var _mat: StandardMaterial3D
var _mi: MeshInstance3D
var _base_alpha := 0.45

static func make(parent: Node3D, r_bottom: float, r_top: float, height: float, color: Color, fiery: bool = false) -> LFunnel:
    var f := LFunnel.new()
    parent.add_child(f)
    f._build(r_bottom, r_top, height, color, fiery)
    return f

func _build(r_bottom: float, r_top: float, height: float, color: Color, fiery: bool) -> void:
    var ctrl := []
    var radii := []
    for i in range(7):
        var t := float(i) / 6.0
        ctrl.append(Vector3(sin(t * 5.0) * 0.08 * height, t * height, cos(t * 4.0) * 0.06 * height))
        radii.append(lerpf(r_bottom, r_top, pow(t, 1.4)))
    _mi = MeshInstance3D.new()
    _mi.mesh = LMesh.tube(ctrl, radii, 28, 3, 1.0, Vector3(0, 0, 1), Color(1, 1, 1, 0.15), Color(1, 1, 1, 1.0), 0.0, 6.0, false)
    _mat = StandardMaterial3D.new()
    _mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
    _mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
    _mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
    _mat.cull_mode = BaseMaterial3D.CULL_DISABLED
    _mat.vertex_color_use_as_albedo = true
    _mat.albedo_texture = LTex.smoke() if not fiery else LTex.flame()
    _mat.uv1_scale = Vector3(4.0, 2.0, 1.0)
    _base_alpha = 0.55 if fiery else 0.4
    _mat.albedo_color = Color(color.r, color.g, color.b, _base_alpha)
    _mi.material_override = _mat
    _mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
    add_child(_mi)

func set_strength(k: float) -> void:
    _mat.albedo_color.a = _base_alpha * clampf(k, 0.0, 1.0)
    visible = k > 0.01

func _process(delta: float) -> void:
    rotate_y(spin * delta)
    _mat.uv1_offset.y -= scroll * delta
