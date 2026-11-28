extends Node
## Autoload "GameState": o que precisa durar entre conversas e entre partidas.
##   - configuração da IA (chave da API e modelo)
##   - amizade de cada bichinho com o jogador (-10 a 10)
##   - o que cada bichinho lembra sobre o jogador
##   - fofocas da vila (o que aconteceu, para os outros bichinhos saberem)

signal ai_config_changed

const CONFIG_PATH := "user://claude_config.cfg"
const SAVE_PATH := "user://vila_save.json"
const MAX_MEMORIES := 12
const MAX_GOSSIP := 10

const MODELS := [
	{"id": "claude-opus-5-5", "nome": "Claude Opus 5.5 (a mais esperta)"},
	{"id": "claude-sonnet-5-5", "nome": "Claude Sonnet 5.5 (rápida)"},
	{"id": "claude-haiku-5-5", "nome": "Claude Haiku 5.5 (a mais barata)"},
]

var api_key := ""
var model := "claude-opus-5-5"
## De onde veio a chave: "jogo", "ambiente", "arquivo" ou "".
var key_source := ""

var player_name := ""
var friendship := {}
var memories := {}
var gossip: Array = []

var _name_regex := RegEx.new()


func _ready() -> void:
	_name_regex.compile("(?:se chama|me chamo|meu nome (?:é|e)|chamado|chamada|nome dele (?:é|e)|nome dela (?:é|e))\\s+([\\p{L}]{2,20})")
	load_config()
	load_save()


# ---------------------------------------------------------------- IA

func load_config() -> void:
	api_key = ""
	key_source = ""
	var cfg := ConfigFile.new()
	if cfg.load(CONFIG_PATH) == OK:
		api_key = str(cfg.get_value("claude", "api_key", "")).strip_edges()
		model = str(cfg.get_value("claude", "model", model)).strip_edges()
		if api_key != "":
			key_source = "jogo"
	if api_key == "":
		var env := OS.get_environment("ANTHROPIC_API_KEY").strip_edges()
		if env != "":
			api_key = env
			key_source = "ambiente"
	if api_key == "":
		var paths := [
			OS.get_executable_path().get_base_dir().path_join("claude_config.cfg"),
			"res://claude_config.cfg",
		]
		for path in paths:
			var file_cfg := ConfigFile.new()
			if file_cfg.load(path) != OK:
				continue
			var key := str(file_cfg.get_value("claude", "api_key", "")).strip_edges()
			if key != "" and not key.begins_with("cole-"):
				api_key = key
				key_source = "arquivo"
				model = str(file_cfg.get_value("claude", "model", model)).strip_edges()
				break
	if not _is_known_model(model):
		model = MODELS[0]["id"]


func save_config(new_key: String, new_model: String) -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("claude", "api_key", new_key.strip_edges())
	cfg.set_value("claude", "model", new_model)
	cfg.save(CONFIG_PATH)
	load_config()
	ai_config_changed.emit()


func has_ai() -> bool:
	return api_key != ""


func model_display_name() -> String:
	for m in MODELS:
		if m["id"] == model:
			return m["nome"]
	return model


func _is_known_model(id: String) -> bool:
	for m in MODELS:
		if m["id"] == id:
			return true
	return false


# ---------------------------------------------------------------- amizade e memória

func get_friendship(npc_id: String) -> int:
	return int(friendship.get(npc_id, 0))


func add_friendship(npc_id: String, delta: int) -> int:
	var value := clampi(get_friendship(npc_id) + delta, -10, 10)
	friendship[npc_id] = value
	return value


func get_memories(npc_id: String) -> Array:
	return memories.get(npc_id, [])


func add_memory(npc_id: String, text: String) -> void:
	text = text.strip_edges()
	if text == "" or text.length() > 160:
		return
	var list: Array = memories.get(npc_id, [])
	for old in list:
		if str(old).to_lower() == text.to_lower():
			return
	list.append(text)
	while list.size() > MAX_MEMORIES:
		list.pop_front()
	memories[npc_id] = list
	_learn_name_from(text)


func add_gossip(from_name: String, text: String) -> void:
	text = text.strip_edges()
	if text == "" or text.length() > 200:
		return
	gossip.append({"de": from_name, "texto": text})
	while gossip.size() > MAX_GOSSIP:
		gossip.pop_front()


## Fofocas que um bichinho ouviu dos outros (não as dele mesmo).
func gossip_for(npc_name: String, limit := 5) -> Array:
	var out: Array = []
	for i in range(gossip.size() - 1, -1, -1):
		var g: Dictionary = gossip[i]
		if g.get("de", "") != npc_name:
			out.push_front("%s contou: %s" % [g.get("de", "?"), g.get("texto", "")])
		if out.size() >= limit:
			break
	return out


func set_player_name(new_name: String) -> void:
	new_name = new_name.strip_edges()
	if new_name.length() >= 2:
		player_name = new_name.substr(0, 1).to_upper() + new_name.substr(1)


func _learn_name_from(text: String) -> void:
	var m := _name_regex.search(text.to_lower())
	if m != null:
		set_player_name(m.get_string(1))


func forget_everything() -> void:
	player_name = ""
	friendship.clear()
	memories.clear()
	gossip.clear()
	save_game()


# ---------------------------------------------------------------- salvar

func save_game() -> void:
	var data := {
		"player_name": player_name,
		"friendship": friendship,
		"memories": memories,
		"gossip": gossip,
	}
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f != null:
		f.store_string(JSON.stringify(data, "\t"))


func load_save() -> void:
	if not FileAccess.file_exists(SAVE_PATH):
		return
	var f := FileAccess.open(SAVE_PATH, FileAccess.READ)
	if f == null:
		return
	var data = JSON.parse_string(f.get_as_text())
	if typeof(data) != TYPE_DICTIONARY:
		return
	player_name = str(data.get("player_name", ""))
	friendship = data.get("friendship", {}) if typeof(data.get("friendship")) == TYPE_DICTIONARY else {}
	memories = data.get("memories", {}) if typeof(data.get("memories")) == TYPE_DICTIONARY else {}
	gossip = data.get("gossip", []) if typeof(data.get("gossip")) == TYPE_ARRAY else []
	# JSON devolve números como float
	for k in friendship.keys():
		friendship[k] = int(friendship[k])
