class_name Boss
extends Node2D
## The Capitão do Mato, master of fire. Drawn from the Pixelwright rig "capitao".
## Attacks: fireball volley, fire ring, flaming charge (leaves a burning trail),
## ember rain; at half health he roars into "Fúria do Fogo" and adds a fan volley.

const RADIUS := 17.0
const HAND := Vector2(-15, -21)
const BLADE := Vector2(21, -42)

var main
var body: Sprite2D
var anim: StripAnim
var mat: ShaderMaterial

var hp := 1400.0
var hp_max := 1400.0
var hp_disp := 1400.0
var st := "intro"
var timer := 1.6
var total := 1.6
var step := 0
var last := ""
var root := 0.0
var flash := 0.0
var knock := Vector2.ZERO
var phase2 := false
var face := -1.0
var cdir := Vector2.LEFT
var hit_done := false
var trail_t := 0.0
var strafe := 1.0
var amb := 0.0
var dead := false
var hurt_t := 0.0
var moving := false
var death_t := 0.0


func setup(m) -> void:
	main = m
	body = Sprite2D.new()
	body.centered = false
	body.offset = Vector2(-32, -61)
	mat = ShaderMaterial.new()
	mat.shader = load("res://shaders/sprite.gdshader")
	mat.set_shader_parameter("rim_color", Color(0.55, 1.0, 0.45))
	body.material = mat
	add_child(body)
	anim = StripAnim.new(body, "capitao")
	anim.play("idle")


func reset(pos: Vector2) -> void:
	position = pos
	hp = hp_max
	hp_disp = hp_max
	st = "intro"
	timer = 1.6
	total = 1.6
	step = 0
	last = ""
	root = 0.0
	flash = 0.0
	knock = Vector2.ZERO
	phase2 = false
	face = -1.0
	dead = false
	death_t = 0.0
	visible = true
	mat.set_shader_parameter("dissolve", 0.0)
	anim.play("idle", true)


func world_point(local: Vector2) -> Vector2:
	return position + Vector2(local.x * face, local.y)


# ------------------------------------------------------------------ per frame
func tick(delta: float, fighting: bool) -> void:
	flash = maxf(0.0, flash - delta * 7.0)
	root = maxf(0.0, root - delta)
	hurt_t = maxf(0.0, hurt_t - delta)
	hp_disp = lerpf(hp_disp, hp, 1.0 - exp(-3.0 * delta))
	if dead:
		death_t += delta
		mat.set_shader_parameter("dissolve", clampf((death_t - 0.9) / 1.4, 0.0, 1.0))
		if randf() < 0.6:
			main.fx.embers(position + Vector2(randf_range(-16, 16), -randf_range(4, 50)), 1, 30.0, 3.0, 1.0)
		anim.update(delta)
		return
	knock = knock.move_toward(Vector2.ZERO, 900.0 * delta)
	position += knock * delta
	position = main.clamp_arena(position, 14.0)

	# ambient fire from the blade and the hand
	amb -= delta
	if amb <= 0.0:
		amb = 0.06 if not phase2 else 0.035
		main.fx.embers(world_point(BLADE) + Vector2(randf_range(-3, 3), randf_range(-10, 8)), 1, 18.0, 2.0, 0.8)
		if randf() < 0.6:
			main.fx.embers(world_point(HAND), 1, 14.0, 2.0, 0.6)

	var player: Player = main.player
	var to_p: Vector2 = player.position - position
	var dist := to_p.length()
	var dirp := to_p / dist if dist > 0.01 else Vector2.LEFT
	if st == "charge" and step == 1:
		face = 1.0 if cdir.x > 0.0 else -1.0
	elif absf(dirp.x) > 0.1:
		face = 1.0 if dirp.x > 0.0 else -1.0
	body.flip_h = face < 0.0
	moving = false
	if fighting:
		_think(delta, dist, dirp)
	position = main.clamp_arena(position, 14.0)
	_animate(delta)


