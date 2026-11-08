class_name LAbility
extends RefCounted
## Definição de habilidade (dados de balanceamento e de indicador de alcance).

var name := ""
var cd := 0.0
var cost := 0.0
var reach := 0.0
var area := 0.0
## "cone", "line", "circle", "area" (área no alvo) ou "none"
var shape := "none"
var cone := 0.0
var desc := ""

static func make(p_name: String, p_cd: float, p_cost: float, p_range: float, p_area: float, p_shape: String, p_cone: float, p_desc: String) -> LAbility:
    var a := LAbility.new()
    a.name = p_name
    a.cd = p_cd
    a.cost = p_cost
    a.reach = p_range
    a.area = p_area
    a.shape = p_shape
    a.cone = p_cone
    a.desc = p_desc
    return a
