extends Node2D
## Monta a Vila dos Bichinhos: chão, casinhas, árvores, laguinho, bichinhos,
## o cachorrinho do jogador, a câmera, o HUD e as janelas de conversa e configuração.

const WORLD_SIZE := Vector2(768, 480)
const CAMERA_ZOOM := 2.0

## Casinhas: posição dos pés (meio da base) e o quadro do telhado (0 rosa, 1 azul, 2 verde).
const HOUSES := [
	{"pos": Vector2(168, 176), "frame": 0},
	{"pos": Vector2(600, 148), "frame": 1},
	{"pos": Vector2(600, 340), "frame": 2},
]
const TREES := [
	Vector2(40, 70), Vector2(100, 50), Vector2(60, 140), Vector2(270, 60), Vector2(450, 60),
	Vector2(500, 120), Vector2(520, 40), Vector2(700, 60), Vector2(745, 150), Vector2(720, 250),
	Vector2(690, 300), Vector2(740, 330), Vector2(700, 420), Vector2(650, 465), Vector2(500, 455),
	Vector2(430, 430), Vector2(320, 440), Vector2(60, 300), Vector2(40, 420), Vector2(95, 465),
	Vector2(250, 300),
]
const BUSHES := [
	Vector2(232, 150), Vector2(115, 175), Vector2(640, 130), Vector2(520, 130), Vector2(645, 322),
	Vector2(520, 312), Vector2(300, 160), Vector2(520, 255), Vector2(230, 420), Vector2(130, 225),
]
const POND := Vector2(180, 400)
const NPC_SPOTS := {
	"pipoca": Vector2(215, 222),
	"biscoito": Vector2(560, 184),
	"bolinho": Vector2(556, 376),
}
const PLAYER_START := Vector2(384, 262)

var client: ClaudeClient
var world: Node2D
var player: Player
var npcs: Array[ChatNPC] = []
var current_npc: ChatNPC = null
var dialogue: DialogueUI
var settings: SettingsUI

var _status: Label
var _prompt: Label
var _name_tags := {}
var _busy := false
## Emoção da última fala do bichinho: aparece quando o texto termina de ser "digitado".
var _pending_emotion := ""


func _ready() -> void:
	client = ClaudeClient.new()
	add_child(client)

	_build_ground()
	world = Node2D.new()
	world.y_sort_enabled = true
	add_child(world)
	_build_props()
	_build_bounds()

	player = Player.new()
	player.position = PLAYER_START
	world.add_child(player)
	var cam := Camera2D.new()
	cam.zoom = Vector2(CAMERA_ZOOM, CAMERA_ZOOM)
	cam.limit_left = 0
	cam.limit_top = 0
	cam.limit_right = int(WORLD_SIZE.x)
	cam.limit_bottom = int(WORLD_SIZE.y)
	cam.position_smoothing_enabled = true
	cam.position_smoothing_speed = 7.0
	cam.offset = Vector2(0, -24)
	player.add_child(cam)

	for id in NPC_SPOTS.keys():
		var npc := ChatNPC.new()
		npc.setup(id)
		npc.position = NPC_SPOTS[id]
		world.add_child(npc)
		npc.animation_changed.connect(_on_npc_animation.bind(npc))
		npcs.append(npc)

	_build_hud()

	dialogue = DialogueUI.new()
	dialogue.message_submitted.connect(_on_player_message)
	dialogue.closed.connect(_on_dialogue_closed)
	dialogue.typing_finished.connect(_on_typing_finished)
	add_child(dialogue)

	settings = SettingsUI.new()
	settings.client = client
	settings.closed.connect(_on_settings_closed)
	add_child(settings)

	GameState.ai_config_changed.connect(_update_status)
	_update_status()


# ---------------------------------------------------------------- mundo

func _build_ground() -> void:
	var ground := Sprite2D.new()
	ground.texture = preload("res://sprites/vila_chao.png")
	ground.centered = false
	ground.z_index = -10
	add_child(ground)
	var pond := Sprite2D.new()
	pond.texture = preload("res://sprites/laguinho.png")
	pond.position = POND
	pond.z_index = -9
	add_child(pond)
	_add_blocker(POND, Vector2(64, 30))


