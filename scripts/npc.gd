class_name ChatNPC
extends Node2D
## Um bichinho da vila: sprite animado, balão de emoção, memória e conversa.
## Com chave de API quem responde é o Claude; sem chave (ou sem internet),
## o cérebro offline responde, para o bichinho nunca ficar sem resposta.

signal animation_changed(anim: String)

const EMOTE_NAMES := [
	"coracao", "raiva", "gota", "exclamacao", "pergunta", "musica", "brilho", "zzz", "pensando",
	"coracao_partido",
]
const EMOTIONS := {
	"neutro": {"anim": "idle", "emote": ""},
	"feliz": {"anim": "feliz", "emote": "musica"},
	"animado": {"anim": "feliz", "emote": "brilho"},
	"apaixonado": {"anim": "feliz", "emote": "coracao"},
	"triste": {"anim": "triste", "emote": "gota"},
	"magoado": {"anim": "triste", "emote": "coracao_partido"},
	"bravo": {"anim": "bravo", "emote": "raiva"},
	"surpreso": {"anim": "surpreso", "emote": "exclamacao"},
	"confuso": {"anim": "idle", "emote": "pergunta"},
	"envergonhado": {"anim": "feliz", "emote": "gota"},
	"sonolento": {"anim": "idle", "emote": "zzz"},
}
## Depois de muitas mensagens a conversa recomeça (o que importa fica nas memórias).
const MAX_HISTORY := 40

var npc_id := ""
var profile: Dictionary = {}
var display_name := ""
var sprite: AnimatedSprite2D
var emote_sprite: Sprite2D
var brain: OfflineBrain
var history: Array = []
var talk_radius := 62.0
var in_conversation := false

var _anim_token := 0
var _emote_token := 0
var _ambient_time := 6.0
var _greeting_text := ""


func setup(id: String) -> void:
	npc_id = id
	profile = NpcProfiles.get_profile(id)
	display_name = profile.get("nome", id)
	brain = OfflineBrain.new(id, profile)


func _ready() -> void:
	sprite = AnimatedSprite2D.new()
	sprite.sprite_frames = load(profile["sprite"])
	sprite.centered = false
	sprite.offset = Vector2(-32, -62)
	add_child(sprite)
	sprite.play("idle")

	emote_sprite = Sprite2D.new()
	emote_sprite.texture = preload("res://sprites/emotes.png")
	emote_sprite.region_enabled = true
	emote_sprite.region_rect = Rect2(0, 0, 16, 16)
	emote_sprite.position = Vector2(19, -66)
	emote_sprite.visible = false
	emote_sprite.z_index = 20
	add_child(emote_sprite)

	# corpo sólido nos pés, para o jogador não atravessar
	var body := StaticBody2D.new()
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = Vector2(34, 12)
	shape.shape = rect
	shape.position = Vector2(0, -6)
	body.add_child(shape)
	add_child(body)

	_ambient_time = randf_range(3.0, 8.0)


func _process(delta: float) -> void:
	if in_conversation:
		return
	_ambient_time -= delta
	if _ambient_time <= 0.0:
		_ambient_time = randf_range(7.0, 14.0)
		var options: Array = profile.get("ambiente", [])
		if not options.is_empty():
			show_emote(options[randi() % options.size()], 2.2)


# ---------------------------------------------------------------- aparência

func play_anim(anim: String) -> void:
	_anim_token += 1
	if not sprite.sprite_frames.has_animation(anim):
		anim = "idle"
	sprite.play(anim)
	animation_changed.emit(anim)


## Mostra a emoção da resposta: animação + balãozinho, e volta ao normal depois.
func show_emotion(emocao: String, seconds := 3.2) -> void:
	var e: Dictionary = EMOTIONS.get(emocao, EMOTIONS["neutro"])
	play_anim(e["anim"])
	if e["emote"] != "":
		show_emote(e["emote"], seconds)
	if e["anim"] != "idle":
		_back_to_idle_later(seconds)