func _think(delta: float, dist: float, dirp: Vector2) -> void:
	timer -= delta
	var sp := 1.3 if phase2 else 1.0
	match st:
		"intro":
			if timer <= 0.0:
				_enter("move", 0.8)
		"move":
			if root <= 0.0:
				var want := 140.0
				if dist > want + 25.0:
					position += dirp * 62.0 * sp * delta
					moving = true
				elif dist < want - 35.0:
					position -= dirp * 50.0 * sp * delta
					moving = true
				else:
					position += dirp.orthogonal() * strafe * 40.0 * sp * delta
					moving = true
			if timer <= 0.0:
				_choose(dirp)
		"recover":
			if timer <= 0.0:
				_enter("move", randf_range(0.5, 1.0) * (0.6 if phase2 else 1.0))
		"fireball":
			if timer <= 0.0:
				var shots := 5 if phase2 else 3
				if step < shots:
					var spd := 215.0 if phase2 else 190.0
					var ang := dirp.angle() + randf_range(-0.06, 0.06)
					var origin := world_point(HAND) + Vector2(0, -6)
					main.shoot(origin, Vector2.from_angle(ang), spd, 12.0, 6.0, "fire", "b")
					main.fx.directed(origin, Vector2.from_angle(ang), FX.FIRE, 6, 90.0, 0.5, 0.3)
					main.audio.play("fireball", -4.0)
					step += 1
					timer = 0.28
				else:
					_end(0.8)
		"fan":
			if timer <= 0.0:
				if step < 2:
					var n := 7
					for i in n:
						var a := dirp.angle() + deg_to_rad(-36.0 + 72.0 * i / (n - 1)) + (0.06 if step == 1 else 0.0)
						main.shoot(world_point(HAND), Vector2.from_angle(a), 165.0, 11.0, 6.0, "fire", "b")
					main.fx.directed(world_point(HAND), dirp, FX.FIRE, 12, 110.0, 0.7, 0.35)
					main.audio.play("ring", -3.0)
					main.add_trauma(0.15, Vector2.ZERO)
					step += 1
					timer = 0.45
				else:
					_end(0.9)
		"ring":
			if timer <= 0.0:
				var n := 18 if phase2 else 14
				var offset := float(step) * PI / float(n)
				for i in n:
					var a := TAU * float(i) / float(n) + offset
					main.shoot(position + Vector2(0, -14), Vector2.from_angle(a), 118.0, 10.0, 5.0, "fire", "b")
				main.add_trauma(0.25, Vector2.ZERO)
				main.fx.ring(position, 60.0, Color(1.0, 0.5, 0.15), 0.4, 3.0)
				main.fx.embers(position + Vector2(0, -12), 18, 120.0, 6.0, 0.6)
				main.audio.play("ring")
				step += 1
				var rings := 3 if phase2 else 1
				if step < rings:
					timer = 0.55
				else:
					_end(1.0)
		"charge":
			if step == 0:
				if timer > 0.3:
					cdir = dirp
				if timer <= 0.0:
					step = 1
					timer = 0.55
					hit_done = false
					trail_t = 0.0
					main.fx.embers(position, 16, 100.0, 6.0, 0.5)
					main.fx.dust(position, cdir.x > 0.0)
					main.audio.play("charge")
					main.add_trauma(0.2, cdir)
			else:
				if root > 0.0:
					_end(0.8)
				else:
					position += cdir * 380.0 * delta
					moving = true
					trail_t -= delta
					if trail_t <= 0.0:
						trail_t = 0.06
						main.zones.append({"kind": "trail", "p": position + Vector2(randf_range(-4, 4), 4), "r": 12.0, "life": 3.0, "seed": randi() % 97})
						main.fx.ghost(body, Color(1.0, 0.45, 0.15, 0.55), 0.22)
					var player: Player = main.player
					if not hit_done and position.distance_to(player.position) < RADIUS + Player.RADIUS + 4.0:
						if player.take_damage(20.0):
							player.burn = 3.0
							player.vel = cdir * 260.0
						hit_done = true
					if timer <= 0.0:
						_end(1.1)
		"rain":
			if timer <= 0.0:
				var player: Player = main.player
				var n2 := 7 if phase2 else 5
				for i in n2:
					var pos: Vector2 = player.position + player.vel * 0.35
					if i > 0:
						pos = player.position + Vector2.from_angle(randf() * TAU) * randf_range(30.0, 120.0)
					pos = main.clamp_arena(pos, 20.0)
					main.zones.append({"kind": "warn", "p": pos, "r": 30.0, "t": 1.0 + i * 0.05, "max": 1.0 + i * 0.05, "seed": randi() % 97})
				main.audio.play("warn", -6.0)
				step += 1
				var waves := 3 if phase2 else 2
				if step < waves:
					timer = 0.8
				else:
					_end(1.0)
		"roar":
			if randf() < 0.8:
				main.fx.embers(position + Vector2(randf_range(-20, 20), -randf_range(0, 40)), 2, 90.0, 4.0, 0.7)
			main.add_trauma(0.06, Vector2.ZERO)
			if timer <= 0.0:
				for i in 12:
					main.shoot(position + Vector2(0, -14), Vector2.from_angle(TAU * float(i) / 12.0), 105.0, 10.0, 5.0, "fire", "b")
				main.add_trauma(0.6, Vector2.ZERO)
				main.fx.ring(position, 120.0, Color(1.0, 0.45, 0.1), 0.6, 4.0)
				main.fx.ring(position, 80.0, Color(1.0, 0.8, 0.3), 0.45, 2.0)
				_enter("move", 0.8)


