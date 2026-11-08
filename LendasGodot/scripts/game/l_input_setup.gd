class_name LInputSetup
extends RefCounted
## Registra as ações de entrada em tempo de execução (teclado, mouse e controle).

static func _key(action: String, keys: Array, mouse: Array = [], joy_buttons: Array = [], joy_axes: Array = []) -> void:
    if not InputMap.has_action(action):
        InputMap.add_action(action, 0.25)
    for k in keys:
        var e := InputEventKey.new()
        e.physical_keycode = k
        InputMap.action_add_event(action, e)
    for b in mouse:
        var m := InputEventMouseButton.new()
        m.button_index = b
        InputMap.action_add_event(action, m)
    for j in joy_buttons:
        var jb := InputEventJoypadButton.new()
        jb.button_index = j
        InputMap.action_add_event(action, jb)
    for ax in joy_axes:
        var ja := InputEventJoypadMotion.new()
        ja.axis = ax[0]
        ja.axis_value = ax[1]
        InputMap.action_add_event(action, ja)

static func ensure() -> void:
    if InputMap.has_action("habilidade_1"):
        return
    _key("mover_frente", [KEY_W], [], [], [[JOY_AXIS_LEFT_Y, -1.0]])
    _key("mover_tras", [KEY_S], [], [], [[JOY_AXIS_LEFT_Y, 1.0]])
    _key("mover_esquerda", [KEY_A], [], [], [[JOY_AXIS_LEFT_X, -1.0]])
    _key("mover_direita", [KEY_D], [], [], [[JOY_AXIS_LEFT_X, 1.0]])
    _key("camera_esquerda", [KEY_LEFT], [], [], [[JOY_AXIS_RIGHT_X, -1.0]])
    _key("camera_direita", [KEY_RIGHT], [], [], [[JOY_AXIS_RIGHT_X, 1.0]])
    _key("camera_cima", [KEY_UP], [], [], [[JOY_AXIS_RIGHT_Y, -1.0]])
    _key("camera_baixo", [KEY_DOWN], [], [], [[JOY_AXIS_RIGHT_Y, 1.0]])
    _key("atacar", [], [MOUSE_BUTTON_LEFT])
    _key("atacar_controle", [], [], [], [[JOY_AXIS_TRIGGER_RIGHT, 1.0]])
    _key("habilidade_1", [KEY_Q], [], [JOY_BUTTON_X])
    _key("habilidade_2", [KEY_E], [], [JOY_BUTTON_Y])
    _key("habilidade_3", [KEY_F], [], [JOY_BUTTON_B])
    _key("suprema", [KEY_R], [], [JOY_BUTTON_RIGHT_SHOULDER])
    _key("esquiva", [KEY_CTRL], [MOUSE_BUTTON_RIGHT], [JOY_BUTTON_LEFT_SHOULDER])
    _key("saltar", [KEY_SPACE], [], [JOY_BUTTON_A])
    _key("correr", [KEY_SHIFT], [], [JOY_BUTTON_LEFT_STICK])
    _key("escolher_saci", [KEY_1])
    _key("escolher_boitata", [KEY_2])
    _key("escolher_curupira", [KEY_3])
    _key("alternar_aliado", [KEY_TAB], [], [JOY_BUTTON_BACK])
    _key("boneco_anda", [KEY_M])
    _key("zerar_boneco", [KEY_BACKSPACE])
    _key("ajuda", [KEY_H], [], [JOY_BUTTON_START])
    _key("soltar_cursor", [KEY_ESCAPE])
