class_name LZone
extends RefCounted
## Área com efeito contínuo. Tipos: fogo, reino, ancora, tempestade, pegada, circulo, ira.

var id: int = 0
var kind: String = ""
var owner_id: int = 0
var team: int = -1
var pos := Vector2.ZERO
var radius := 1.0
var rem := 1.0
var dur := 1.0
var tick_timer := 0.0
var follow_id := -1
## Intensidade definida por quem criou (ex.: Calor do Curupira no lançamento).
var power := 1.0
## Ângulo visual (pegadas do Curupira).
var angle := 0.0