func _build_props() -> void:
	var house_tex: Texture2D = preload("res://sprites/casinha.png")
	for h in HOUSES:
		var s := Sprite2D.new()
		s.texture = house_tex
		s.hframes = 3
		s.frame = h["frame"]
		s.centered = false
		s.offset = Vector2(-32, -62)
		s.position = h["pos"]
		world.add_child(s)
		_add_blocker(h["pos"] + Vector2(0, -10), Vector2(46, 18))
	var tree_tex: Texture2D = preload("res://sprites/arvore.png")
	for p in TREES:
		var t := Sprite2D.new()
		t.texture = tree_tex
		t.centered = false
		t.offset = Vector2(-24, -54)
		t.position = p
		world.add_child(t)
		_add_blocker(p + Vector2(0, -4), Vector2(14, 8))
	var bush_tex: Texture2D = preload("res://sprites/arbusto.png")
	for p in BUSHES:
		var b := Sprite2D.new()
		b.texture = bush_tex
		b.centered = false
		b.offset = Vector2(-14, -18)
		b.position = p
		world.add_child(b)
		_add_blocker(p + Vector2(0, -5), Vector2(22, 8))


func _build_bounds() -> void:
	var t := 16.0
	_add_blocker(Vector2(WORLD_SIZE.x / 2, -t / 2 + 8), Vector2(WORLD_SIZE.x, t))
	_add_blocker(Vector2(WORLD_SIZE.x / 2, WORLD_SIZE.y + t / 2 - 2), Vector2(WORLD_SIZE.x, t))
	_add_blocker(Vector2(-t / 2 + 6, WORLD_SIZE.y / 2), Vector2(t, WORLD_SIZE.y))
	_add_blocker(Vector2(WORLD_SIZE.x + t / 2 - 6, WORLD_SIZE.y / 2), Vector2(t, WORLD_SIZE.y))


func _add_blocker(center: Vector2, size: Vector2) -> void:
	var body := StaticBody2D.new()
	body.position = center
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = size
	shape.shape = rect
	body.add_child(shape)
	add_child(body)


# ---------------------------------------------------------------- HUD

func _build_hud() -> void:
	var hud := CanvasLayer.new()
	hud.layer = 3
	add_child(hud)

	_status = Label.new()
	_status.position = Vector2(14, 10)
	_status.add_theme_font_size_override("font_size", 16)
	_status.add_theme_color_override("font_color", Color.WHITE)
	_status.add_theme_color_override("font_outline_color", Color("3b3447"))
	_status.add_theme_constant_override("outline_size", 6)
	hud.add_child(_status)

	var help := Label.new()
	help.text = "WASD/setas: andar   E: conversar   F1: configurar IA"
	help.anchor_left = 1.0
	help.anchor_right = 1.0
	help.offset_left = -470
	help.offset_right = -14
	help.offset_top = 10
	help.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	help.add_theme_font_size_override("font_size", 16)
	help.add_theme_color_override("font_color", Color.WHITE)
	help.add_theme_color_override("font_outline_color", Color("3b3447"))
	help.add_theme_constant_override("outline_size", 6)
	hud.add_child(help)

	_prompt = Label.new()
	_prompt.anchor_left = 0.5
	_prompt.anchor_right = 0.5
	_prompt.anchor_top = 1.0
	_prompt.anchor_bottom = 1.0
	_prompt.offset_left = -300
	_prompt.offset_right = 300
	_prompt.offset_top = -70
	_prompt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_prompt.add_theme_font_size_override("font_size", 22)
	_prompt.add_theme_color_override("font_color", Color("fff6ea"))
	_prompt.add_theme_color_override("font_outline_color", Color("8a5a3a"))
	_prompt.add_theme_constant_override("outline_size", 8)
	_prompt.visible = false
	hud.add_child(_prompt)

	for npc in npcs:
		var tag := Label.new()
		tag.text = npc.display_name
		tag.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		tag.size = Vector2(160, 24)
		tag.add_theme_font_size_override("font_size", 15)
		tag.add_theme_color_override("font_color", Color.WHITE)
		tag.add_theme_color_override("font_outline_color", Color("3b3447"))
		tag.add_theme_constant_override("outline_size", 6)
		hud.add_child(tag)
		_name_tags[npc] = tag


