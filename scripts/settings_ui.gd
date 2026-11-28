class_name SettingsUI
extends CanvasLayer
## Tela de configuração da IA (F1): colar a chave da API do Claude,
## escolher o modelo, testar a conexão e apagar a memória da vila.

signal closed

var client: ClaudeClient
var _key_edit: LineEdit
var _model_option: OptionButton
var _status: Label
var _current: Label
var _test_button: Button


func _ready() -> void:
	layer = 10
	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, 0.45)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(dim)

	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(center)

	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(640, 0)
	panel.add_theme_stylebox_override("panel", DialogueUI._box(DialogueUI.BG, DialogueUI.BORDER, 4, 16, 22))
	center.add_child(panel)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	panel.add_child(col)

	var title := Label.new()
	title.text = "Ligar a IA dos bichinhos"
	title.add_theme_font_size_override("font_size", 26)
	title.add_theme_color_override("font_color", DialogueUI.BORDER)
	col.add_child(title)

	var info := Label.new()
	info.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	info.custom_minimum_size = Vector2(590, 0)
	info.add_theme_font_size_override("font_size", 16)
	info.add_theme_color_override("font_color", DialogueUI.TEXT)
	info.text = "Sem chave, os bichinhos usam o cérebro offline (respostas prontas, mas espertinhas).\nCom uma chave da API do Claude eles conversam de verdade sobre qualquer assunto.\n\n1. Crie uma chave em console.anthropic.com (é pago por uso; peça ajuda a um adulto).\n2. Cole a chave aqui embaixo e clique em Salvar.\nA chave fica guardada só neste computador."
	col.add_child(info)

	_current = Label.new()
	_current.add_theme_font_size_override("font_size", 14)
	_current.add_theme_color_override("font_color", DialogueUI.MUTED)
	col.add_child(_current)

	_key_edit = LineEdit.new()
	_key_edit.secret = true
	_key_edit.placeholder_text = "Cole aqui a chave (começa com sk-ant-...)"
	_key_edit.add_theme_font_size_override("font_size", 17)
	_key_edit.add_theme_color_override("font_color", DialogueUI.TEXT)
	_key_edit.add_theme_color_override("font_placeholder_color", DialogueUI.MUTED)
	_key_edit.add_theme_stylebox_override("normal", DialogueUI._box(Color.WHITE, Color("d9b47f"), 2, 10, 8))
	_key_edit.add_theme_stylebox_override("focus", DialogueUI._box(Color.WHITE, Color("e07fa0"), 2, 10, 8))
	col.add_child(_key_edit)

	_model_option = OptionButton.new()
	_model_option.add_theme_font_size_override("font_size", 16)
	for m in GameState.MODELS:
		_model_option.add_item(m["nome"])
	col.add_child(_model_option)

	var buttons := HBoxContainer.new()
	buttons.add_theme_constant_override("separation", 8)
	col.add_child(buttons)
	var save_b := _button("Salvar", Color("84c060"))
	save_b.pressed.connect(_on_save)
	buttons.add_child(save_b)
	_test_button = _button("Testar conexão", Color("7ab9e6"))
	_test_button.pressed.connect(_on_test)
	buttons.add_child(_test_button)
	var remove_b := _button("Tirar a chave", Color("b3a6bb"))
	remove_b.pressed.connect(_on_remove_key)
	buttons.add_child(remove_b)
	var close_b := _button("Fechar", Color("e07fa0"))
	close_b.pressed.connect(close)
	buttons.add_child(close_b)

	_status = Label.new()
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_status.custom_minimum_size = Vector2(590, 0)
	_status.add_theme_font_size_override("font_size", 16)
	_status.add_theme_color_override("font_color", DialogueUI.TEXT)
	col.add_child(_status)

	var forget := _button("Apagar a memória da vila (amizades, nomes e fofocas)", Color("c8632f"))
	forget.pressed.connect(_on_forget)
	col.add_child(forget)

	hide()


func _input(event: InputEvent) -> void:
	if visible and event.is_action_pressed("ui_cancel"):
		get_viewport().set_input_as_handled()
		close()


func open() -> void:
	_key_edit.text = ""
	_status.text = ""
	for i in GameState.MODELS.size():
		if GameState.MODELS[i]["id"] == GameState.model:
			_model_option.select(i)
	_refresh_current()
	show()
	_key_edit.grab_focus.call_deferred()


func close() -> void:
	if visible:
		hide()
		closed.emit()


func _refresh_current() -> void:
	match GameState.key_source:
		"jogo":
			_current.text = "Chave atual: salva no jogo (termina em ...%s)" % GameState.api_key.right(4)
		"ambiente":
			_current.text = "Chave atual: da variável de ambiente ANTHROPIC_API_KEY"
		"arquivo":
			_current.text = "Chave atual: do arquivo claude_config.cfg"
		_:
			_current.text = "Nenhuma chave ainda: os bichinhos estão no modo offline."


func _selected_model() -> String:
	return GameState.MODELS[maxi(_model_option.selected, 0)]["id"]


func _on_save() -> void:
	var key := _key_edit.text.strip_edges()
	if key == "" and GameState.key_source == "jogo":
		key = GameState.api_key  # só trocou o modelo
	if key == "":
		_status.text = "Cole a chave antes de salvar."
		return
	if not key.begins_with("sk-ant-"):
		_status.text = "Hmm, essa chave parece estranha (normalmente começa com sk-ant-). Salvei mesmo assim; use Testar conexão."
	else:
		_status.text = "Salvo! Use Testar conexão para conferir."
	GameState.save_config(key, _selected_model())
	_key_edit.text = ""
	_refresh_current()


func _on_remove_key() -> void:
	GameState.save_config("", _selected_model())
	_refresh_current()
	_status.text = "Chave removida do jogo." if not GameState.has_ai() else "Chave removida do jogo, mas ainda existe uma chave no arquivo ou na variável de ambiente."


func _on_test() -> void:
	if not GameState.has_ai():
		_status.text = "Primeiro salve uma chave."
		return
	_test_button.disabled = true
	_status.text = "Testando... (pode levar alguns segundos)"
	var r: Dictionary = await client.test_connection()
	_test_button.disabled = false
	if r.get("ok", false):
		_status.text = "Funcionou! Os bichinhos agora conversam com o %s." % GameState.model_display_name()
	else:
		_status.text = "Não funcionou: %s" % r.get("error", "erro desconhecido")


func _on_forget() -> void:
	GameState.forget_everything()
	_status.text = "Pronto: os bichinhos esqueceram tudo e começam do zero."


func _button(text: String, color: Color) -> Button:
	var b := Button.new()
	b.text = text
	b.add_theme_font_size_override("font_size", 16)
	b.add_theme_color_override("font_color", Color.WHITE)
	b.add_theme_color_override("font_hover_color", Color.WHITE)
	b.add_theme_color_override("font_pressed_color", Color.WHITE)
	b.add_theme_stylebox_override("normal", DialogueUI._box(color, color.darkened(0.35), 2, 10, 8))
	b.add_theme_stylebox_override("hover", DialogueUI._box(color.lightened(0.15), color.darkened(0.35), 2, 10, 8))
	b.add_theme_stylebox_override("pressed", DialogueUI._box(color.darkened(0.15), color.darkened(0.45), 2, 10, 8))
	b.add_theme_stylebox_override("disabled", DialogueUI._box(Color("cfc6bd"), Color("a89b90"), 2, 10, 8))
	return b
