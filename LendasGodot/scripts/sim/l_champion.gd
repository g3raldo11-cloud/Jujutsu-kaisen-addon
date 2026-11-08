class_name LChampion
extends LUnit
## Entidade jogável (humano ou bot).

var name: String = ""
var char_id: String = ""
var stats: LStats
var kit: LKit
var is_bot := false
var is_dummy := false
var energy := 100.0
var max_energy := 100.0
var ult := 0.0
var cd: Array[float] = [0.0, 0.0, 0.0, 0.0, 0.0]
var dodge_cd := 0.0
var jump_cd := 0.0
var stamina := 100.0
var sprinting := false
var respawn := 0.0
var cast_lock := 0.0
var since_damaged := 999.0
var since_attack := 999.0
var damage_dealt := 0.0
var synergies := 0
var counters := {}

func can_act() -> bool:
    return alive and cast_lock <= 0.0 and not status.has(LStatus.ATORD)

func can_move() -> bool:
    return alive and not status.has(LStatus.ATORD) and not status.has(LStatus.RAIZ)

func count(key: String) -> void:
    counters[key] = int(counters.get(key, 0)) + 1

func radius_mult() -> float:
    return kit.radius_mult() if kit != null else 1.0
