extends Node2D
## Monta a cena: chão, jogador, NPCs, cliente do Claude e caixa de diálogo.
## Para criar outro NPC, copie um bloco em _spawn_npcs() e mude os textos.

const WORLD_INFO := """O jogo se passa na Escola de Feitiçaria Hoshimori, escondida nas montanhas.
Ali, jovens feiticeiros aprendem a controlar a energia amaldiçoada, uma força que nasce das emoções negativas das pessoas,
para exorcizar maldições: criaturas invisíveis para pessoas comuns. O jogador é um aluno novo que acabou de chegar à escola.
Hoje é a primeira noite dele no pátio da escola."""

var client: ClaudeClient
var player: Player
var ui: DialogueUI
var npcs: Array[ChatNPC] = []
var current_npc: ChatNPC = null
var status_label: Label


func _ready() -> void:
	y_sort_enabled = true  # quem está mais abaixo aparece na frente
	client = ClaudeClient.new()
	add_child(client)

	player = Player.new()
	player.position = Vector2(576, 470)
	add_child(player)

	_spawn_npcs()

	ui = DialogueUI.new()
	ui.message_submitted.connect(_on_player_message)
	ui.closed.connect(_on_dialogue_closed)
	add_child(ui)

	var hud := CanvasLayer.new()
	add_child(hud)
	status_label = Label.new()
	status_label.position = Vector2(16, 12)
	status_label.add_theme_font_size_override("font_size", 15)
	hud.add_child(status_label)
	_update_status()


func _spawn_npcs() -> void:
	var sensei := ChatNPC.new()
	sensei.npc_name = "Sensei Amagi"
	sensei.position = Vector2(360, 260)
	sensei.body_color = Color(0.45, 0.3, 0.75)
	sensei.greeting = "*levanta os olhos do livro* Então você é o aluno novo. Fale, mas seja breve."
	sensei.personality = """Instrutor veterano da escola, com uns 40 anos. Calmo, irônico e exigente, mas se importa muito com os alunos.
Ensina como controlar a energia amaldiçoada e como reconhecer o grau das maldições (do grau 4, o mais fraco, ao grau especial).
Guarda um segredo: existe um selo antigo debaixo do templo da escola. Só fala disso se o jogador insistir muito, e mesmo assim por meias palavras.
Chama o jogador de "novato"."""
	sensei.offline_lines = [
		[["oi", "olá", "ola", "bom dia", "boa noite"], "Boa noite, novato. Não durma no treino amanhã."],
		[["energia", "poder", "técnica", "tecnica"], "Energia amaldiçoada vem das emoções negativas. Quem não a controla é controlado por ela."],
		[["maldição", "maldicao", "maldições", "grau"], "Maldições vão do grau 4 ao grau especial. Se encontrar uma de grau especial, corra."],
		[["selo", "templo", "segredo"], "*fecha o livro* Isso não é assunto para um novato."],
		[["tchau", "até", "ate"], "Vá descansar. Amanhã o treino começa cedo."],
	]
	sensei.offline_default = [
		"Hm. Pergunte algo útil, novato.",
		"Concentre-se. O que você quer saber sobre energia amaldiçoada?",
		"*suspira* Continue.",
	]
	sensei.refusal_line = "*balança a cabeça* Não vou responder isso. Pergunte outra coisa."
	_add_npc(sensei)

	var hana := ChatNPC.new()
	hana.npc_name = "Hana"
	hana.position = Vector2(790, 250)
	hana.body_color = Color(0.95, 0.55, 0.25)
	hana.greeting = "Ei! Você é o novato? Eu sou a Hana, segundo ano! Quer ver meus talismãs?"
	hana.personality = """Aluna do segundo ano, 16 anos. Animada, fala rápido e faz muitas perguntas.
Especialista em talismãs de papel que prendem maldições fracas. Morre de medo de maldições de grau especial, mas tenta esconder.
Admira o Sensei Amagi, mas acha ele rabugento demais. Quer muito fazer amizade com o jogador e convidá-lo para patrulhar a cidade."""
	hana.offline_lines = [
		[["oi", "olá", "ola", "bom dia", "boa noite"], "Oii! Finalmente alguém novo por aqui!"],
		[["talismã", "talisma", "talismãs", "papel"], "Meus talismãs prendem maldições fracas! Escrevo cada um à mão, sabia?"],
		[["medo", "grau especial", "forte"], "M-medo? Eu? Claro que não! *olha para os lados*"],
		[["sensei", "amagi", "professor"], "O Sensei Amagi é incrível, mas super rabugento. Não conta que eu disse isso!"],
		[["patrulha", "cidade", "missão", "missao"], "Vamos patrulhar a cidade amanhã? Por favor, diz que sim!"],
		[["tchau", "até", "ate"], "Até amanhã! Não esquece da patrulha!"],
	]
	hana.offline_default = [
		"Hm? Não entendi, mas parece legal!",
		"E aí, de onde você veio? Conta tudo!",
		"Você já viu uma maldição de verdade?",
	]
	hana.refusal_line = "Hã... melhor a gente falar de outra coisa! Quer ver meus talismãs?"
	_add_npc(hana)


