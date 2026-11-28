class_name ClaudeClient
extends Node
## Conversa com a API do Claude (Anthropic) por HTTP.
## A chave e o modelo vêm do GameState (tela de configuração do jogo,
## variável ANTHROPIC_API_KEY ou arquivo claude_config.cfg).

const API_URL := "https://api.anthropic.com/v1/messages"
const API_VERSION := "2026-10-21"
## Se o modelo recusar um pedido, a API tenta de novo em outro modelo sozinha.
const FALLBACK_BETA := "server-side-fallback-2026-07-01"
const MAX_RETRIES := 2

## O formato da resposta de cada bichinho (saída estruturada em JSON).
const REPLY_SCHEMA := {
	"type": "object",
	"properties": {
		"fala": {"type": "string"},
		"emocao": {"type": "string", "enum": [
			"neutro", "feliz", "animado", "apaixonado", "triste", "magoado",
			"bravo", "surpreso", "confuso", "envergonhado", "sonolento",
		]},
		"amizade": {"type": "integer"},
		"lembrar": {"type": "string"},
		"fofoca": {"type": "string"},
	},
	"required": ["fala", "emocao", "amizade", "lembrar", "fofoca"],
	"additionalProperties": false,
}


func is_online() -> bool:
	return GameState.has_ai()


## Envia a conversa e espera a resposta (use com await).
## Retorna {"ok": true, "data": {...}, "content": Array}
## ou {"ok": false, "error": String, "refusal": bool}.
func ask(system_prompt: String, messages: Array, schema: Dictionary = REPLY_SCHEMA) -> Dictionary:
	if not is_online():
		return {"ok": false, "error": "sem chave de API", "refusal": false}

	var output_config := {"effort": "low"}
	if not schema.is_empty():
		output_config["format"] = {"type": "json_schema", "schema": schema}
	var body := {
		"model": GameState.model,
		"max_tokens": 4000,
		"system": system_prompt,
		"messages": messages,
		"output_config": output_config,
	}
	var headers := PackedStringArray([
		"content-type: application/json",
		"x-api-key: " + GameState.api_key,
		"anthropic-version: " + API_VERSION,
	])
	# Os modelos Haiku não têm fallback no servidor.
	if not GameState.model.begins_with("claude-haiku"):
		body["fallbacks"] = "default"
		headers.append("anthropic-beta: " + FALLBACK_BETA)

	var json_body := JSON.stringify(body)
	for attempt in range(MAX_RETRIES + 1):
		var http := HTTPRequest.new()
		http.timeout = 90.0
		add_child(http)
		var err := http.request(API_URL, headers, HTTPClient.METHOD_POST, json_body)
		if err != OK:
			http.queue_free()
			return {"ok": false, "error": "não consegui enviar (erro %d)" % err, "refusal": false}

		var res: Array = await http.request_completed
		http.queue_free()
		var result: int = res[0]
		var code: int = res[1]
		var raw: PackedByteArray = res[3]

		if result == HTTPRequest.RESULT_SUCCESS and code == 200:
			return _parse_response(raw.get_string_from_utf8(), not schema.is_empty())

		# 429 (limite), 5xx/529 (sobrecarga) e falhas de rede valem nova tentativa.
		var retryable := result != HTTPRequest.RESULT_SUCCESS or code == 429 or code >= 500
		if retryable and attempt < MAX_RETRIES:
			await get_tree().create_timer(1.5 * pow(2.0, attempt)).timeout
			continue
		return {"ok": false, "error": _describe_error(result, code, raw), "refusal": false}

	return {"ok": false, "error": "sem resposta", "refusal": false}


## Um pedido bem pequeno, para a tela de configuração dizer se a chave funciona.
func test_connection() -> Dictionary:
	var r: Dictionary = await ask(
		"Você é um teste de conexão de um jogo. Responda só com a palavra: ok",
		[{"role": "user", "content": "teste"}],
		{}
	)
	return r


func _parse_response(text: String, expect_json: bool) -> Dictionary:
	var data = JSON.parse_string(text)
	if typeof(data) != TYPE_DICTIONARY:
		return {"ok": false, "error": "resposta inválida", "refusal": false}

	# Sempre checar stop_reason antes de ler o conteúdo.
	if str(data.get("stop_reason", "")) == "refusal":
		return {"ok": false, "error": "o modelo recusou", "refusal": true}

	var content: Array = data.get("content", [])
	var parts := PackedStringArray()
	for block in content:
		if typeof(block) == TYPE_DICTIONARY and block.get("type", "") == "text":
			parts.append(str(block.get("text", "")))
	var full_text := "".join(parts).strip_edges()
	if not expect_json:
		return {"ok": true, "text": full_text, "content": content, "data": {}}

	var reply = JSON.parse_string(full_text)
	if typeof(reply) != TYPE_DICTIONARY or str(reply.get("fala", "")).strip_edges() == "":
		return {"ok": false, "error": "a IA respondeu num formato estranho", "refusal": false}
	return {"ok": true, "data": reply, "content": content, "text": full_text}


func _describe_error(result: int, code: int, raw: PackedByteArray) -> String:
	if result != HTTPRequest.RESULT_SUCCESS:
		return "sem conexão com a internet (resultado %d)" % result
	var data = JSON.parse_string(raw.get_string_from_utf8())
	var msg := ""
	if typeof(data) == TYPE_DICTIONARY and typeof(data.get("error")) == TYPE_DICTIONARY:
		msg = str(data["error"].get("message", ""))
	match code:
		400:
			return "pedido recusado pela API: " + msg
		401:
			return "chave de API inválida"
		403:
			return "sem permissão: " + msg
		404:
			return "modelo não encontrado: " + msg
		429:
			return "limite de uso atingido, espere um pouquinho"
		_:
			return "erro HTTP %d %s" % [code, msg]
