class_name LCameraRig
extends Node3D
## Câmera em terceira pessoa: mouse (cursor preso), setas ou analógico direito giram;
## a roda do mouse ajusta a distância. A mira é o centro da tela projetado no chão.

var target: Node3D
var camera: Camera3D
var yaw := PI * 0.5
var pitch := deg_to_rad(35.0)
var distance := 7.0
var min_distance := 4.0
var max_distance := 18.0
var sensitivity := 0.0035
var height := 1.2
var _shake := 0.0

func _ready() -> void:
    camera = Camera3D.new()
    camera.fov = 60.0
    camera.far = 300.0
    add_child(camera)
    camera.make_current()

func _unhandled_input(event: InputEvent) -> void:
    if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
        var m := event as InputEventMouseMotion
        yaw -= m.relative.x * sensitivity
        pitch = clampf(pitch + m.relative.y * sensitivity, deg_to_rad(10.0), deg_to_rad(70.0))
    elif event is InputEventMouseButton and event.pressed:
        var b := event as InputEventMouseButton
        if b.button_index == MOUSE_BUTTON_WHEEL_UP:
            distance = clampf(distance - 1.0, min_distance, max_distance)
        elif b.button_index == MOUSE_BUTTON_WHEEL_DOWN:
            distance = clampf(distance + 1.0, min_distance, max_distance)

func _process(delta: float) -> void:
    var look := Input.get_vector("camera_esquerda", "camera_direita", "camera_cima", "camera_baixo")
    yaw -= look.x * 2.2 * delta
    pitch = clampf(pitch + look.y * 1.5 * delta, deg_to_rad(10.0), deg_to_rad(70.0))
    if target == null or not is_instance_valid(target):
        return
    var focus := target.global_position + Vector3.UP * height
    var dir := Vector3(cos(pitch) * sin(yaw), -sin(pitch), cos(pitch) * cos(yaw))
    camera.global_position = focus - dir * distance
    camera.look_at(focus, Vector3.UP)
    if _shake > 0.001:
        var t := Time.get_ticks_msec() / 1000.0
        camera.global_position += Vector3(sin(t * 61.0), sin(t * 47.0 + 1.3), cos(t * 53.0)) * _shake * 0.35
        _shake = maxf(0.0, _shake - delta * 2.5)

## Tremor de câmera (explosões, Supremas, golpes pesados).
func add_shake(amount: float) -> void:
    _shake = clampf(_shake + amount, 0.0, 1.2)

func flat_forward() -> Vector3:
    return Vector3(sin(yaw), 0.0, cos(yaw))

func flat_right() -> Vector3:
    var f := flat_forward()
    return Vector3(-f.z, 0.0, f.x)

## WASD/analógico → direção no mundo relativa à câmera.
func move_direction(axes: Vector2) -> Vector3:
    return (flat_forward() * axes.y + flat_right() * axes.x).limit_length(1.0)

## Ponto mirado: centro da tela projetado no chão (y = 0), limitado ao alcance.
func aim_point(max_range: float) -> Vector3:
    var origin := target.global_position if target != null else Vector3.ZERO
    var vp := get_viewport().get_visible_rect().size
    var ray_o := camera.project_ray_origin(vp * 0.5)
    var ray_d := camera.project_ray_normal(vp * 0.5)
    var hit: Vector3
    if ray_d.y < -1e-3:
        hit = ray_o + ray_d * (-ray_o.y / ray_d.y)
    else:
        hit = origin + flat_forward() * max_range
    var flat := hit - origin
    flat.y = 0.0
    var fwd := flat_forward()
    var along := flat.dot(fwd)
    if along < 1.5:
        flat = fwd * 1.5 + (flat - fwd * along)
    return origin + flat.limit_length(max_range)