func _add_npc(npc: ChatNPC) -> void:
	npc.world_info = WORLD_INFO
	add_child(npc)
	npcs.append(npc)


func _process(_delta: float) -> void:
	if current_npc != null:
		return
	var nearest := _nearest_npc()
	for npc in npcs:
		npc.highlighted = npc == nearest


func _unhandled_input(event: InputEvent) -> void:
	if current_npc == null and event.is_action_pressed("interact"):
		var npc := _nearest_npc()
		if npc != null:
			get_viewport().set_input_as_handled()
			_start_dialogue(npc)


func _nearest_npc() -> ChatNPC:
	var best: ChatNPC = null
	var best_dist := INF
	for npc in npcs:
		var d := player.position.distance_to(npc.position)
		if d <= npc.talk_radius and d < best_dist:
			best = npc
			best_dist = d
	return best


func _start_dialogue(npc: ChatNPC) -> void:
	current_npc = npc
	npc.highlighted = false
	player.can_move = false
	ui.open(npc.npc_name, _mode_text())
	ui.add_line(npc.npc_name, npc.greeting, npc.body_color.lightened(0.3), true)


func _on_player_message(text: String) -> void:
	var npc := current_npc
	if npc == null:
		return
	ui.add_line("Você", text, Color(0.6, 0.8, 1))
	ui.set_waiting(true)
	var r: Dictionary = await npc.reply_to(client, text)
	if npc != current_npc:
		return  # o jogador fechou a conversa enquanto esperava
	ui.add_line(npc.npc_name, r["text"], npc.body_color.lightened(0.3), true)
	if r["error"] != "":
		ui.add_line("Sistema", "IA indisponível (%s). Usando fala offline." % r["error"], Color(1, 0.5, 0.5))
		push_warning("Claude: " + r["error"])
	ui.set_waiting(false)


func _on_dialogue_closed() -> void:
	current_npc = null
	player.can_move = true


func _mode_text() -> String:
	if client.is_online():
		return "IA: Claude (%s)" % client.model
	return "IA offline: coloque sua chave em claude_config.cfg"


func _update_status() -> void:
	status_label.text = "WASD/setas: andar   E: conversar   |   " + _mode_text()


func _draw() -> void:
	# Pátio da escola: chão de pedra e um caminho.
	draw_rect(Rect2(0, 0, 1152, 648), Color(0.13, 0.14, 0.18))
	for x in range(0, 1152, 48):
		for y in range(48, 648, 48):
			var shade := 0.17 + 0.02 * float((x + y) / 48 % 2)
			draw_rect(Rect2(x + 1, y + 1, 46, 46), Color(shade, shade + 0.01, shade + 0.04))
	draw_rect(Rect2(0, 0, 1152, 48), Color(0.08, 0.06, 0.12))
	# Portão do templo ao fundo.
	draw_rect(Rect2(520, 60, 112, 14), Color(0.7, 0.15, 0.15))
	draw_rect(Rect2(500, 50, 152, 10), Color(0.55, 0.1, 0.1))
	draw_rect(Rect2(534, 74, 12, 90), Color(0.7, 0.15, 0.15))
	draw_rect(Rect2(606, 74, 12, 90), Color(0.7, 0.15, 0.15))
