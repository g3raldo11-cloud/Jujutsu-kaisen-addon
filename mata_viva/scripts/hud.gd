class_name HUD
extends Node2D
## Screen-space interface, all in pixel art: boss name card and bar, player medallion,
## power slots with cooldown sweeps, crosshair, Hades-style title banners and menus.

const GOLD := Color("f0c040")
const GOLD_D := Color("8a5414")
const INK := Color("120c18")
const CREAM := Color("f6eeda")
const LEAF := Color("8cf05a")
const FIRE := Color("ff7a1a")

var main
var icons: Texture2D
var cursor: Texture2D
var logo: Texture2D
var face_tex: Texture2D
var boss_tex: Texture2D
var t := 0.0


func _ready() -> void:
	icons = load("res://assets/sprites/power_icons.png")
	cursor = load("res://assets/sprites/cursor.png")
	logo = load("res://assets/sprites/logo.png")
	face_tex = load("res://assets/sprites/tiaraju_idle.png")
	boss_tex = load("res://assets/sprites/capitao_idle.png")


func _process(delta: float) -> void:
	t += delta


func txt(s: String, pos: Vector2, col: Color, scale: int = 1, align: int = 0) -> void:
	PixelText.draw(self, s, pos, col, scale, align)


# ------------------------------------------------------------------ frames
func frame(r: Rect2, fill: Color = Color(0.04, 0.05, 0.05, 0.9)) -> void:
	draw_rect(r.grow(2), INK)
	draw_rect(r.grow(1), GOLD_D)
	draw_rect(r, fill)
	# gold corner studs
	for c in [r.position, Vector2(r.end.x - 1, r.position.y), Vector2(r.position.x, r.end.y - 1), r.end - Vector2.ONE]:
		draw_rect(Rect2(c - Vector2.ONE, Vector2(3, 3)), GOLD)


func bar(r: Rect2, frac: float, trail: float, col_a: Color, col_b: Color) -> void:
	draw_rect(r.grow(2), INK)
	draw_rect(r.grow(1), GOLD_D)
	draw_rect(r, Color(0.09, 0.05, 0.06))
	var tw := floorf(r.size.x * clampf(trail, 0.0, 1.0))
	draw_rect(Rect2(r.position, Vector2(tw, r.size.y)), Color("f6eeda"))
	var w := floorf(r.size.x * clampf(frac, 0.0, 1.0))
	draw_rect(Rect2(r.position, Vector2(w, r.size.y)), col_a)
	draw_rect(Rect2(r.position, Vector2(w, ceilf(r.size.y * 0.4))), col_b)
	# dithered sheen in the dark lower half
	for x in range(int(r.position.x), int(r.position.x + w), 2):
		draw_rect(Rect2(x, r.end.y - 1, 1, 1), col_a.darkened(0.35))


func diamond(c: Vector2, s: float, col: Color) -> void:
	draw_colored_polygon(PackedVector2Array([c + Vector2(0, -s), c + Vector2(s, 0), c + Vector2(0, s), c + Vector2(-s, 0)]), col)


# ------------------------------------------------------------------ draw
func _draw() -> void:
	var st: int = main.state
	if st == Main.S.TITLE:
		_draw_title()
	else:
		_draw_fight_hud()
		if not main.banner.is_empty():
			_draw_banner(main.banner)
		if st == Main.S.PAUSE:
			_draw_pause()
		elif st == Main.S.WIN or st == Main.S.LOSE:
			_draw_end(st == Main.S.WIN)
	if not main.using_pad:
		var m := get_viewport().get_mouse_position().floor()
		draw_texture(cursor, m - Vector2(5, 5))


