class_name LCommand
extends RefCounted
## Comando de um jogador para um tick: a única coisa que um cliente enviaria a um servidor autoritativo.

const H1 := 1
const H2 := 2
const H3 := 4
const ULT := 8
const DODGE := 16
const JUMP := 32
const SLOT_BTN: Array[int] = [0, H1, H2, H3, ULT]

var move := Vector2.ZERO
var aim := Vector2.ZERO
var attack := false
var sprint := false
var pressed := 0

func duplicate_cmd() -> LCommand:
    var c := LCommand.new()
    c.move = move
    c.aim = aim
    c.attack = attack
    c.sprint = sprint
    c.pressed = pressed
    return c
