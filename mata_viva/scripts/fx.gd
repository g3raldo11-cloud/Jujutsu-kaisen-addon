class_name FX
extends Node2D
## Every transient visual of the fight, drawn above the lighting pass so fire and magic
## stay at full brightness: pixel particles, Pixelwright effect strips, shockwave rings,
## afterimages, claw slashes, projectiles, burning trails, fireflies and damage numbers.
## A child node adds dithered glow halos with additive blending.

const FIRE := [Color("fff4c0"), Color("ffbe3c"), Color("ff7a1a"), Color("d23410"), Color("86140e"), Color("3e0a0c")]
const MAGIC := [Color("e4ffc0"), Color("8cf05a"), Color("2fb04a"), Color("10663c")]
const MAX_PARTS := 900

var main
var parts: Array = []
var anims: Array = []
var rings: Array = []
var texts: Array = []
var ghosts: Array = []
var slashes: Array = []
var flies: Array = []
var strips := {}
var thorn_tex: Texture2D
var glow_tex: Texture2D
var glow_layer: Node2D
var t := 0.0


func setup(m) -> void:
	main = m
	for key in ["hit_spark", "explosion", "dust_puff", "root_spike", "ground_flame", "leaf", "fireball"]:
		var e: Dictionary = SpriteDB.ANIMS[key]
		var a_name: String = e["anims"].keys()[0]
		var a: Dictionary = e["anims"][a_name]
		strips[key] = {"tex": load(String(a["tex"])), "n": int(a["n"]), "w": int(e["w"]), "h": int(e["h"]), "ms": a["ms"], "loop": bool(a["loop"])}
	thorn_tex = load("res://assets/sprites/thorn_arrow.png")
	glow_tex = _make_glow(32)
	glow_layer = Node2D.new()
	var mat := CanvasItemMaterial.new()
	mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	glow_layer.material = mat
	add_child(glow_layer)
	glow_layer.draw.connect(_draw_glows)
	var r := RandomNumberGenerator.new()
	r.seed = 1756
	for i in 34:
		flies.append({"p": Vector2(r.randf_range(40, 660), r.randf_range(90, 380)), "ph": r.randf() * TAU, "sp": r.randf_range(0.4, 0.9)})


func clear() -> void:
	parts.clear()
	anims.clear()
	rings.clear()
	texts.clear()
	ghosts.clear()
	slashes.clear()