func _draw_fight_hud() -> void:
	var boss: Boss = main.boss
	var player: Player = main.player
	# --- boss: name card + bar -------------------------------------------
	var bw := 300.0
	var bx := floorf((640.0 - bw) / 2.0)
	var name_col := Color("ffd9a0")
	if boss.phase2 and not boss.dead:
		name_col = Color(1.0, 0.55 + 0.2 * sin(t * 8.0), 0.3)
	txt(Main.BOSS_NAME, Vector2(320, 2), name_col, 2, 1)
	var br := Rect2(bx, 28, bw, 7)
	bar(br, boss.hp / boss.hp_max, boss.hp_disp / boss.hp_max, Color("c8321f"), Color("ec5a35"))
	draw_rect(Rect2(bx + bw * 0.5, 26, 1, 11), Color(1, 1, 1, 0.75))
	diamond(Vector2(bx - 6, 31), 4, INK)
	diamond(Vector2(bx - 6, 31), 3, GOLD)
	diamond(Vector2(bx + bw + 5, 31), 4, INK)
	diamond(Vector2(bx + bw + 5, 31), 3, GOLD)
	var sub: String = Main.BOSS_TITLE
	var sub_col := Color(1.0, 0.72, 0.45, 0.9)
	if boss.phase2:
		sub = "Fúria do Fogo"
		sub_col = Color(1.0, 0.4, 0.2, 0.75 + 0.25 * sin(t * 6.0))
	txt(sub, Vector2(320, 37), sub_col, 1, 1)
	if boss.root > 0.0:
		txt("PRESO  +25% dano", Vector2(bx + bw + 14, 26), Color("8fdc4a"), 1, 0)

	# --- player medallion + bars ------------------------------------------
	var pr := Rect2(10, 318, 30, 30)
	frame(pr, Color(0.06, 0.1, 0.07, 0.95))
	draw_texture_rect_region(face_tex, Rect2(pr.position + Vector2(1, 2), Vector2(28, 27)), Rect2(10, 1, 28, 27))
	if player.flash > 0.0:
		draw_rect(pr, Color(1, 1, 1, player.flash * 0.6))
	txt(Main.PLAYER_NAME, Vector2(48, 314), Color("c9f09a"))
	var status := ""
	var scol := FIRE
	if player.burn > 0.0:
		status = "QUEIMANDO"
		scol = Color(1.0, 0.55, 0.2, 0.6 + 0.4 * sin(t * 12.0))
	elif player.heal_t > 0.0:
		status = "CURANDO"
		scol = LEAF
	if status != "":
		txt(status, Vector2(48 + PixelText.width(Main.PLAYER_NAME) + 8, 314), scol)
	var hr := Rect2(48, 328, 150, 7)
	bar(hr, player.hp / player.hp_max, player.hp_disp / player.hp_max, Color("3f8a3c"), Color("7cbf45"))
	txt("%d/%d" % [int(ceilf(player.hp)), int(player.hp_max)], Vector2(204, 323), CREAM)
	# dash meter: a thin leaf-green line that refills
	var dk := 1.0 - player.dash_cd / Player.DASH_CD
	draw_rect(Rect2(48, 339, 60, 3), INK)
	draw_rect(Rect2(49, 340, floorf(58.0 * clampf(dk, 0.0, 1.0)), 1), LEAF if dk >= 1.0 else Color(0.4, 0.6, 0.35))
	txt("ESQUIVA", Vector2(112, 335), Color(0.75, 0.85, 0.7, 0.8))

	# --- power slots ---------------------------------------------------------
	var x0 := 462.0
	for i in player.powers.size():
		var pw: Dictionary = player.powers[i]
		var r := Rect2(x0 + i * 34, 318, 28, 28)
		var cdl: float = pw["t"]
		var cdm: float = pw["cd"]
		var ready := cdl <= 0.0
		frame(r, Color(0.05, 0.08, 0.06, 0.95))
		var icol := Color.WHITE if ready else Color(0.45, 0.45, 0.5)
		draw_texture_rect_region(icons, Rect2(r.position + Vector2(2, 2), Vector2(24, 24)), Rect2(i * 24, 0, 24, 24), icol)
		if not ready:
			var h := floorf(r.size.y * (cdl / cdm))
			draw_rect(Rect2(r.position, Vector2(r.size.x, h)), Color(0.02, 0.02, 0.03, 0.6))
			if cdm >= 1.0:
				txt("%d" % int(ceilf(cdl)), r.get_center() + Vector2(0, -6), CREAM, 1, 1)
		elif i > 0:
			var pulse := 0.5 + 0.5 * sin(t * 4.0 + i)
			var c: Color = pw["col"]
			draw_rect(r.grow(1), Color(c.r, c.g, c.b, 0.25 + 0.45 * pulse), false, 1.0)
		txt(str(i + 1), r.position + Vector2(-1, -3), Color("ffe9b0"))


func _draw_banner(b: Dictionary) -> void:
	var k := float(b["t"])
	var life := float(b["life"])
	var a := clampf(k / 0.18, 0.0, 1.0) * clampf((life - k) / 0.35, 0.0, 1.0)
	var grow := clampf(k / 0.22, 0.0, 1.0)
	var cy := 150.0
	var hh := floorf(30.0 * (1.0 - pow(1.0 - grow, 3.0)))
	if hh < 1.0:
		return
	# ink brush band with a ragged edge
	var pts := PackedVector2Array()
	var seg := 16
	for i in seg + 1:
		var x := -10.0 + 660.0 * i / seg
		pts.append(Vector2(x, cy - hh - (3.0 if i % 2 == 0 else 0.0) - (2.0 if i % 3 == 0 else 0.0)))
	for i in range(seg, -1, -1):
		var x := -10.0 + 660.0 * i / seg
		pts.append(Vector2(x, cy + hh + (3.0 if i % 2 == 1 else 0.0) + (2.0 if i % 5 == 0 else 0.0)))
	draw_colored_polygon(pts, Color(0.03, 0.02, 0.04, 0.88 * a))
	var col: Color = b["col"]
	draw_rect(Rect2(0, cy - hh - 6, 640, 1), Color(col.r, col.g, col.b, 0.6 * a))
	draw_rect(Rect2(0, cy + hh + 5, 640, 1), Color(col.r, col.g, col.b, 0.6 * a))
	var slide := floorf((1.0 - grow) * 40.0)
	txt(String(b["title"]), Vector2(320 + slide, cy - 24), Color(col.r, col.g, col.b, a), 3, 1)
	txt(String(b["sub"]), Vector2(320 - slide, cy + 14), Color(CREAM.r, CREAM.g, CREAM.b, a * 0.9), 1, 1)