func _update_status() -> void:
	if GameState.has_ai():
		_status.text = "IA: ligada (%s)" % GameState.model_display_name()
	else:
		_status.text = "IA: modo offline. Aperte F1 para ligar o Claude"


func _process(_delta: float) -> void:
	var xf := get_viewport().get_canvas_transform()
	for npc in npcs:
		var tag: Label = _name_tags[npc]
		var screen := xf * (npc.global_position + Vector2(0, -70))
		tag.position = screen - Vector2(tag.size.x / 2, tag.size.y)
		tag.visible = current_npc == null

	if current_npc != null or settings.visible:
		_prompt.visible = false
		return
	var near := _nearest_npc()
	_prompt.visible = near != null
	if near != null:
		_prompt.text = "E: conversar com %s" % near.display_name


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("settings") and current_npc == null:
		get_viewport().set_input_as_handled()
		_open_settings()
	elif event.is_action_pressed("interact") and current_npc == null and not settings.visible:
		var npc := _nearest_npc()
		if npc != null:
			get_viewport().set_input_as_handled()
			_start_dialogue(npc)


func _nearest_npc() -> ChatNPC:
	var best: ChatNPC = null
	var best_dist := INF
	for npc in npcs:
		var d := player.global_position.distance_to(npc.global_position)
		if d <= npc.talk_radius and d < best_dist:
			best = npc
			best_dist = d
	return best


func _open_settings() -> void:
	player.can_move = false
	settings.open()


func _on_settings_closed() -> void:
	player.can_move = current_npc == null
	_update_status()


# ---------------------------------------------------------------- conversa

func _start_dialogue(npc: ChatNPC) -> void:
	current_npc = npc
	npc.in_conversation = true
	player.can_move = false
	player.face_towards(npc.global_position)
	var color := Color(str(npc.profile.get("cor", "f6b0c4")))
	dialogue.open(npc.display_name, color, npc.sprite.sprite_frames, GameState.get_friendship(npc.npc_id), _mode_text())
	var g := npc.greeting()
	npc.play_anim("talk")
	_pending_emotion = g["emocao"]
	dialogue.add_line(npc.display_name, g["fala"], color.darkened(0.25), true)


func _on_player_message(text: String) -> void:
	var npc := current_npc
	if npc == null or _busy:
		return
	_busy = true
	dialogue.add_line(GameState.player_name if GameState.player_name != "" else "Você", text, Color("4f74b8"))
	dialogue.set_waiting(true, npc.display_name)
	npc.show_emote("pensando", 0.0)
	npc.play_anim("idle")

	var r: Dictionary = await npc.reply_to(client, text)
	_busy = false
	if npc != current_npc:
		return  # o jogador saiu da conversa enquanto esperava
	npc.hide_emote()
	dialogue.set_waiting(false)
	var color := Color(str(npc.profile.get("cor", "f6b0c4"))).darkened(0.25)
	_pending_emotion = r["emocao"]
	npc.play_anim("talk")
	dialogue.add_line(npc.display_name, r["fala"], color, true)
	dialogue.set_friendship(GameState.get_friendship(npc.npc_id))
	if r["error"] != "":
		dialogue.add_note("(IA indisponível: %s. Respondi com o cérebro offline.)" % r["error"])
		push_warning("Claude: " + r["error"])
	dialogue.set_hint(_mode_text())


func _on_typing_finished() -> void:
	if current_npc != null:
		current_npc.show_emotion(_pending_emotion)


func _on_npc_animation(anim: String, npc: ChatNPC) -> void:
	if npc == current_npc:
		dialogue.set_portrait_anim(anim)


func _on_dialogue_closed() -> void:
	if current_npc != null:
		current_npc.in_conversation = false
		current_npc.hide_emote()
		current_npc.play_anim("idle")
	current_npc = null
	player.can_move = true


func _mode_text() -> String:
	if GameState.has_ai():
		return "IA: Claude ligada"
	return "IA offline (F1 para ligar o Claude)"
