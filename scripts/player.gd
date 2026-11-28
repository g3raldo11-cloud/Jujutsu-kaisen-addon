class_name Player
extends CharacterBody2D
## O cachorrinho do jogador: anda com WASD ou setas, nas 4 direções.

@export var speed := 95.0
var can_move := true
var facing := "s"
var sprite: AnimatedSprite2D
var _frames := {}


func _ready() -> void:
	motion_mode = CharacterBody2D.MOTION_MODE_FLOATING
	for d in ["s", "n", "e", "w"]:
		_frames[d] = load("res://sprites/filhote_jogador-%s.tres" % d)
	sprite = AnimatedSprite2D.new()
	sprite.centered = false
	sprite.offset = Vector2(-32, -62)
	sprite.sprite_frames = _frames["s"]
	add_child(sprite)
	sprite.play("idle")

	# colisão só nos pés: dá para passar "atrás" das coisas
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = Vector2(18, 8)
	shape.shape = rect
	shape.position = Vector2(0, -4)
	add_child(shape)


func _physics_process(_delta: float) -> void:
	var dir := Vector2.ZERO
	if can_move:
		dir = Input.get_vector("move_left", "move_right", "move_up", "move_down")
	velocity = dir * speed
	move_and_slide()
	_update_animation(dir)


func _update_animation(dir: Vector2) -> void:
	var moving := dir.length() > 0.1
	if moving:
		if absf(dir.x) > absf(dir.y):
			facing = "e" if dir.x > 0.0 else "w"
		else:
			facing = "s" if dir.y > 0.0 else "n"
	_play("walk" if moving else "idle")


## Vira para olhar um ponto (por exemplo, o bichinho com quem vai conversar).
func face_towards(target: Vector2) -> void:
	var d := target - global_position
	if absf(d.x) > absf(d.y):
		facing = "e" if d.x > 0.0 else "w"
	else:
		facing = "s" if d.y > 0.0 else "n"
	_play("idle")


func _play(anim: String) -> void:
	var frames: SpriteFrames = _frames[facing]
	if sprite.sprite_frames != frames:
		sprite.sprite_frames = frames
		sprite.play(anim)
	elif sprite.animation != anim:
		sprite.play(anim)
