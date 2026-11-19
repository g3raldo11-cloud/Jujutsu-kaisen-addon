class_name PixelText
extends RefCounted
## Draws text with the "Mata Pixel" bitmap font (assets/fonts/matapixel.png) at integer
## scales, with a pixel outline, so every letter stays on the 640x360 pixel grid.

static var _tex: Texture2D

const OUTLINE := Color(0.07, 0.047, 0.094, 1.0)
const OFFS := [Vector2(-1, 0), Vector2(1, 0), Vector2(0, -1), Vector2(0, 1), Vector2(-1, -1), Vector2(1, -1), Vector2(-1, 1), Vector2(1, 1)]


static func texture() -> Texture2D:
	if _tex == null:
		_tex = load("res://assets/fonts/matapixel.png")
	return _tex


static func glyph(ch: String) -> Array:
	if FontDB.GLYPHS.has(ch):
		return FontDB.GLYPHS[ch]
	return FontDB.GLYPHS["?"]


static func width(text: String, scale: int = 1) -> int:
	var w := 0
	for ch in text:
		w += int(glyph(ch)[3])
	return maxi(0, w - 1) * scale


## pos is the top-left of the text cell (cap height starts 3*scale px below it).
## align: 0 left, 1 centre, 2 right.
static func draw(ci: CanvasItem, text: String, pos: Vector2, color: Color, scale: int = 1, align: int = 0, outline: Color = OUTLINE) -> void:
	var w := width(text, scale)
	var x := pos.x
	if align == 1:
		x -= floorf(w / 2.0)
	elif align == 2:
		x -= w
	var origin := Vector2(floorf(x), floorf(pos.y))
	if outline.a > 0.0:
		var oc := Color(outline.r, outline.g, outline.b, outline.a * color.a)
		for o in OFFS:
			_run(ci, text, origin + o * scale, oc, scale)
	_run(ci, text, origin, color, scale)


static func _run(ci: CanvasItem, text: String, origin: Vector2, color: Color, scale: int) -> void:
	var tex := texture()
	var x := origin.x
	for ch in text:
		var g: Array = glyph(ch)
		var gw := int(g[2])
		if ch != " ":
			ci.draw_texture_rect_region(tex, Rect2(x, origin.y, gw * scale, FontDB.CELL_H * scale), Rect2(int(g[0]), int(g[1]), gw, FontDB.CELL_H), color)
		x += int(g[3]) * scale
