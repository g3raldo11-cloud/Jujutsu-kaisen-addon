class_name DialogueUI
extends CanvasLayer
## Caixa de diálogo: retrato animado do bichinho, corações de amizade,
## histórico com efeito de digitação e campo para o jogador escrever.

signal message_submitted(text: String)
signal closed
signal typing_finished

const BG := Color("fff6ea")
const BORDER := Color("8a5a3a")
const TEXT := Color("4a3428")
const MUTED := Color("9a8070")
const CHARS_PER_SECOND := 45.0

var _panel: PanelContainer
var _portrait_style: StyleBoxFlat
var _portrait: AnimatedSprite2D
var _name_label: Label
var _hearts: HBoxContainer
var _log: RichTextLabel
var _thinking: Label
var _line_edit: LineEdit
var _send: Button
var _bye: Button
var _hint: Label
var _tween: Tween
var _think_time := 0.0
var _think_name := ""
var _heart_full: AtlasTexture
var _heart_broken: AtlasTexture


func _ready() -> void:
	layer = 5
	var emotes: Texture2D = preload("res://sprites/emotes.png")
	_heart_full = AtlasTexture.new()
	_heart_full.atlas = emotes
	_heart_full.region = Rect2(3, 2, 9, 7)
	_heart_broken = AtlasTexture.new()
	_heart_broken.atlas = emotes
	_heart_broken.region = Rect2(147, 2, 9, 7)

	_panel = PanelContainer.new()
	_panel.anchor_left = 0.0
	_panel.anchor_right = 1.0
	_panel.anchor_top = 1.0
	_panel.anchor_bottom = 1.0
	_panel.offset_left = 16
	_panel.offset_right = -16
	_panel.offset_top = -262
	_panel.offset_bottom = -12
	_panel.add_theme_stylebox_override("panel", _box(BG, BORDER, 4, 16, 14))
	add_child(_panel)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 16)
	_panel.add_child(row)

	# retrato
	var portrait_box := PanelContainer.new()
	_portrait_style = _box(Color("ffd9e3"), BORDER, 3, 12, 0)
	portrait_box.add_theme_stylebox_override("panel", _portrait_style)
	row.add_child(portrait_box)
	var holder := Control.new()
	holder.custom_minimum_size = Vector2(200, 222)
	holder.clip_contents = true
	portrait_box.add_child(holder)
	_portrait = AnimatedSprite2D.new()
	_portrait.centered = true
	_portrait.scale = Vector2(3, 3)
	_portrait.position = Vector2(100, 122)
	holder.add_child(_portrait)

	var col := VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", 6)
	row.add_child(col)

	var header := HBoxContainer.new()
	col.add_child(header)
	_name_label = Label.new()
	_name_label.add_theme_font_size_override("font_size", 24)
	_name_label.add_theme_color_override("font_color", BORDER)
	_name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(_name_label)
	_hearts = HBoxContainer.new()
	_hearts.add_theme_constant_override("separation", 4)
	header.add_child(_hearts)

	_log = RichTextLabel.new()
	_log.bbcode_enabled = true
	_log.scroll_following = true
	_log.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_log.add_theme_font_size_override("normal_font_size", 18)
	_log.add_theme_font_size_override("bold_font_size", 18)
	_log.add_theme_font_size_override("italics_font_size", 15)
	_log.add_theme_color_override("default_color", TEXT)
	col.add_child(_log)

	_thinking = Label.new()
	_thinking.add_theme_font_size_override("font_size", 15)
	_thinking.add_theme_color_override("font_color", MUTED)
	_thinking.visible = false
	col.add_child(_thinking)

	var input_row := HBoxContainer.new()
	input_row.add_theme_constant_override("separation", 8)
	col.add_child(input_row)
	_line_edit = LineEdit.new()
	_line_edit.placeholder_text = "Escreva qualquer coisa e aperte Enter..."
	_line_edit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_line_edit.max_length = 300
	_line_edit.add_theme_font_size_override("font_size", 18)
	_line_edit.add_theme_color_override("font_color", TEXT)
	_line_edit.add_theme_color_override("font_placeholder_color", MUTED)
	_line_edit.add_theme_stylebox_override("normal", _box(Color.WHITE, Color("d9b47f"), 2, 10, 8))
	_line_edit.add_theme_stylebox_override("focus", _box(Color.WHITE, Color("e07fa0"), 2, 10, 8))
	_line_edit.text_submitted.connect(_on_submit)
	input_row.add_child(_line_edit)
	_send = _make_button("Enviar", Color("84c060"))
	_send.pressed.connect(func(): _on_submit(_line_edit.text))
	input_row.add_child(_send)
	_bye = _make_button("Tchau", Color("e07fa0"))
	_bye.pressed.connect(close)
	input_row.add_child(_bye)

	_hint = Label.new()
	_hint.add_theme_font_size_override("font_size", 13)
	_hint.add_theme_color_override("font_color", MUTED)
	col.add_child(_hint)

	hide()


