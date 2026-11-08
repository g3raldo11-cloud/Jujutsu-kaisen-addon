class_name LKit
extends RefCounted
## Lógica exclusiva de cada entidade (passiva, habilidades, mecânica própria, uso por bot).
## O combate comum (recargas, energia, dano, controle) fica em LSim.

var sim: LSim
var owner: LChampion

func bind(p_sim: LSim, p_owner: LChampion) -> void:
    sim = p_sim
    owner = p_owner
    _on_bind()

func unbind() -> void:
    sim = null
    owner = null

func _on_bind() -> void:
    pass

## Executa a habilidade; recarga e custo só são aplicados se retornar true.
func cast(_slot: int, _aim: Vector2) -> bool:
    return false

## Reconjuração (trocar antes do tempo, saltar entre redemoinhos...).
func try_recast(_slot: int, _aim: Vector2) -> bool:
    return false

func tick() -> void:
    pass

func on_move_input(_dir: Vector2) -> void:
    pass

func speed_mult() -> float:
    return 1.0

func damage_mult() -> float:
    return 1.0

func radius_mult() -> float:
    return 1.0

func damage_taken_mult() -> float:
    return 1.0

func can_basic() -> bool:
    return true

func ignores_slows() -> bool:
    return false

func aquatic() -> bool:
    return false

func on_basic_hit(_target: LUnit) -> void:
    pass

func on_death() -> void:
    pass

func on_respawn() -> void:
    pass

func is_recast(_slot: int) -> bool:
    return false

func bot_use(_ctx: LBotContext) -> void:
    pass

## Recurso exclusivo exibido na interface (Travessura, Calor...).
func res_name() -> String:
    return ""

func res_value() -> float:
    return 0.0

func res_max() -> float:
    return 1.0
