class_name LStats
extends RefCounted
## Atributos-base e habilidades de uma entidade.

var display_name := ""
var role := ""
var lore := ""
var color := Color.WHITE
var passive_name := ""
var passive_desc := ""
var max_hp := 550.0
var speed := 6.0
var radius := 0.5
var basic_damage := 40.0
var basic_range := 2.2
var basic_arc := 90.0
var basic_interval := 0.7
var regen := 5.0
## [básico, habilidade 1, habilidade 2, habilidade 3, suprema]
var abilities: Array[LAbility] = []