func _draw_title() -> void:
	draw_rect(Rect2(0, 0, 640, 360), Color(0.02, 0.03, 0.03, 0.62))
	draw_texture_rect(logo, Rect2(120, 14, 400, 72), false)
	txt("Brasil Colônia  •  século XVIII", Vector2(320, 88), Color("f0d9a0"), 1, 1)
	var lines := [
		"Os povos originários resistem à expansão colonial. Pelas matas, o Capitão do Mato",
		"— caçador pago para capturar pessoas escravizadas que fugiram — avança com fogo e pólvora.",
		"Você é Tiaraju, guerreiro guarani inspirado em Sepé Tiaraju (c.1723–1756),",
		"liderança da Guerra Guaranítica. Use a força da floresta para vencer o fogo.",
	]
	for i in lines.size():
		txt(lines[i], Vector2(320, 108 + i * 13), Color(0.92, 0.95, 0.88), 1, 1)
	txt("(O Capitão do Mato desta luta é um personagem fictício.)", Vector2(320, 162), Color(0.7, 0.75, 0.65), 1, 1)
	# powers
	var player: Player = main.player
	var x0 := 70.0
	for i in player.powers.size():
		var pw: Dictionary = player.powers[i]
		var cx := x0 + i * 125.0
		var r := Rect2(cx - 14, 186, 28, 28)
		frame(r)
		draw_texture_rect_region(icons, Rect2(r.position + Vector2(2, 2), Vector2(24, 24)), Rect2(i * 24, 0, 24, 24))
		txt(String(pw["full"]), Vector2(cx, 218), pw["col"], 1, 1)
		txt(String(pw["key"]), Vector2(cx, 230), Color(0.8, 0.8, 0.75), 1, 1)
	txt("WASD mover  •  Mouse mirar  •  Segure o clique: flechas  •  Espaço: esquiva (invulnerável)", Vector2(320, 254), Color("c9f09a"), 1, 1)
	txt("Esc pausa  •  M música  •  F11 tela cheia  •  Controle: RT atira, A esquiva, X/B/Y/LB poderes", Vector2(320, 267), Color(0.75, 0.82, 0.7), 1, 1)
	if int(t * 2.0) % 2 == 0:
		txt("Pressione ENTER ou clique para começar", Vector2(320, 300), Color("ffd24a"), 2, 1)
	txt("Arte em pixel feita no Pixelwright", Vector2(632, 348), Color(0.5, 0.55, 0.5), 1, 2)


func _draw_pause() -> void:
	draw_rect(Rect2(0, 0, 640, 360), Color(0.02, 0.03, 0.03, 0.7))
	txt("PAUSADO", Vector2(320, 90), GOLD, 3, 1)
	var player: Player = main.player
	for i in player.powers.size():
		var pw: Dictionary = player.powers[i]
		var y := 150.0 + i * 18.0
		draw_texture_rect_region(icons, Rect2(210, y - 4, 12, 12), Rect2(i * 24, 0, 24, 24))
		txt(String(pw["full"]), Vector2(230, y - 3), pw["col"])
		txt(String(pw["key"]), Vector2(430, y - 3), CREAM, 1, 2)
	txt("Espaço / Shift: esquiva invulnerável", Vector2(320, 248), Color("c9f09a"), 1, 1)
	txt("ESC para voltar", Vector2(320, 280), Color("ffd24a"), 1, 1)


func _draw_end(win: bool) -> void:
	if main.state_t < 2.6:
		return
	var a := clampf((main.state_t - 2.6) / 0.5, 0.0, 1.0)
	var r := Rect2(200, 200, 240, 74)
	draw_rect(r.grow(2), Color(INK.r, INK.g, INK.b, a))
	draw_rect(r.grow(1), Color(GOLD_D.r, GOLD_D.g, GOLD_D.b, a))
	draw_rect(r, Color(0.04, 0.05, 0.05, 0.92 * a))
	var secs := int(main.fight_time)
	txt("Tempo de luta: %d:%02d" % [secs / 60, secs % 60], Vector2(320, 208), Color(CREAM.r, CREAM.g, CREAM.b, a), 1, 1)
	txt("Dano recebido: %d" % int(main.player.damage_taken), Vector2(320, 222), Color(CREAM.r, CREAM.g, CREAM.b, a), 1, 1)
	if not win:
		txt("Dica: esquive ATRAVÉS do fogo e prenda o Capitão com Raízes.", Vector2(320, 236), Color(1.0, 0.75, 0.5, a), 1, 1)
	else:
		txt("A mata respira de novo.", Vector2(320, 236), Color(LEAF.r, LEAF.g, LEAF.b, a), 1, 1)
	if int(main.t * 2.0) % 2 == 0:
		txt("ENTER para lutar de novo", Vector2(320, 254), Color(1.0, 0.82, 0.3, a), 1, 1)
