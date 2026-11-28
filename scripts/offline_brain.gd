class_name OfflineBrain
extends RefCounted
## Cérebro de reserva: responde sem internet nem chave de API.
## Entende cumprimentos, xingamentos, desculpas, elogios, o nome do jogador,
## contas, perguntas e qualquer outro assunto (comentando a palavra principal),
## e sempre devolve o mesmo formato da IA: fala, emocao, amizade, lembrar, fofoca.

const INSULTS := [
	"idiota", "burro", "burra", "chato", "chata", "chatao", "chatinho", "chatinha", "feio", "feia",
	"otario", "otaria", "lixo", "bobo", "boba", "besta", "imbecil", "estupido", "estupida", "babaca",
	"nojento", "nojenta", "ridiculo", "ridicula", "odeio", "inutil", "horrivel", "merda", "porra",
	"caralho", "fdp", "puta", "vsf", "vtnc", "pqp", "bosta", "desgraca", "desgracado", "desgracada",
	"tonto", "tonta", "palhaco", "trouxa", "lerdo", "lerda", "fedido", "fedida", "fedorento",
	"fedorenta", "retardado", "retardada", "maldito", "maldita", "pateta", "cretino", "cretina",
	"vagabundo", "vagabunda", "verme", "gordo", "gorda", "baleia", "fracassado", "fracassada",
	"perdedor", "perdedora", "chatice", "insuportavel", "nojo",
]
const INSULT_PHRASES := [
	"cala a boca", "cala boca", "vai embora", "some daqui", "sai daqui", "nao gosto de voce",
	"nao gosto de vc", "te odeio", "vai se", "sem graca", "voce e chat", "vc e chat",
	"voce e feio", "voce e feia", "ninguem gosta de voce",
]
const APOLOGIES := [
	"desculpa", "desculpe", "desculpas", "perdao", "foi mal", "sinto muito", "me perdoa",
	"me desculpa", "nao quis dizer", "sorry", "perdoa",
]
const GREETINGS := ["oi", "oii", "oie", "ola", "eai", "eae", "salve", "hey", "opa", "hello", "hi"]
const GREETING_PHRASES := ["e ai", "bom dia", "boa tarde", "boa noite"]
const ASK_NAME := [
	"qual seu nome", "qual e seu nome", "qual o seu nome", "quem e voce", "quem e vc",
	"como voce se chama", "como vc se chama", "seu nome", "quem e tu",
]
const HOW_ARE_YOU := [
	"tudo bem", "td bem", "tudo bom", "como vai", "como voce esta", "como vc esta",
	"como voce ta", "como vc ta", "como esta", "beleza", "blz", "suave", "de boa",
]
const COMPLIMENTS := [
	"fofo", "fofa", "fofinho", "fofinha", "lindo", "linda", "lindinho", "lindinha", "incrivel",
	"bonito", "bonita", "querido", "querida", "fantastico", "fantastica", "maravilhoso",
	"maravilhosa", "perfeito", "perfeita", "gentil", "inteligente", "esperto", "esperta", "fofura",
]
const COMPLIMENT_PHRASES := [
	"te amo", "te adoro", "amo voce", "adoro voce", "gosto de voce", "gosto de vc", "meu amigo",
	"minha amiga", "melhor amigo", "melhor amiga", "voce e legal", "vc e legal", "voce e demais",
	"vc e demais", "voce e top", "vc e top", "muito legal",
]
const THANKS := ["obrigado", "obrigada", "valeu", "vlw", "brigado", "brigada", "obg", "agradeco"]
const BYE := ["tchau", "adeus", "fui", "xau", "bye", "tchauzinho"]
const BYE_PHRASES := ["ate mais", "ate logo", "ate amanha", "ate depois"]
const JOKES := ["piada", "piadas", "engracado", "engracada"]
const JOKE_PHRASES := ["me faz rir", "conta uma", "algo engracado"]
const SAD := [
	"triste", "chorando", "chorei", "sozinho", "sozinha", "deprimido", "deprimida", "magoado",
	"magoada", "medo", "chateado", "chateada", "infeliz", "solitario", "solitaria",
]
const SAD_PHRASES := ["to mal", "estou mal", "me sinto mal", "dia ruim", "ninguem gosta de mim"]
const LIKES_PHRASES := [
	"do que voce gosta", "do que vc gosta", "o que voce gosta", "o que vc gosta", "comida favorita",
	"cor favorita", "hobby", "passatempo", "o que voce faz", "o que vc faz", "voce gosta de que",
]
const AI_PHRASES := [
	"voce e uma ia", "vc e uma ia", "voce e um robo", "vc e um robo", "inteligencia artificial",
	"voce e real", "vc e real", "chatgpt", "voce e de verdade",
]
const PLACES := ["lago", "laguinho", "praca", "casa", "casinha", "macieira", "maca", "macas", "bambu", "bambuzal", "flor", "flores", "vila"]
const OTHER_NAMES := {
	"pipoca": ["pipoca", "coelha", "coelhinha", "coelho"],
	"biscoito": ["biscoito", "gato", "gatinho", "gata"],
	"bolinho": ["bolinho", "panda", "pandinha"],
}
const YES := ["sim", "claro", "uhum", "s", "ss", "simm", "com certeza", "aham", "yes", "isso"]
const NO := ["nao", "n", "nunca", "nem", "jamais", "no", "nada"]
const QUESTION_STARTS := ["que", "qual", "quais", "quem", "como", "onde", "quando", "porque", "por que", "pq", "quanto", "quantos", "quantas", "sera", "voce sabe", "vc sabe"]
const STOPWORDS := [
	"a", "o", "e", "de", "do", "da", "dos", "das", "que", "eu", "voce", "vc", "tu", "ele", "ela",
	"um", "uma", "uns", "umas", "para", "pra", "pro", "com", "sem", "em", "no", "na", "nos", "nas",
	"os", "as", "meu", "minha", "seu", "sua", "teu", "tua", "ta", "to", "esta", "estou", "eh",
	"sim", "nao", "gosta", "gosto", "sabe", "sei", "qual", "quais", "quem", "como", "onde", "quando",
	"porque", "por", "pq", "mais", "menos", "muito", "muita", "isso", "isto", "aquilo", "esse",
	"essa", "este", "tem", "ter", "tenho", "fazer", "faz", "fez", "vai", "vou", "foi", "era", "ser",
	"sou", "somos", "sao", "la", "aqui", "ai", "ja", "agora", "hoje", "entao", "tambem", "so", "mas",
	"ou", "se", "me", "te", "lhe", "quer", "queria", "acho", "acha", "gostaria", "coisa", "coisas",
	"algo", "alguem", "tudo", "nada", "bem", "mal", "oi", "ola", "cara", "mano", "tipo", "ne",
	"hein", "hum", "hmm", "ok", "sabia", "pode", "posso", "podia", "dia", "vez", "vezes", "estava",
	"estao", "voces", "nosso", "nossa", "dele", "dela", "pela", "pelo", "num", "numa", "seja",
	"falar", "fala", "disse", "dizer", "sobre", "entre", "depois", "antes", "ainda", "sempre",
	"conta", "conte", "contar", "quero", "quanto", "quantos", "quantas", "sera",
]