func _process(delta: float) -> void:
	if _thinking.visible:
		_think_time += delta
		var dots := ".".repeat(1 + int(_think_time * 3.0) % 3)
		_thinking.text = "%s está pensando%s" % [_think_name, dots]


func _input(event: InputEvent) -> void:
	if visible and event.is_action_pressed("ui_cancel"):
		get_viewport().set_input_as_handled()
		close()


func open(npc_name: String, color: Color, frames: SpriteFrames, friendship: int, hint: String) -> void:
	_name_label.text = npc_name
	_portrait_style.bg_color = color.lightened(0.45)
	_portrait.sprite_frames = frames
	_portrait.play("idle")
	_log.clear()
	_log.visible_characters = -1
	set_friendship(friendship)
	set_hint(hint)
	show()
	set_waiting(false)


func close() -> void:
	if not visible:
		return
	if _tween:
		_tween.kill()
	hide()
	closed.emit()


func set_hint(text: String) -> void:
	_hint.text = "Enter: enviar  ·  Esc: sair  ·  " + text


func set_portrait_anim(anim: String) -> void:
	if _portrait.sprite_frames != null and _portrait.sprite_frames.has_animation(anim):
		_portrait.play(anim)


## Amizade de -10 a 10: até 5 corações cheios; negativa mostra corações partidos.
func set_friendship(value: int) -> void:
	for c in _hearts.get_children():
		c.queue_free()
	var full := 0
	var broken := 0
	if value >= 0:
		full = int(ceil(value / 2.0))
	else:
		broken = int(ceil(-value / 2.0))
	for i in 5:
		var t := TextureRect.new()
		t.custom_minimum_size = Vector2(27, 21)
		t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		t.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		t.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		if i < broken:
			t.texture = _heart_broken
		else:
			t.texture = _heart_full
			if i >= full:
				t.modulate = Color(0.55, 0.5, 0.5, 0.35)
		_hearts.add_child(t)
	var tip := "Amizade: %d" % value
	_hearts.tooltip_text = tip


func add_line(who: String, text: String, color: Color, animate := false) -> void:
	# termina na hora uma fala que ainda estava sendo "digitada"
	if _tween and _tween.is_running():
		_tween.kill()
		_on_typing_done()
	var before := _log.get_total_character_count()
	_log.append_text("[b][color=#%s]%s:[/color][/b] %s\n" % [color.to_html(false), _escape(who), _escape(text)])
	if not animate:
		_log.visible_characters = -1
		return
	var after := _log.get_total_character_count()
	_log.visible_characters = before
	_tween = create_tween()
	_tween.tween_property(_log, "visible_characters", after, maxf((after - before) / CHARS_PER_SECOND, 0.2))
	_tween.tween_callback(_on_typing_done)


func _on_typing_done() -> void:
	_log.visible_characters = -1
	typing_finished.emit()


func add_note(text: String) -> void:
	_log.append_text("[i][color=#%s]%s[/color][/i]\n" % [MUTED.to_html(false), _escape(text)])


func set_waiting(waiting: bool, npc_name := "") -> void:
	_line_edit.editable = not waiting
	_send.disabled = waiting
	_thinking.visible = waiting
	_think_name = npc_name
	_think_time = 0.0
	if not waiting:
		_line_edit.grab_focus.call_deferred()


func _on_submit(text: String) -> void:
	text = text.strip_edges()
	if text == "" or not _line_edit.editable:
		return
	_line_edit.clear()
	message_submitted.emit(text)


func _make_button(text: String, color: Color) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(96, 0)
	b.add_theme_font_size_override("font_size", 17)
	b.add_theme_color_override("font_color", Color.WHITE)
	b.add_theme_color_override("font_hover_color", Color.WHITE)
	b.add_theme_color_override("font_pressed_color", Color.WHITE)
	b.add_theme_stylebox_override("normal", _box(color, color.darkened(0.35), 2, 10, 8))
	b.add_theme_stylebox_override("hover", _box(color.lightened(0.15), color.darkened(0.35), 2, 10, 8))
	b.add_theme_stylebox_override("pressed", _box(color.darkened(0.15), color.darkened(0.45), 2, 10, 8))
	b.add_theme_stylebox_override("disabled", _box(Color("cfc6bd"), Color("a89b90"), 2, 10, 8))
	return b


static func _box(bg: Color, border: Color, border_w: int, radius: int, margin: int) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.set_border_width_all(border_w)
	s.set_corner_radius_all(radius)
	s.set_content_margin_all(margin)
	return s


func _escape(s: String) -> String:
	return s.replace("[", "[lb]")
