class_name LUnit
extends RefCounted
## Qualquer coisa que ocupa espaço, tem vida e pode ser alvo.

var id: int = 0
var team: int = 0
var pos := Vector2.ZERO
var vel := Vector2.ZERO
var facing := Vector2.RIGHT
var radius := 0.5
var hp := 1.0
var max_hp := 1.0
var alive := true
var status := LStatus.new()
var forced_vel := Vector2.ZERO
var forced_time := 0.0
var invuln := 0.0
var airborne := 0.0

func _init(p_id: int = 0, p_team: int = 0) -> void:
    id = p_id
    team = p_team

func targetable() -> bool:
    return alive and invuln <= 0.0

func is_air() -> bool:
    return airborne > 0.0

func hp_frac() -> float:
    return hp / max_hp if max_hp > 0.0 else 0.0

## Deslocamento forçado (investidas, empurrões). Imparável ignora.
func push(v: Vector2, dur: float) -> void:
    if status.has(LStatus.IMPAR):
        return
    forced_vel = v
    forced_time = dur

func radius_mult() -> float:
    return 1.0