var profile: Dictionary
var npc_id := ""
var insult_count := 0
var _last_lines := {}
var _name_regex := RegEx.new()
var _likes_regex := RegEx.new()
var _math_regex := RegEx.new()
var _laugh_regex := RegEx.new()
var _word_regex := RegEx.new()


func _init(id: String, p: Dictionary) -> void:
	npc_id = id
	profile = p
	_name_regex.compile("(?:meu nome (?:é|e)|me chamo|eu me chamo|pode me chamar de|eu sou (?:o|a)|sou (?:o|a))\\s+([\\p{L}]{2,20})")
	_likes_regex.compile("(?:eu )?(?:gosto|adoro|amo) (?:muito )?(?:de |do |da )?([\\p{L} ]{3,30})")
	_math_regex.compile("(-?\\d+(?:[.,]\\d+)?)\\s*(\\+|-|\\*|x|/|mais|menos|vezes|dividido por)\\s*(-?\\d+(?:[.,]\\d+)?)")
	_laugh_regex.compile("(k{3,}|(?:ha){2,}|(?:he){2,}|(?:hi){2,}|rs(?:rs)+|\\blol\\b)")
	_word_regex.compile("[\\p{L}]+")


## Cumprimento ao abrir a conversa, conforme a amizade.
func greeting() -> Dictionary:
	var friendship := GameState.get_friendship(npc_id)
	if insult_count >= 3 or friendship < 0:
		return _out(_line("oi_bravo"), "triste", 0)
	if friendship >= 5:
		return _out(_line("oi_amigo"), "apaixonado", 0)
	return _out(_line("oi_normal"), "feliz", 0)


