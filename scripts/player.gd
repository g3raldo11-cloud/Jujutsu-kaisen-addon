class_name Player
extends Node2D
## Jogador simples: anda com WASD ou setas.

@export var speed := 220.0
var can_move := true
var bounds := Rect2(40, 60, 1072, 548)


func _process(delta: float) -> void:
	if not can_move:
		return
	var dir := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	position += dir * speed * delta
	position = position.clamp(bounds.position, bounds.end)


func _draw() -> void:
	draw_circle(Vector2(0, 22), 15, Color(0, 0, 0, 0.25))
	draw_rect(Rect2(-13, -4, 26, 26), Color(0.15, 0.17, 0.25))
	draw_circle(Vector2(0, -12), 13, Color(0.98, 0.85, 0.72))
	draw_rect(Rect2(-13, -26, 26, 8), Color(0.1, 0.1, 0.1))
	draw_string(ThemeDB.fallback_font, Vector2(-60, -34), "Você", HORIZONTAL_ALIGNMENT_CENTER, 120, 13, Color(0.8, 0.9, 1))
