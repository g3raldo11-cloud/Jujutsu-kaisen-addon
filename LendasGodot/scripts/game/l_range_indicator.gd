class_name LRangeIndicator
extends MeshInstance3D
## Indicador de alcance no chão enquanto a tecla da habilidade está pressionada.

const SEGMENTS := 48
var _im := ImmediateMesh.new()
var _fill := LMat.transparent(Color(1.0, 0.8, 0.3, 0.16))
var _line := LMat.transparent(Color(1.0, 0.85, 0.4, 0.95))

func _ready() -> void:
    mesh = _im
    cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
    top_level = true

func hide_indicator() -> void:
    _im.clear_surfaces()

func show_for(a: LAbility, origin3: Vector3, aim3: Vector3) -> void:
    _im.clear_surfaces()
    if a == null:
        return
    var o := Vector2(origin3.x, origin3.z)
    var dir := Vector2(aim3.x, aim3.z) - o
    dir = dir.normalized() if dir.length_squared() > 1e-4 else Vector2(0, 1)
    var reach := a.reach if a.reach > 0.0 else a.area
    var outline: Array[Vector2] = []
    var fill_center := o
    match a.shape:
        "circle":
            outline = _circle(o, a.area if a.area > 0.0 else reach)
        "cone":
            var half := deg_to_rad(a.cone * 0.5)
            outline.append(o)
            for i in range(SEGMENTS + 1):
                var ang := lerpf(-half, half, float(i) / SEGMENTS)
                outline.append(o + dir.rotated(ang) * reach)
        "line":
            var w := maxf(0.6, a.area)
            var side := LMath.perp(dir) * w
            outline = [o + side, o + side + dir * reach, o - side + dir * reach, o - side]
            fill_center = o + dir * reach * 0.5
        "area":
            _draw(_circle(o, reach), o, false)
            var flat := Vector2(aim3.x, aim3.z) - o
            var c := o + flat.limit_length(reach)
            outline = _circle(c, a.area)
            fill_center = c
        _:
            outline = _circle(o, 1.2)
    _draw(outline, fill_center, true)

func _circle(c: Vector2, r: float) -> Array[Vector2]:
    var pts: Array[Vector2] = []
    for i in range(SEGMENTS):
        var ang := float(i) / SEGMENTS * TAU
        pts.append(c + Vector2(cos(ang), sin(ang)) * r)
    return pts

func _draw(pts: Array[Vector2], center: Vector2, filled: bool) -> void:
    if pts.size() < 2:
        return
    var y := 0.06
    if filled:
        _im.surface_begin(Mesh.PRIMITIVE_TRIANGLES, _fill)
        for i in range(pts.size()):
            var a := pts[i]
            var b := pts[(i + 1) % pts.size()]
            _im.surface_add_vertex(Vector3(center.x, y, center.y))
            _im.surface_add_vertex(Vector3(a.x, y, a.y))
            _im.surface_add_vertex(Vector3(b.x, y, b.y))
        _im.surface_end()
    _im.surface_begin(Mesh.PRIMITIVE_LINE_STRIP, _line)
    for p in pts:
        _im.surface_add_vertex(Vector3(p.x, y + 0.01, p.y))
    _im.surface_add_vertex(Vector3(pts[0].x, y + 0.01, pts[0].y))
    _im.surface_end()
