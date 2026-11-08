class_name LStatus
extends RefCounted
## Efeitos de status com regras de acúmulo previsíveis: o mais forte prevalece e renova a duração;
## escudos somam (até 600).

const LENT := "Lentidão"
const RAIZ := "Enraizado"
const ATORD := "Atordoado"
const ESCUDO := "Escudo"
const OFUSC := "Ofuscado"
const VENT := "Ventania"
const PRESSA := "Pressa"
const QUEIM := "Queimadura"
const IMPAR := "Imparável"

## Cada efeito: {"type", "rem", "mag", "src", "dir"}
var list: Array = []

func find(t: String) -> Dictionary:
    for e in list:
        if e["type"] == t:
            return e
    return {}

func has(t: String) -> bool:
    return not find(t).is_empty()

func mag(t: String) -> float:
    var e := find(t)
    return 0.0 if e.is_empty() else float(e["mag"])

func remove(t: String) -> void:
    var kept: Array = []
    for e in list:
        if e["type"] != t:
            kept.append(e)
    list = kept

func clear() -> void:
    list = []

func apply(t: String, dur: float, m: float, src: int, dir: Vector2 = Vector2.ZERO) -> bool:
    if dur <= 0.0:
        return false
    var ex := find(t)
    if t == ESCUDO and not ex.is_empty():
        ex["mag"] = minf(600.0, float(ex["mag"]) + m)
        ex["rem"] = maxf(float(ex["rem"]), dur)
        return true
    if not ex.is_empty():
        if m >= float(ex["mag"]):
            ex["mag"] = m
            ex["dir"] = dir
            ex["src"] = src
        ex["rem"] = maxf(float(ex["rem"]), dur)
        return true
    list.append({"type": t, "rem": dur, "mag": m, "src": src, "dir": dir})
    return true

## Consome escudo; devolve o dano que sobrou.
func absorb(d: float) -> float:
    var sh := find(ESCUDO)
    if sh.is_empty():
        return d
    var m := float(sh["mag"])
    if m >= d:
        sh["mag"] = m - d
        if m - d <= 0.01:
            remove(ESCUDO)
        return 0.0
    remove(ESCUDO)
    return d - m

func tick(dt: float) -> void:
    var kept: Array = []
    for e in list:
        e["rem"] = float(e["rem"]) - dt
        if e["rem"] > 0.0:
            kept.append(e)
    list = kept