func _enter(s: String, t: float) -> void:
	st = s
	timer = t
	total = t
	step = 0


func _choose(dirp: Vector2) -> void:
	var pool := ["fireball", "ring", "charge", "rain"]
	if phase2:
		pool.append("fan")
	var a: String = pool[randi() % pool.size()]
	if a == last:
		a = pool[(pool.find(a) + 1) % pool.size()]
	last = a
	strafe = -strafe
	var wind := {"fireball": 0.7, "ring": 0.95, "charge": 0.95, "rain": 0.5, "fan": 0.75}
	_enter(a, float(wind[a]) * (0.8 if phase2 else 1.0))
	if a == "charge":
		cdir = dirp
		main.audio.play("warn", -8.0, 0.0, 0.7)


func _end(rec: float) -> void:
	_enter("recover", rec * (0.7 if phase2 else 1.0))


func enter_phase2() -> void:
	phase2 = true
	_enter("roar", 1.3)
	knock = Vector2.ZERO


# ------------------------------------------------------------------ visuals
func _animate(delta: float) -> void:
	match st:
		"fireball", "fan":
			if anim.current != "cast":
				anim.play("cast")
			if step > 0:
				anim.set_frame(2)
		"ring", "rain", "roar":
			anim.play("raise")
		"charge":
			anim.play("charge")
			anim.set_frame(step)
		_:
			if hurt_t > 0.0:
				anim.play("hurt")
			elif moving:
				anim.play("walk")
			else:
				anim.play("idle")
	anim.update(delta)
	var player: Player = main.player
	var to_p: Vector2 = player.position - position
	var rdir := to_p.normalized() if to_p.length() > 0.1 else Vector2.LEFT
	if body.flip_h:
		rdir.x = -rdir.x
	mat.set_shader_parameter("rim_dir", rdir)
	mat.set_shader_parameter("rim_strength", 0.35 if player.heal_t <= 0.0 else 0.7)
	mat.set_shader_parameter("flash", flash)
	var tint := Color.WHITE
	if root > 0.0:
		tint = Color(0.85, 1.0, 0.75)
	if phase2:
		var k := 0.5 + 0.5 * sin(Time.get_ticks_msec() * 0.008)
		tint = tint * Color(1.0 + 0.12 * k, 0.92, 0.88)
	mat.set_shader_parameter("tint", tint)
