class_name LSpin
extends Node3D
## Gira em torno do eixo Y (redemoinhos, ventania).

var speed := 7.0

func _process(delta: float) -> void:
    rotate_y(speed * delta)
