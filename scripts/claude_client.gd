class_name ClaudeClient
extends Node
## Conversa com a API do Claude (Anthropic) por HTTP.
##
## A chave é lida, nesta ordem, de:
##   1. variável de ambiente ANTHROPIC_API_KEY
##   2. claude_config.cfg ao lado do executável (jogo exportado)
##   3. res://claude_config.cfg (rodando pelo editor)
## Sem chave, is_online() retorna false e os NPCs usam as falas offline.

const API_URL := "https://api.anthropic.com/v1/messages"
const API_VERSION := "2026-10-21"
# Se o modelo recusar um pedido por segurança, a API tenta de novo em outro
# modelo automaticamente (fallbacks: "default").
const FALLBACK_BETA := "server-side-fallback-2026-07-01"
const CONFIG_NAME := "claude_config.cfg"
const MAX_RETRIES := 2

var api_key := ""
var model := "claude-opus-5-5"


func _ready() -> void:
	load_config()


func load_config() -> void:
	api_key = OS.get_environment("ANTHROPIC_API_KEY")
	var paths := [
		OS.get_executable_path().get_base_dir().path_join(CONFIG_NAME),
		"res://" + CONFIG_NAME,
	]
	for path in paths:
		var cfg := ConfigFile.new()
		if cfg.load(path) != OK:
			continue
		if api_key == "":
			api_key = str(cfg.get_value("claude", "api_key", "")).strip_edges()
		model = str(cfg.get_value("claude", "model", model)).strip_edges()
		break
	if api_key.begins_with("cole-"):
		api_key = ""


func is_online() -> bool:
	return api_key != ""


## Envia a conversa e espera a resposta.
## Retorna {"ok": true, "text": String, "content": Array}
## ou {"ok": false, "error": String, "refusal": bool}.
func ask(system_prompt: String, messages: Array) -> Dictionary:
	if not is_online():
		return {"ok": false, "error": "sem chave de API", "refusal": false}

	var body := {
		"model": model,
		"max_tokens": 4000,
		"system": system_prompt,
		"messages": messages,
		# Conversa de NPC não precisa de raciocínio profundo: "low" deixa a
		# resposta mais rápida e barata.
		"output_config": {"effort": "low"},
	}
	var headers := PackedStringArray([
		"content-type: application/json",
		"x-api-key: " + api_key,
		"anthropic-version: " + API_VERSION,
	])
	# Os modelos Haiku não têm fallback no servidor.
	if not model.begins_with("claude-haiku"):
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
			return _parse_response(raw.get_string_from_utf8())

		# 429 (limite), 5xx/529 (sobrecarga) e falhas de rede valem nova tentativa.
		var retryable := result != HTTPRequest.RESULT_SUCCESS or code == 429 or code >= 500
		if retryable and attempt < MAX_RETRIES:
			await get_tree().create_timer(1.5 * pow(2.0, attempt)).timeout
			continue
		return {"ok": false, "error": _describe_error(result, code, raw), "refusal": false}

	return {"ok": false, "error": "sem resposta", "refusal": false}


func _parse_response(text: String) -> Dictionary:
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
	return {"ok": true, "text": "\n".join(parts).strip_edges(), "content": content}


func _describe_error(result: int, code: int, raw: PackedByteArray) -> String:
	if result != HTTPRequest.RESULT_SUCCESS:
		return "sem conexão (resultado %d)" % result
	var data = JSON.parse_string(raw.get_string_from_utf8())
	var msg := ""
	if typeof(data) == TYPE_DICTIONARY and typeof(data.get("error")) == TYPE_DICTIONARY:
		msg = str(data["error"].get("message", ""))
	match code:
		401:
			return "chave de API inválida"
		403:
			return "sem permissão: " + msg
		429:
			return "limite de uso atingido, tente daqui a pouco"
		_:
			return "erro HTTP %d %s" % [code, msg]