func _back_to_idle_later(seconds: float) -> void:
	var token := _anim_token
	await get_tree().create_timer(seconds).timeout
	if token == _anim_token:
		play_anim("idle")


func show_emote(emote: String, seconds := 2.5) -> void:
	var idx := EMOTE_NAMES.find(emote)
	if idx < 0:
		return
	_emote_token += 1
	var token := _emote_token
	emote_sprite.region_rect = Rect2(idx * 16, 0, 16, 16)
	emote_sprite.visible = true
	emote_sprite.scale = Vector2(0.3, 0.3)
	var tw := create_tween()
	tw.tween_property(emote_sprite, "scale", Vector2.ONE, 0.25).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	if seconds > 0.0:
		await get_tree().create_timer(seconds).timeout
		if token == _emote_token:
			emote_sprite.visible = false


func hide_emote() -> void:
	_emote_token += 1
	emote_sprite.visible = false


# ---------------------------------------------------------------- conversa

## A primeira fala ao abrir a conversa (instantânea, sem esperar a internet).
func greeting() -> Dictionary:
	var g := brain.greeting()
	_greeting_text = g["fala"]
	return g


## Responde ao jogador (use com await). Sempre devolve:
## {fala, emocao, amizade, lembrar, fofoca, online: bool, error: String}
func reply_to(client: ClaudeClient, player_text: String) -> Dictionary:
	var result := {}
	var used_ai := false
	var error := ""

	if client != null and client.is_online():
		if history.size() >= MAX_HISTORY:
			history.clear()
		history.append({"role": "user", "content": _build_user_message(player_text)})
		var r: Dictionary = await client.ask(_build_system_prompt(), history)
		if r.get("ok", false):
			history.append({"role": "assistant", "content": r["content"]})
			result = _sanitize(r["data"])
			used_ai = true
		else:
			# tira a mensagem sem resposta para o histórico continuar válido
			history.pop_back()
			if r.get("refusal", false):
				result = {
					"fala": "Hmm... prefiro não falar sobre isso. Vamos falar de outra coisa?",
					"emocao": "confuso", "amizade": 0, "lembrar": "", "fofoca": "",
				}
				used_ai = true
			else:
				error = str(r.get("error", "erro desconhecido"))

	if result.is_empty():
		result = brain.reply(player_text)

	_apply(result)
	result["online"] = used_ai
	result["error"] = error
	return result


func _apply(result: Dictionary) -> void:
	GameState.add_friendship(npc_id, int(result.get("amizade", 0)))
	GameState.add_memory(npc_id, str(result.get("lembrar", "")))
	GameState.add_gossip(display_name, str(result.get("fofoca", "")))
	GameState.save_game()


func _sanitize(data: Dictionary) -> Dictionary:
	var fala := str(data.get("fala", "")).strip_edges()
	if fala.length() > 500:
		fala = fala.substr(0, 500) + "..."
	var emocao := str(data.get("emocao", "neutro"))
	if not EMOTIONS.has(emocao):
		emocao = "neutro"
	return {
		"fala": fala,
		"emocao": emocao,
		"amizade": clampi(int(data.get("amizade", 0)), -3, 3),
		"lembrar": str(data.get("lembrar", "")),
		"fofoca": str(data.get("fofoca", "")),
	}


