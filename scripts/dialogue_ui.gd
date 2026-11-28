class_name DialogueUI
extends CanvasLayer
## Caixa de diálogo: histórico da conversa + campo para o jogador digitar.

signal message_submitted(text: String)
signal closed

var _panel: PanelContainer
var _title: Label
var _log: RichTextLabel
var _line_edit: LineEdit
var _send: Button
var _hint: Label
var _tween: Tween


func _ready() -> void:
	_panel = PanelContainer.new()
	_panel.anchor_left = 0.0
	_panel.anchor_right = 1.0
	_panel.anchor_top = 1.0
	_panel.anchor_bottom = 1.0
	_panel.offset_left = 24
	_panel.offset_right = -24
	_panel.offset_top = -270
	_panel.offset_bottom = -16
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.06, 0.05, 0.1, 0.92)
	style.border_color = Color(0.55, 0.35, 0.9)
	style.set_border_width_all(2)
	style.set_corner_radius_all(10)
	style.set_content_margin_all(14)
	_panel.add_theme_stylebox_override("panel", style)
	add_child(_panel)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 8)
	_panel.add_child(vbox)

	_title = Label.new()
	_title.add_theme_font_size_override("font_size", 20)
	_title.add_theme_color_override("font_color", Color(0.8, 0.7, 1))
	vbox.add_child(_title)

	_log = RichTextLabel.new()
	_log.bbcode_enabled = true
	_log.scroll_following = true
	_log.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_log.add_theme_font_size_override("normal_font_size", 17)
	_log.add_theme_font_size_override("bold_font_size", 17)
	vbox.add_child(_log)

	var row := HBoxContainer.new()
	vbox.add_child(row)
	_line_edit = LineEdit.new()
	_line_edit.placeholder_text = "Escreva algo e aperte Enter..."
	_line_edit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_line_edit.max_length = 300
	_line_edit.text_submitted.connect(_on_submit)
	row.add_child(_line_edit)
	_send = Button.new()
	_send.text = "Enviar"
	_send.pressed.connect(func(): _on_submit(_line_edit.text))
	row.add_child(_send)

	_hint = Label.new()
	_hint.add_theme_font_size_override("font_size", 13)
	_hint.add_theme_color_override("font_color", Color(0.6, 0.6, 0.7))
	vbox.add_child(_hint)

	hide()


func _input(event: InputEvent) -> void:
	if visible and event.is_action_pressed("ui_cancel"):
		get_viewport().set_input_as_handled()
		close()


func open(npc_name: String, mode_text: String) -> void:
	_title.text = npc_name
	_hint.text = "Enter envia  ·  Esc fecha  ·  " + mode_text
	_log.clear()
	_log.visible_characters = -1
	show()
	set_waiting(false)


func close() -> void:
	if not visible:
		return
	hide()
	closed.emit()


func add_line(who: String, text: String, color: Color, animate := false) -> void:
	var before := _log.get_total_character_count()
	_log.append_text("[b][color=#%s]%s:[/color][/b] %s\n" % [color.to_html(false), _escape(who), _escape(text)])
	if not animate:
		_log.visible_characters = -1
		return
	# Efeito de "digitando" na fala do NPC.
	var after := _log.get_total_character_count()
	if _tween:
		_tween.kill()
	_log.visible_characters = before
	_tween = create_tween()
	_tween.tween_property(_log, "visible_characters", after, (after - before) / 60.0)
	_tween.tween_callback(func(): _log.visible_characters = -1)


func set_waiting(waiting: bool) -> void:
	_line_edit.editable = not waiting
	_send.disabled = waiting
	_line_edit.placeholder_text = "..." if waiting else "Escreva algo e aperte Enter..."
	if not waiting:
		_line_edit.grab_focus.call_deferred()


func _on_submit(text: String) -> void:
	text = text.strip_edges()
	if text == "" or not _line_edit.editable:
		return
	_line_edit.clear()
	message_submitted.emit(text)


func _escape(s: String) -> String:
	return s.replace("[", "[lb]")