func _make_glow(s: int) -> Texture2D:
	var img := Image.create(s, s, false, Image.FORMAT_RGBA8)
	var bayer := [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
	var half := s / 2.0
	for y in s:
		for x in s:
			var d := Vector2(x + 0.5 - half, y + 0.5 - half).length() / half
			var f := clampf(1.0 - d, 0.0, 1.0)
			f = f * f
			var th := (float(bayer[(x % 4) + (y % 4) * 4]) + 0.5) / 16.0
			var q := floorf(f * 4.0 + th) / 4.0
			img.set_pixel(x, y, Color(1, 1, 1, q))
	return ImageTexture.create_from_image(img)


# ------------------------------------------------------------------ spawners
func burst(p: Vector2, col: Color, n: int, speed: float, life: float, size: int = 1, grav: float = 0.0, up: float = 0.0, glow: bool = false) -> void:
	for i in n:
		var l := life * randf_range(0.55, 1.0)
		var v := Vector2.from_angle(randf() * TAU) * speed * randf_range(0.3, 1.0) + Vector2(0, -up)
		parts.append({"p": p, "v": v, "life": l, "max": l, "col": col, "ramp": [], "size": size, "grav": grav, "drag": 2.5, "glow": glow})
	_trim()


func ramp_burst(p: Vector2, ramp: Array, n: int, speed: float, life: float, size: int = 1, grav: float = 0.0, up: float = 0.0, glow: bool = true, spread: float = 0.0) -> void:
	for i in n:
		var l := life * randf_range(0.55, 1.0)
		var v := Vector2.from_angle(randf() * TAU) * speed * randf_range(0.25, 1.0) + Vector2(0, -up)
		var q := p + Vector2(randf_range(-spread, spread), randf_range(-spread, spread) * 0.6)
		parts.append({"p": q, "v": v, "life": l, "max": l, "col": ramp[0], "ramp": ramp, "size": size, "grav": grav, "drag": 2.0, "glow": glow})
	_trim()


func embers(p: Vector2, n: int, speed: float = 22.0, spread: float = 6.0, life: float = 0.9) -> void:
	ramp_burst(p, FIRE, n, speed, life, 1, -18.0, 20.0, true, spread)


func magic(p: Vector2, n: int, speed: float = 60.0, life: float = 0.7, up: float = 0.0, spread: float = 0.0) -> void:
	ramp_burst(p, MAGIC, n, speed, life, 1, 0.0, up, true, spread)


func directed(p: Vector2, dir: Vector2, ramp: Array, n: int, speed: float, cone: float, life: float) -> void:
	for i in n:
		var l := life * randf_range(0.5, 1.0)
		var v := Vector2.from_angle(dir.angle() + randf_range(-cone, cone)) * speed * randf_range(0.4, 1.0)
		parts.append({"p": p, "v": v, "life": l, "max": l, "col": ramp[0], "ramp": ramp, "size": 1, "grav": 0.0, "drag": 3.0, "glow": true})
	_trim()


func leaves(p: Vector2, n: int, speed: float = 70.0, life: float = 1.1) -> void:
	for i in n:
		var l := life * randf_range(0.6, 1.0)
		var v := Vector2.from_angle(randf() * TAU) * speed * randf_range(0.3, 1.0) + Vector2(0, -25)
		parts.append({"p": p, "v": v, "life": l, "max": l, "col": Color.WHITE, "ramp": [], "size": 0, "grav": 40.0, "drag": 1.6, "glow": false, "leaf": randi() % 4})
	_trim()


func _trim() -> void:
	if parts.size() > MAX_PARTS:
		parts = parts.slice(parts.size() - MAX_PARTS)


func play_strip(key: String, p: Vector2, anchor_bottom: bool = false, col: Color = Color.WHITE, rot: float = 0.0, flip: bool = false, delay: float = 0.0, life: float = -1.0) -> Dictionary:
	var a := {"key": key, "p": p, "t": -delay * 1000.0, "frame": 0, "done": false, "col": col, "rot": rot, "flip": flip, "bottom": anchor_bottom, "life": life}
	anims.append(a)
	return a


func spark(p: Vector2, col: Color, rot: float = 0.0) -> void:
	play_strip("hit_spark", p, false, col, rot)


func explosion(p: Vector2, big: bool = true) -> void:
	play_strip("explosion", p + Vector2(0, -8))
	embers(p, 18 if big else 8, 70.0, 6.0, 1.0)
	burst(p, Color("3c3238"), 10, 50.0, 0.9, 2, -10.0, 15.0)
	ring(p, 46.0 if big else 26.0, Color("ffbe3c"), 0.35, 2.0)


func dust(p: Vector2, flip: bool = false) -> void:
	play_strip("dust_puff", p + Vector2(0, 2), true, Color(0.9, 0.85, 0.8, 0.9), 0.0, flip)


func root_spike(p: Vector2, delay: float = 0.0, life: float = 2.6) -> void:
	play_strip("root_spike", p, true, Color.WHITE, 0.0, randf() < 0.5, delay, life)


func ring(p: Vector2, radius: float, col: Color, life: float, width: float = 2.0, r0: float = 4.0, flat: float = 0.62) -> void:
	rings.append({"p": p, "r0": r0, "r1": radius, "t": 0.0, "life": life, "col": col, "w": width, "flat": flat})


func number(p: Vector2, s: String, col: Color, big: bool = false) -> void:
	texts.append({"p": p + Vector2(randf_range(-6, 6), 0), "s": s, "col": col, "t": 0.0, "life": 0.8 if not big else 1.0, "big": big})


func label(p: Vector2, s: String, col: Color) -> void:
	texts.append({"p": p, "s": s, "col": col, "t": 0.0, "life": 1.3, "big": true, "label": true})


func ghost(sprite: Sprite2D, col: Color, life: float = 0.28) -> void:
	if sprite.texture == null:
		return
	var w := float(sprite.texture.get_width()) / float(sprite.hframes)
	var region := Rect2(w * sprite.frame, 0, w, sprite.texture.get_height())
	ghosts.append({"tex": sprite.texture, "region": region, "p": sprite.global_position + sprite.offset, "flip": sprite.flip_h, "col": col, "t": 0.0, "life": life})


func claw(p: Vector2, dir: Vector2) -> void:
	slashes.append({"p": p, "dir": dir.normalized(), "t": 0.0, "life": 0.3})


# ------------------------------------------------------------------ update
func tick(delta: float) -> void:
	t += delta
	var keep: Array = []
	for q in parts:
		q["life"] -= delta
		if q["life"] <= 0.0:
			continue
		var v: Vector2 = q["v"]
		v *= maxf(0.0, 1.0 - float(q["drag"]) * delta)
		v.y += float(q["grav"]) * delta
		q["v"] = v
		q["p"] += v * delta
		keep.append(q)
	parts = keep
	keep = []
	for a in anims:
		var s: Dictionary = strips[a["key"]]
		a["t"] += delta * 1000.0
		if a["life"] > 0.0:
			a["life"] -= delta
			if a["life"] <= 0.0:
				continue
		if a["t"] < 0.0:
			keep.append(a)
			continue
		var ms: Array = s["ms"]
		var acc := 0.0
		var f := 0
		var total := 0.0
		for m in ms:
			total += float(m)
		var tt := float(a["t"])
		if bool(s["loop"]) or float(a["life"]) > 0.0:
			tt = fmod(tt, total) if bool(s["loop"]) else minf(tt, total - 1.0)
		elif tt >= total:
			continue
		for i in ms.size():
			acc += float(ms[i])
			if tt < acc:
				f = i
				break
		a["frame"] = f
		keep.append(a)
	anims = keep
	keep = []
	for r in rings:
		r["t"] += delta
		if r["t"] < r["life"]:
			keep.append(r)
	rings = keep
	keep = []
	for q in texts:
		q["t"] += delta
		if q["t"] < q["life"]:
			keep.append(q)
	texts = keep
	keep = []
	for g in ghosts:
		g["t"] += delta
		if g["t"] < g["life"]:
			keep.append(g)
	ghosts = keep
	keep = []
	for s in slashes:
		s["t"] += delta
		if s["t"] < s["life"]:
			keep.append(s)
	slashes = keep
	queue_redraw()
	glow_layer.queue_redraw()


# ------------------------------------------------------------------ drawing
func _strip_region(key: String, frame: int) -> Rect2:
	var s: Dictionary = strips[key]
	return Rect2(int(s["w"]) * frame, 0, int(s["w"]), int(s["h"]))


func draw_strip(ci: CanvasItem, key: String, frame: int, p: Vector2, bottom: bool, col: Color, rot: float = 0.0, flip: bool = false) -> void:
	var s: Dictionary = strips[key]
	var w := int(s["w"])
	var h := int(s["h"])
	var dest := Rect2(-w / 2, -h / 2, w, h)
	if bottom:
		dest = Rect2(-w / 2, -h, w, h)
	if flip:
		dest = Rect2(dest.position.x + w, dest.position.y, -w, h)
	ci.draw_set_transform(p.floor(), rot, Vector2.ONE)
	ci.draw_texture_rect_region(s["tex"], dest, _strip_region(key, frame), col)
	ci.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


func _ramp_color(q: Dictionary) -> Color:
	var ramp: Array = q["ramp"]
	var age := 1.0 - float(q["life"]) / float(q["max"])
	if ramp.is_empty():
		var c: Color = q["col"]
		return Color(c.r, c.g, c.b, c.a * clampf(float(q["life"]) / float(q["max"]) * 1.6, 0.0, 1.0))
	var idx := mini(ramp.size() - 1, int(age * ramp.size()))
	return ramp[idx]


func _draw() -> void:
	# burning ground left by the charge
	for z in main.zones:
		if z["kind"] != "trail":
			continue
		var fa := clampf(float(z["life"]) / 0.6, 0.0, 1.0)
		var frame := int((t * 1000.0 + float(z["seed"]) * 90.0) / 90.0) % 4
		draw_strip(self, "ground_flame", frame, z["p"], true, Color(1, 1, 1, fa))
	# boss aura flames at the feet
	var boss: Boss = main.boss
	if boss != null and boss.visible and not boss.dead:
		var n: int = 6 if boss.phase2 else 3
		for i in n:
			var a := TAU * i / n + t * 0.9
			var fp := boss.position + Vector2(cos(a) * 16.0, 2.0 + sin(a) * 5.0)
			if sin(a) < 0.0:
				continue  # behind the boss: hidden by his coat
			var fr := int((t * 1000.0 + i * 130.0) / 90.0) % 4
			draw_strip(self, "ground_flame", fr, fp, true, Color(1, 1, 1, 0.95))
	# braziers keep burning on the mission steps
	for b in main.braziers:
		var bf := int((t * 1000.0 + float(b.x) * 7.0) / 90.0) % 4
		draw_strip(self, "ground_flame", bf, Vector2(b) + Vector2(0, -17), true, Color.WHITE)
	# afterimages
	for g in ghosts:
		var k := 1.0 - float(g["t"]) / float(g["life"])
		var c: Color = g["col"]
		var reg: Rect2 = g["region"]
		var dest := Rect2(g["p"], reg.size)
		if g["flip"]:
			dest = Rect2(dest.position.x + reg.size.x, dest.position.y, -reg.size.x, reg.size.y)
		draw_texture_rect_region(g["tex"], dest, reg, Color(c.r, c.g, c.b, c.a * k))
	# shockwave rings (flattened to the ground plane)
	for r in rings:
		var k := float(r["t"]) / float(r["life"])
		var e := 1.0 - pow(1.0 - k, 3.0)
		var rad := lerpf(float(r["r0"]), float(r["r1"]), e)
		var c: Color = r["col"]
		draw_set_transform(Vector2(r["p"]).floor(), 0.0, Vector2(1.0, float(r["flat"])))
		draw_arc(Vector2.ZERO, rad, 0.0, TAU, 40, Color(c.r, c.g, c.b, c.a * (1.0 - k)), float(r["w"]) * (1.0 - k * 0.5))
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	# effect strips
	for a in anims:
		if float(a["t"]) < 0.0:
			continue
		draw_strip(self, a["key"], int(a["frame"]), a["p"], bool(a["bottom"]), a["col"], float(a["rot"]), bool(a["flip"]))
	# projectiles
	for pr in main.projectiles:
		var v: Vector2 = pr["v"]
		var pp: Vector2 = pr["p"]
		if pr["kind"] == "thorn":
			draw_set_transform(pp.floor(), v.angle(), Vector2.ONE)
			draw_texture(thorn_tex, Vector2(-12, -3))
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		else:
			var fr := int((t * 1000.0 + float(pr["seed"]) * 50.0) / 70.0) % 4
			draw_strip(self, "fireball", fr, pp, false, Color.WHITE, v.angle(), false)
	# meteors falling onto their warning circles
	for z in main.zones:
		if z["kind"] == "warn" and float(z["t"]) < 0.4:
			var k := 1.0 - float(z["t"]) / 0.4
			var top: Vector2 = Vector2(z["p"]) + Vector2(-60.0 * (1.0 - k), -170.0 * (1.0 - k))
			var fr := int(t * 1000.0 / 70.0) % 4
			draw_strip(self, "fireball", fr, top, false, Color.WHITE, Vector2(60, 170).angle(), false)
	# particles
	for q in parts:
		var pos: Vector2 = Vector2(q["p"]).floor()
		if q.has("leaf"):
			var fr := (int(q["leaf"]) + int(t * 8.0)) % 4
			var la := clampf(float(q["life"]) / float(q["max"]) * 2.0, 0.0, 1.0)
			draw_strip(self, "leaf", fr, pos, false, Color(1, 1, 1, la))
			continue
		var c := _ramp_color(q)
		var sz := int(q["size"])
		draw_rect(Rect2(pos, Vector2(sz, sz)), c)
	# jaguar claw slashes
	for s in slashes:
		var k := float(s["t"]) / float(s["life"])
		var d: Vector2 = s["dir"]
		var n := d.orthogonal()
		var c := Color(1.0, 0.95, 0.7, 1.0 - k)
		for i in 3:
			var o: Vector2 = Vector2(s["p"]) + n * (i - 1) * 6.0
			var a := o - d * 18.0 * (1.0 - k * 0.3) + n * 3.0
			var b := o + d * 18.0
			draw_line(a.floor(), b.floor(), Color(0.95, 0.65, 0.15, (1.0 - k)), 3.0)
			draw_line(a.floor(), b.floor(), c, 1.0)
	# fireflies (ambient)
	for f in flies:
		var ph: float = f["ph"]
		var fp: Vector2 = Vector2(f["p"]) + Vector2(sin(t * float(f["sp"]) + ph) * 26.0, cos(t * float(f["sp"]) * 0.8 + ph * 1.3) * 16.0)
		var fa := 0.5 + 0.5 * sin(t * 2.2 + ph * 3.0)
		if fa > 0.35:
			draw_rect(Rect2(fp.floor(), Vector2.ONE), Color(0.85, 1.0, 0.45, fa))
	# damage numbers and labels
	for q in texts:
		var k := float(q["t"]) / float(q["life"])
		var c: Color = q["col"]
		var rise := 22.0 * (1.0 - pow(1.0 - k, 2.0))
		var p: Vector2 = Vector2(q["p"]) + Vector2(0, -rise)
		p.y = maxf(p.y, main.cam.position.y - 180.0 + 48.0)
		var a := 1.0 if k < 0.7 else 1.0 - (k - 0.7) / 0.3
		var sc := 1
		if bool(q["big"]):
			sc = 2 if float(q["t"]) > 0.06 or q.has("label") else 3
		PixelText.draw(self, String(q["s"]), p, Color(c.r, c.g, c.b, a), sc, 1)


func _draw_glows() -> void:
	var g := glow_layer
	for pr in main.projectiles:
		var pp: Vector2 = pr["p"]
		if pr["kind"] == "thorn":
			_glow(g, pp, 14.0, Color(0.4, 1.0, 0.3, 0.45))
		else:
			_glow(g, pp, 22.0, Color(1.0, 0.45, 0.12, 0.55))
	for z in main.zones:
		if z["kind"] == "trail":
			_glow(g, Vector2(z["p"]) + Vector2(0, -6), 26.0, Color(1.0, 0.4, 0.1, 0.35 * clampf(float(z["life"]) / 0.6, 0.0, 1.0)))
		elif z["kind"] == "warn" and float(z["t"]) < 0.4:
			var k := 1.0 - float(z["t"]) / 0.4
			_glow(g, Vector2(z["p"]) + Vector2(-60.0 * (1.0 - k), -170.0 * (1.0 - k)), 24.0, Color(1.0, 0.5, 0.15, 0.6))
	for a in anims:
		if a["key"] == "explosion" and float(a["t"]) >= 0.0:
			var k := clampf(float(a["t"]) / 530.0, 0.0, 1.0)
			_glow(g, a["p"], 70.0 * (1.0 - k * 0.4), Color(1.0, 0.55, 0.2, 0.7 * (1.0 - k)))
		elif a["key"] == "ground_flame":
			_glow(g, Vector2(a["p"]) + Vector2(0, -6), 28.0, Color(1.0, 0.45, 0.12, 0.4))
	for q in parts:
		if bool(q["glow"]) and int(q["size"]) >= 1 and randf() < 0.5:
			var c := _ramp_color(q)
			_glow(g, q["p"], 6.0, Color(c.r, c.g, c.b, 0.35))
	for f in flies:
		var ph: float = f["ph"]
		var fp: Vector2 = Vector2(f["p"]) + Vector2(sin(t * float(f["sp"]) + ph) * 26.0, cos(t * float(f["sp"]) * 0.8 + ph * 1.3) * 16.0)
		var fa := 0.5 + 0.5 * sin(t * 2.2 + ph * 3.0)
		if fa > 0.35:
			_glow(g, fp, 9.0, Color(0.6, 1.0, 0.3, 0.25 * fa))
	for b in main.braziers:
		_glow(g, Vector2(b) + Vector2(0, -24), 30.0, Color(1.0, 0.5, 0.15, 0.4))


func _glow(ci: CanvasItem, p: Vector2, radius: float, col: Color) -> void:
	var r := floorf(radius)
	ci.draw_texture_rect(glow_tex, Rect2(p.floor() - Vector2(r, r), Vector2(r * 2.0, r * 2.0)), false, col)