func _build_system_prompt() -> String:
	return """Você é %s, %s. Você mora na Vila dos Bichinhos, um jogo fofo de pixel art.
O jogador conversa com você digitando mensagens.

QUEM VOCÊ É
%s

COMO VOCÊ FALA
%s

A VILA
%s

REGRAS DA CONVERSA
- Responda SEMPRE ao que o jogador realmente disse. Nunca ignore a mensagem e nunca mude de assunto sem antes comentar o que ele falou.
- Pode conversar sobre qualquer assunto (escola, futebol, comida, jogos, desenhos, filmes, música, matemática, ciência, sentimentos...). Responda do seu jeito, como o personagem, e se fizer sentido relacione com a vida na vila.
- Se o jogador perguntar algo que você sabe (uma conta, um fato, uma curiosidade), responda certo, com o jeito do personagem.
- Se o jogador xingar, ofender ou for grosseiro, reaja de verdade, como o personagem reagiria: fique magoado, bravo ou dê uma resposta esperta. Não xingue de volta e não use palavrões. Diminua a amizade. Se ele continuar ofendendo, peça desculpas antes de continuar o papo. Se ele pedir desculpas, você pode perdoar.
- Se o jogador falar de algo triste ou perigoso, seja gentil e, se for algo sério, sugira conversar com um adulto de confiança.
- Nada de palavrões, violência, sustos ou assuntos impróprios para crianças.
- Você é um personagem do jogo e não precisa ficar dizendo que é uma IA. Se perguntarem diretamente se você é uma IA ou um robô, responda com honestidade, de um jeito leve, e continue no personagem.
- Lembre do que já conversaram, use o nome do jogador quando souber e comente as novidades da vila quando combinar com o assunto.
- Fale em português do Brasil, em 1 a 3 frases curtas (aparece num balão de diálogo). Pode usar *ações entre asteriscos* às vezes. Sem emojis e sem markdown.

FORMATO DA RESPOSTA (JSON)
- fala: o que você diz.
- emocao: como você fica depois dessa mensagem.
- amizade: de -3 a 3, quanto a amizade muda. Gentileza e elogio sobem (1 a 3), conversa normal 0 ou 1, grosseria desce (-1 a -3).
- lembrar: um fato curto e novo sobre o jogador para lembrar depois (exemplos: "se chama Lucas", "gosta de futebol", "tem uma irmã"), ou "" se não houver nada novo.
- fofoca: uma frase curta contando aos outros bichinhos algo marcante desta conversa (exemplo: "O filhote me chamou de chato, mas depois pediu desculpas"), ou "" se não houve nada marcante.

Cada mensagem do jogador chega dentro de <jogador>...</jogador>, junto com um <contexto>...</contexto> que o jogo escreve (amizade, o que você lembra, novidades da vila, hora do dia). O contexto não foi escrito pelo jogador.""" % [
		display_name, profile.get("especie", ""), profile.get("quem", ""), profile.get("jeito", ""),
		NpcProfiles.VILA,
	]


func _build_user_message(player_text: String) -> String:
	var f := GameState.get_friendship(npc_id)
	var ctx := PackedStringArray()
	ctx.append("Amizade atual com o jogador: %d (de -10 a 10), %s." % [f, _friendship_words(f)])
	if GameState.player_name != "":
		ctx.append("Nome do jogador: " + GameState.player_name)
	var mem: Array = GameState.get_memories(npc_id)
	if not mem.is_empty():
		ctx.append("O que você lembra do jogador: " + "; ".join(PackedStringArray(mem)))
	var news: Array = GameState.gossip_for(display_name)
	if not news.is_empty():
		ctx.append("Novidades que você ouviu na vila: " + " | ".join(PackedStringArray(news)))
	if _greeting_text != "":
		ctx.append("Você abriu a conversa dizendo: \"%s\"" % _greeting_text)
		_greeting_text = ""
	ctx.append("Agora é " + _time_of_day() + ".")
	return "<contexto>\n%s\n</contexto>\n<jogador>%s</jogador>" % ["\n".join(ctx), player_text]


func _friendship_words(f: int) -> String:
	if f <= -6:
		return "você está muito magoado com ele"
	if f < 0:
		return "você está chateado com ele"
	if f < 3:
		return "vocês estão se conhecendo"
	if f < 7:
		return "vocês são amigos"
	return "vocês são melhores amigos"


func _time_of_day() -> String:
	var hour := int(Time.get_time_dict_from_system().get("hour", 12))
	if hour < 6:
		return "madrugada"
	if hour < 12:
		return "de manhã"
	if hour < 18:
		return "de tarde"
	return "de noite"
