class_name ChatNPC
extends Node2D
## Um NPC que conversa. Com chave de API, as falas vêm do Claude;
## sem chave, ele responde com as falas offline (palavras-chave).

@export var npc_name := "NPC"
@export_multiline var personality := ""
@export_multiline var greeting := "Olá."
@export var body_color := Color.WHITE
@export var talk_radius := 80.0

## Contexto do mundo, igual para todos os NPCs (definido pelo main.gd).
var world_info := ""
## Falas offline: lista de [palavras-chave: Array, resposta: String].
var offline_lines: Array = []
var offline_default: Array = ["Hm."]
var refusal_line := "Prefiro não falar sobre isso. Pergunte outra coisa."

## Histórico enviado para a API. Só cresce (nunca reescrevemos falas antigas).
var history: Array = []
var highlighted := false:
	set(value):
		highlighted = value
		queue_redraw()

var _default_index := 0
var _bob_time := 0.0


func _process(delta: float) -> void:
	_bob_time += delta
	queue_redraw()


func _draw() -> void:
	var bob := sin(_bob_time * 2.0) * 2.0
	# Sombra, corpo e cabeça (arte provisória feita com formas).
	draw_circle(Vector2(0, 26), 18, Color(0, 0, 0, 0.25))
	draw_rect(Rect2(-16, -6 + bob, 32, 32), body_color.darkened(0.15))
	draw_circle(Vector2(0, -16 + bob), 15, Color(0.98, 0.85, 0.72))
	draw_rect(Rect2(-15, -32 + bob, 30, 9), body_color.darkened(0.5))
	draw_circle(Vector2(-5, -15 + bob), 2, Color.BLACK)
	draw_circle(Vector2(5, -15 + bob), 2, Color.BLACK)

	var font := ThemeDB.fallback_font
	draw_string(font, Vector2(-80, -44 + bob), npc_name, HORIZONTAL_ALIGNMENT_CENTER, 160, 15, Color.WHITE)
	if highlighted:
		draw_string(font, Vector2(-80, -64 + bob), "[E] Conversar", HORIZONTAL_ALIGNMENT_CENTER, 160, 14, Color(1, 0.9, 0.4))


func build_system_prompt() -> String:
	return """Você é %s, um personagem (NPC) de um jogo 2D. O jogador acabou de vir falar com você.

Mundo do jogo:
%s

Quem você é:
%s

Como responder:
- Sempre em português do Brasil, falando como o personagem.
- Respostas curtas, de 1 a 3 frases: elas aparecem numa caixa de diálogo.
- Texto simples, sem markdown, listas ou emojis.
- Descreva gestos só de vez em quando, entre asteriscos, por exemplo *cruza os braços*.
- Fique no personagem. Se o jogador falar do mundo real, responda de forma breve e volte ao mundo do jogo.""" % [npc_name, world_info, personality]


## Responde ao que o jogador escreveu. Use com await.
func reply_to(client: ClaudeClient, player_text: String) -> Dictionary:
	if client == null or not client.is_online():
		return {"text": offline_reply(player_text), "online": false, "error": ""}

	history.append({"role": "user", "content": player_text})
	var r: Dictionary = await client.ask(build_system_prompt(), history)
	if r.get("ok", false) and str(r.get("text", "")) != "":
		# Guarda o conteúdo completo, do jeito que a API devolveu.
		history.append({"role": "assistant", "content": r["content"]})
		return {"text": r["text"], "online": true, "error": ""}

	# Falhou: tira a fala sem resposta para o histórico continuar válido.
	history.pop_back()
	if r.get("refusal", false):
		return {"text": refusal_line, "online": true, "error": ""}
	return {"text": offline_reply(player_text), "online": false, "error": str(r.get("error", ""))}


func offline_reply(player_text: String) -> String:
	var t := player_text.to_lower()
	for entry in offline_lines:
		for keyword in entry[0]:
			if t.contains(keyword):
				return entry[1]
	var line: String = offline_default[_default_index % offline_default.size()]
	_default_index += 1
	return line


func reset_conversation() -> void:
	history.clear()
