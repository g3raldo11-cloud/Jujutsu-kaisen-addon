class_name Ground
extends Node2D
## Ground-level drawing under the characters: scorch marks, contact shadows and the
## danger telegraphs (meteor circles, the charge lane, the ring wind-up, root circles).

var main


func _ellipse(c: Vector2, rx: float, ry: float, col: Color, n: int = 20) -> void:
	if rx < 1.5 or ry < 1.0:
		return
	var pts := PackedVector2Array()
	for i in n:
		var a := TAU * float(i) / float(n)
		pts.append((c + Vector2(cos(a) * rx, sin(a) * ry)).floor())
	draw_colored_polygon(pts, col)


func _ring(c: Vector2, rx: float, ry: float, col: Color, w: float = 1.0) -> void:
	draw_set_transform(c.floor(), 0.0, Vector2(1.0, ry / rx))
	draw_arc(Vector2.ZERO, rx, 0.0, TAU, 36, col, w)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


func _draw() -> void:
	var t: float = main.t
	# scorch marks left by meteors
	for d in main.decals:
		var k := clampf(float(d["life"]) / float(d["max"]), 0.0, 1.0)
		var p: Vector2 = d["p"]
		var r: float = d["r"]
		_ellipse(p, r, r * 0.55, Color(0.12, 0.06, 0.04, 0.32 * k))
		_ellipse(p, r * 0.6, r * 0.33, Color(0.06, 0.03, 0.02, 0.3 * k))
		if k > 0.5:
			for i in 5:
				var a := float(i) * 1.7 + float(d["seed"])
				var ep := p + Vector2(cos(a) * r * 0.5, sin(a) * r * 0.28)
				var glow := 0.5 + 0.5 * sin(t * 6.0 + a * 3.0)
				draw_rect(Rect2(ep.floor(), Vector2.ONE), Color(1.0, 0.45, 0.1, glow * (k - 0.5) * 2.0))

	# contact shadows
	var player: Player = main.player
	var boss: Boss = main.boss
	if player.visible:
		var lift := 0.0
		if player.dash_t > 0.0 or player.pounce_t > 0.0:
			lift = 2.0
		_ellipse(player.position + Vector2(0, -1), 10.0 - lift, 3.5, Color(0, 0, 0, 0.42))
	if boss.visible and boss.death_t < 2.2:
		_ellipse(boss.position + Vector2(0, -1), 19.0, 5.5, Color(0, 0, 0, 0.45))

	# roots: target circle, then cracked earth while they hold
	for rc in main.root_casts:
		var p: Vector2 = rc["p"]
		var r: float = rc["r"]
		var age: float = rc["t"]
		if not rc["struck"]:
			var k := clampf(age / 0.45, 0.0, 1.0)
			_ellipse(p, r * k, r * k * 0.55, Color(0.35, 0.85, 0.25, 0.18))
			_ring(p, r, r * 0.55, Color(0.55, 1.0, 0.35, 0.85), 1.0)
		else:
			var fade := clampf((3.4 - age) / 0.6, 0.0, 1.0)
			_ellipse(p, r, r * 0.55, Color(0.1, 0.06, 0.03, 0.35 * fade))
			for i in 9:
				var a := TAU * float(i) / 9.0 + 0.3
				var q := p
				for j in 4:
					var nq := p + Vector2(cos(a + sin(float(j) + float(i)) * 0.3) * r * (j + 1) / 4.0, sin(a) * r * 0.55 * (j + 1) / 4.0)
					draw_line(q.floor(), nq.floor(), Color(0.08, 0.05, 0.03, 0.8 * fade), 1.0)
					q = nq

	# boss telegraphs
	if main.is_fighting() and not boss.dead:
		var frac := 0.0
		if boss.total > 0.0:
			frac = clampf(1.0 - boss.timer / boss.total, 0.0, 1.0)
		match boss.st:
			"charge":
				if boss.step == 0:
					var d: Vector2 = boss.cdir
					var perp := d.orthogonal() * 14.0
					var reach := 230.0
					var b: Vector2 = boss.position
					var poly := PackedVector2Array([(b + perp).floor(), (b + d * reach + perp).floor(), (b + d * reach - perp).floor(), (b - perp).floor()])
					draw_colored_polygon(poly, Color(1.0, 0.15, 0.05, 0.1 + 0.25 * frac))
					if frac > 0.03:
						var head := b + d * reach * frac
						var poly2 := PackedVector2Array([(b + perp).floor(), (head + perp).floor(), (head - perp).floor(), (b - perp).floor()])
						draw_colored_polygon(poly2, Color(1.0, 0.3, 0.08, 0.22))
					draw_line((b + perp).floor(), (b + d * reach + perp).floor(), Color(1.0, 0.4, 0.15, 0.85), 1.0)
					draw_line((b - perp).floor(), (b + d * reach - perp).floor(), Color(1.0, 0.4, 0.15, 0.85), 1.0)
			"ring":
				if boss.step == 0:
					var rr := 70.0 * (1.0 - frac) + 14.0
					_ring(boss.position, rr, rr * 0.55, Color(1.0, 0.4, 0.1, 0.4 + 0.6 * frac), 2.0)
			"roar":
				var rr2 := 20.0 + 90.0 * fmod(t * 1.6, 1.0)
				_ring(boss.position, rr2, rr2 * 0.55, Color(1.0, 0.35, 0.1, 0.8 * (1.0 - fmod(t * 1.6, 1.0))), 2.0)

	# meteor target circles
	for z in main.zones:
		if z["kind"] != "warn":
			continue
		var p: Vector2 = z["p"]
		var r: float = z["r"]
		var prog := clampf(1.0 - float(z["t"]) / float(z["max"]), 0.0, 1.0)
		var pulse := 0.5 + 0.5 * sin(t * 18.0)
		_ellipse(p, r, r * 0.55, Color(1.0, 0.2, 0.05, 0.12))
		_ellipse(p, r * prog, r * prog * 0.55, Color(1.0, 0.35, 0.08, 0.25 + 0.15 * pulse))
		_ring(p, r, r * 0.55, Color(1.0, 0.35, 0.1, 0.9), 1.0)
		# chevrons pointing inward
		for i in 4:
			var a := TAU * float(i) / 4.0 + PI * 0.25
			var e := p + Vector2(cos(a) * r, sin(a) * r * 0.55)
			draw_rect(Rect2(e.floor() - Vector2.ONE, Vector2(2, 2)), Color(1.0, 0.8, 0.3, 0.9))