## Responde ao que o jogador escreveu. Nunca ignora: sempre comenta algo.
func reply(text: String) -> Dictionary:
	var raw := text.strip_edges()
	var norm := normalize(raw)
	var padded := " " + norm + " "
	var friendship := GameState.get_friendship(npc_id)

	# 1. desculpas (antes de tudo: "desculpa, seu bobo" ainda é um pedido de desculpas)
	if _has_any(padded, APOLOGIES):
		var was_hurt := insult_count > 0 or friendship < 0
		insult_count = 0
		if was_hurt:
			return _out(_line("desculpa"), "feliz", 1, "", "O filhote me pediu desculpas, que fofo.")
		return _out(_line("desculpa"), "feliz", 0)

	# 2. xingamentos
	if _is_insult(padded):
		insult_count += 1
		var emo: String = profile.get("emocao_xingada", "bravo")
		var gossip := "O filhote foi grosseiro comigo." if insult_count == 1 else ""
		if insult_count >= 3:
			return _out(_line("recusa"), emo, -2, "", gossip)
		return _out(_line("xingado"), emo, -2, "", gossip)

	# ainda magoado: só volta a conversar depois de desculpas
	if insult_count >= 3:
		return _out(_line("recusa"), "bravo", 0)

	# 3. o jogador disse o nome
	var name_match := _name_regex.search(raw.to_lower())
	if name_match != null:
		var new_name := name_match.get_string(1)
		if not normalize(new_name) in STOPWORDS:
			GameState.set_player_name(new_name)
			return _out(_line("nome_novo"), "feliz", 1, "O jogador se chama " + GameState.player_name)

	# 4. contas
	var math := _math_regex.search(norm)
	if math != null:
		var result := _calc(math.get_string(1), math.get_string(2), math.get_string(3))
		if result != "":
			return _out(_line("conta").replace("{resultado}", result), "animado", 0)

	# 5. perguntas sobre IA
	if _has_any(padded, AI_PHRASES):
		return _out(_line("ia"), "envergonhado", 0)

	# 6. cumprimentos
	if _has_any(padded, GREETINGS) or _has_any(padded, GREETING_PHRASES):
		var key := "oi_normal"
		if friendship >= 5:
			key = "oi_amigo"
		elif friendship < 0:
			key = "oi_bravo"
		return _out(_line(key), "feliz" if friendship >= 0 else "triste", 0)

	if _has_any(padded, ASK_NAME):
		return _out(_line("quem_sou"), "feliz", 0)
	if _has_any(padded, HOW_ARE_YOU):
		return _out(_line("tudo_bem"), "feliz", 0)
	if _has_any(padded, SAD) or _has_any(padded, SAD_PHRASES):
		return _out(_line("consolo"), "triste", 1)
	if _has_any(padded, THANKS):
		return _out(_line("obrigado"), "feliz", 1)
	if _has_any(padded, COMPLIMENTS) or _has_any(padded, COMPLIMENT_PHRASES):
		return _out(_line("elogio"), "apaixonado", 1, "", "O filhote me fez um elogio!")
	if _has_any(padded, BYE) or _has_any(padded, BYE_PHRASES):
		return _out(_line("tchau"), "feliz", 0)
	if _has_any(padded, JOKES) or _has_any(padded, JOKE_PHRASES):
		return _out(_line("piadas"), "animado", 0)
	if _laugh_regex.search(norm) != null:
		return _out(_line("risada"), "feliz", 0)
	if _has_any(padded, LIKES_PHRASES):
		return _out(_line("gostos"), "feliz", 0)

	# 7. falou de outro bichinho
	var others: Dictionary = profile.get("outros", {})
	for other_id in OTHER_NAMES.keys():
		if other_id == npc_id or not others.has(other_id):
			continue
		if _has_any(padded, OTHER_NAMES[other_id]):
			return _out(_pick(others[other_id], "outro_" + other_id), "neutro", 0)

	# 8. lugares da vila
	if _has_any(padded, PLACES):
		return _out(_line("lugares"), "feliz", 0)

	# 9. respostas curtas
	if norm in YES:
		return _out(_line("sim"), "feliz", 0)
	if norm in NO:
		return _out(_line("nao"), "neutro", 0)

	# 10. "eu gosto de X": lembra disso
	var likes := _likes_regex.search(raw.to_lower())
	var remember := ""
	if likes != null:
		var thing := likes.get_string(1).strip_edges()
		var words := thing.split(" ", false)
		if words.size() > 3:
			thing = " ".join(words.slice(0, 3))
		if thing.length() >= 3:
			remember = "O jogador gosta de " + thing

	# 11. qualquer outro assunto: comenta a palavra principal
	var word := _topic_word(raw)
	var is_question := raw.ends_with("?") or _starts_with_any(norm, QUESTION_STARTS)
	var bank := "pergunta" if is_question else "assunto"
	var line := _line(bank).replace("{palavra}", word if word != "" else "isso")
	if word != "":
		line = line.substr(0, 1).to_upper() + line.substr(1)
	return _out(line, "confuso" if is_question else "neutro", 0 if friendship > 6 else 1, remember)


