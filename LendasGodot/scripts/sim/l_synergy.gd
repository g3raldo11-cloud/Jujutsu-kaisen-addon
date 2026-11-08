class_name LSynergy
extends RefCounted
## Fusão de Lendas: duas entidades aliadas combinando habilidades no momento certo geram uma Ressonância.
## Contra abuso: recarga própria por equipe + bloqueio global de 8 s por equipe; Ressonâncias não encadeiam.

const RULES := {
    "tempestade": {"name": "Tempestade de Brasas", "cd": 25.0, "desc": "O Redemoinho do Saci atravessa fogo aliado (Boitatá ou Curupira) e vira um tornado de brasas que queima e puxa inimigos."},
    "brasa": {"name": "Brasa ao Vento", "cd": 18.0, "desc": "O Vento Travesso soprado através de fogo aliado espalha brasas: todos os atingidos queimam."},
}
const TEAM_LOCKOUT := 8.0

var sim: LSim
var _ready_at := [{}, {}]
var _lock := [0.0, 0.0]

func is_ready(team: int, rule_id: String) -> bool:
    if team < 0 or team > 1:
        return false
    return sim.time >= _lock[team] and not (float(_ready_at[team].get(rule_id, 0.0)) > sim.time)

func remaining(team: int, rule_id: String) -> float:
    return maxf(0.0, maxf(float(_ready_at[team].get(rule_id, 0.0)), _lock[team]) - sim.time)

func _consume(team: int, rule_id: String, a: LChampion, b: LChampion, p: Vector2) -> void:
    _ready_at[team][rule_id] = sim.time + float(RULES[rule_id]["cd"])
    _lock[team] = sim.time + TEAM_LOCKOUT
    a.synergies += 1
    if b != null and b != a:
        b.synergies += 1
    sim.emit("synergy", {"src": a.id, "tgt": b.id if b != null else 0, "pos": p, "text": RULES[rule_id]["name"]})

func allied_fire(team: int, center: Vector2, r: float, exclude_owner: int) -> LZone:
    for z in sim.zones:
        if z.team != team or z.owner_id == exclude_owner:
            continue
        if z.kind != "fogo" and z.kind != "circulo" and z.kind != "ira":
            continue
        if z.pos.distance_to(center) <= z.radius + r:
            return z
    return null

## Contínua: Redemoinho do Saci atravessando fogo aliado → Tempestade de Brasas.
func tick() -> void:
    for c in sim.champions:
        if not c.alive or not (c.kit is LSaciKit):
            continue
        var k := c.kit as LSaciKit
        if not k.is_tornado() or k.fused:
            continue
        if not is_ready(c.team, "tempestade"):
            continue
        var fire := allied_fire(c.team, c.pos, 1.2, c.id)
        if fire == null:
            continue
        k.fused = true
        sim.add_zone("tempestade", c, c.pos, 3.2, k.tornado + 3.0, c.id)
        _consume(c.team, "tempestade", c, sim.champion(fire.owner_id), c.pos)

## Vento Travesso atravessando fogo aliado → Brasa ao Vento.
func try_brasa(saci: LChampion, origin: Vector2, dir: Vector2, reach: float, hit: Array[LUnit]) -> bool:
    if not is_ready(saci.team, "brasa"):
        return false
    var fire: LZone = null
    var d := 0.0
    while d <= reach and fire == null:
        fire = allied_fire(saci.team, origin + dir * d, 1.5, saci.id)
        d += 1.5
    if fire == null:
        return false
    for u in hit:
        sim.apply_status(u, LStatus.QUEIM, 3.0, 25.0, saci)
    _consume(saci.team, "brasa", saci, sim.champion(fire.owner_id), fire.pos)
    return true