# ---------------------------------------------------------------- utilidades

static func normalize(t: String) -> String:
	t = t.to_lower()
	var accented := "áàâãäéèêëíìîïóòôõöúùûüç"
	var plain := "aaaaaeeeeiiiiooooouuuuc"
	for i in accented.length():
		t = t.replace(accented[i], plain[i])
	var out := ""
	for c in t:
		if c in "abcdefghijklmnopqrstuvwxyz0123456789+-*/.,? ":
			out += c
		else:
			out += " "
	while out.contains("  "):
		out = out.replace("  ", " ")
	return out.strip_edges().trim_suffix("?").strip_edges()


func _is_insult(padded: String) -> bool:
	for phrase in INSULT_PHRASES:
		if padded.contains(phrase):
			return true
	for w in INSULTS:
		if padded.contains(" " + w + " "):
			return true
	return false


func _has_any(padded: String, list: Array) -> bool:
	for w in list:
		if padded.contains(" " + w + " "):
			return true
	return false


func _starts_with_any(norm: String, list: Array) -> bool:
	for w in list:
		if norm == w or norm.begins_with(w + " "):
			return true
	return false


func _topic_word(raw: String) -> String:
	var best := ""
	for m in _word_regex.search_all(raw):
		var w := m.get_string()
		var n := normalize(w)
		if n.length() < 3 or n in STOPWORDS:
			continue
		if w.length() >= best.length():
			best = w
	return best


func _calc(a_txt: String, op: String, b_txt: String) -> String:
	var a := float(a_txt.replace(",", "."))
	var b := float(b_txt.replace(",", "."))
	var r := 0.0
	match op:
		"+", "mais":
			r = a + b
		"-", "menos":
			r = a - b
		"*", "x", "vezes":
			r = a * b
		"/", "dividido por":
			if is_zero_approx(b):
				return "impossível, não dá para dividir por zero"
			r = a / b
		_:
			return ""
	if is_equal_approx(r, round(r)):
		return str(int(round(r)))
	return str(snappedf(r, 0.01)).replace(".", ",")


func _line(key: String) -> String:
	var falas: Dictionary = profile.get("falas", {})
	return _pick(falas.get(key, ["Hmm..."]), key)


## Escolhe uma fala sem repetir a última usada daquele tipo.
func _pick(options: Array, key: String) -> String:
	if options.is_empty():
		return "Hmm..."
	var idx := randi() % options.size()
	if options.size() > 1 and _last_lines.get(key, -1) == idx:
		idx = (idx + 1) % options.size()
	_last_lines[key] = idx
	return str(options[idx])


func _out(fala: String, emocao: String, amizade: int, lembrar := "", fofoca := "") -> Dictionary:
	var player := GameState.player_name if GameState.player_name != "" else "amiguinho"
	return {
		"fala": fala.replace("{nome}", player),
		"emocao": emocao,
		"amizade": amizade,
		"lembrar": lembrar,
		"fofoca": fofoca,
	}
