class_name Player
extends Node2D
## Tiaraju, the Guarani warrior. Drawn from the Pixelwright rig "tiaraju" (SE view,
## mirrored for SW), with a bow that orbits toward the aim.

const SPEED := 138.0
const ACCEL := 1500.0
const DASH_SPEED := 440.0
const DASH_TIME := 0.17
const DASH_CD := 0.42
const POUNCE_SPEED := 480.0
const POUNCE_TIME := 0.26
const RADIUS := 8.0
const ROOT_RANGE := 230.0

var main
var body: Sprite2D
var bow: Sprite2D
var anim: StripAnim
var mat: ShaderMaterial

var vel := Vector2.ZERO
var aim := Vector2.RIGHT
var hp := 100.0
var hp_max := 100.0
var hp_disp := 100.0
var invuln := 0.0
var flash := 0.0
var dash_t := 0.0
var dash_cd := 0.0
var dash_dir := Vector2.RIGHT
var pounce_t := 0.0
var pounce_hit := false
var burn := 0.0
var burn_tick := 0.0
var heal_t := 0.0
var bow_draw := 0.0
var aim_hold := 0.0
var oneshot := ""
var ghost_t := 0.0
var step_t := 0.0
var dead := false
var death_t := 0.0
var damage_taken := 0.0

var powers := [
	{"name": "Espinhos", "full": "Flecha de Espinhos", "key": "1 / clique", "cd": 0.3, "t": 0.0, "col": Color("8cf05a")},
	{"name": "Raízes", "full": "Raízes Prisioneiras", "key": "2", "cd": 8.0, "t": 0.0, "col": Color("c99a4a")},
	{"name": "Onça", "full": "Salto da Onça", "key": "3 / dir.", "cd": 6.0, "t": 0.0, "col": Color("f0c040")},
	{"name": "Seiva", "full": "Seiva Curativa", "key": "4", "cd": 14.0, "t": 0.0, "col": Color("5fe39a")},
	{"name": "Fúria", "full": "Fúria da Mata", "key": "5", "cd": 16.0, "t": 0.0, "col": Color("c4ec6a")},
]


func setup(m) -> void:
	main = m
	body = Sprite2D.new()
	body.centered = false
	body.offset = Vector2(-24, -46)
	mat = ShaderMaterial.new()
	mat.shader = load("res://shaders/sprite.gdshader")
	body.material = mat
	add_child(body)
	anim = StripAnim.new(body, "tiaraju")
	anim.play("idle")
	bow = Sprite2D.new()
	bow.texture = load("res://assets/sprites/bow_bow.png")
	bow.hframes = 2
	add_child(bow)


func reset(pos: Vector2) -> void:
	position = pos
	vel = Vector2.ZERO
	aim = Vector2.RIGHT
	hp = hp_max
	hp_disp = hp_max
	invuln = 0.0
	flash = 0.0
	dash_t = 0.0
	dash_cd = 0.0
	pounce_t = 0.0
	burn = 0.0
	heal_t = 0.0
	oneshot = ""
	dead = false
	death_t = 0.0
	visible = true
	damage_taken = 0.0
	for pw in powers:
		pw["t"] = 0.0
	mat.set_shader_parameter("dissolve", 0.0)
	anim.play("idle", true)


func is_invulnerable() -> bool:
	return dash_t > 0.0 or pounce_t > 0.0


func ready_power(i: int) -> bool:
	return float(powers[i]["t"]) <= 0.0


# ------------------------------------------------------------------ per frame
func tick(delta: float, fighting: bool) -> void:
	invuln = maxf(0.0, invuln - delta)
	flash = maxf(0.0, flash - delta * 6.0)
	dash_cd = maxf(0.0, dash_cd - delta)
	bow_draw = maxf(0.0, bow_draw - delta)
	aim_hold = maxf(0.0, aim_hold - delta)
	hp_disp = lerpf(hp_disp, hp, 1.0 - exp(-3.0 * delta))
	for pw in powers:
		pw["t"] = maxf(0.0, float(pw["t"]) - delta)
	if dead:
		death_t += delta
		mat.set_shader_parameter("dissolve", clampf((death_t - 0.8) / 1.6, 0.0, 1.0))
		if death_t < 2.4 and randf() < 0.6:
			main.fx.embers(position + Vector2(randf_range(-8, 8), -randf_range(2, 34)), 1, 26.0, 2.0, 0.9)
		_update_visuals(delta)
		return

	var a: Vector2 = main.aim_vector(global_position + Vector2(0, -20))
	if a.length() > 2.0:
		aim = a.normalized()

	var move: Vector2 = main.move_vector() if fighting else Vector2.ZERO
	if pounce_t > 0.0:
		pounce_t -= delta
		position += dash_dir * POUNCE_SPEED * delta
		_trail(delta, Color(1.0, 0.78, 0.25, 0.75))
		var boss: Boss = main.boss
		if not pounce_hit and boss != null and not boss.dead and position.distance_to(boss.position) < Boss.RADIUS + RADIUS + 8.0:
			pounce_hit = true
			main.damage_boss(24.0, "heavy", dash_dir)
			boss.knock = dash_dir * 300.0
			main.fx.claw(boss.position + Vector2(0, -26), dash_dir)
			main.fx.spark(boss.position + Vector2(0, -24), Color(1.0, 0.85, 0.4), dash_dir.angle())
			main.do_hitstop(0.09)
			main.add_trauma(0.45, dash_dir)
			main.audio.play("hit_heavy")
		if pounce_t <= 0.0:
			vel = dash_dir * SPEED
			main.fx.dust(position, dash_dir.x < 0.0)
	elif dash_t > 0.0:
		dash_t -= delta
		position += dash_dir * DASH_SPEED * delta
		_trail(delta, Color(0.55, 1.0, 0.45, 0.6))
		if dash_t <= 0.0:
			vel = dash_dir * SPEED * 0.8
			invuln = maxf(invuln, 0.08)
	else:
		vel = vel.move_toward(move * SPEED, ACCEL * delta)
		position += vel * delta
		if vel.length() > 40.0:
			step_t -= delta
			if step_t <= 0.0:
				step_t = 0.27
				main.fx.burst(position + Vector2(randf_range(-3, 3), 0), Color(0.55, 0.42, 0.3, 0.8), 2, 14.0, 0.35, 1, 0.0, 8.0)
	position = main.clamp_arena(position, 4.0)
	var boss: Boss = main.boss
	if boss != null and not boss.dead and not is_invulnerable():
		var d: Vector2 = position - boss.position
		var min_d: float = Boss.RADIUS + RADIUS - 2.0
		if d.length() < min_d and d.length() > 0.01:
			position = boss.position + d.normalized() * min_d

	if fighting and main.fire_held():
		try_shoot()

	# burning: damage over time, the fire is visible on the body
	if burn > 0.0:
		burn -= delta
		burn_tick += delta
		if randf() < 0.7:
			main.fx.embers(position + Vector2(randf_range(-6, 6), -randf_range(4, 26)), 1, 14.0, 2.0, 0.6)
		if burn_tick >= 0.5:
			burn_tick = 0.0
			take_damage(3.0, true)
	if heal_t > 0.0:
		heal_t -= delta
		hp = minf(hp_max, hp + 15.0 * delta)
		if randf() < 0.35:
			main.fx.magic(position + Vector2(randf_range(-10, 10), -randf_range(0, 20)), 1, 10.0, 0.9, 30.0)
		if randf() < 0.08:
			main.fx.leaves(position + Vector2(randf_range(-10, 10), -30), 1, 20.0, 1.0)
	_update_visuals(delta)


func _trail(delta: float, col: Color) -> void:
	ghost_t -= delta
	if ghost_t <= 0.0:
		ghost_t = 0.025
		main.fx.ghost(body, col, 0.26)
		main.fx.burst(position + Vector2(0, -2), Color(0.6, 0.5, 0.38, 0.8), 1, 20.0, 0.3, 1)


func _update_visuals(delta: float) -> void:
	# facing: toward the aim while shooting, else toward movement
	var face_dir := aim.x
	if aim_hold <= 0.0 and vel.length() > 25.0 and dash_t <= 0.0 and pounce_t <= 0.0:
		face_dir = vel.x
	if dash_t > 0.0 or pounce_t > 0.0:
		face_dir = dash_dir.x
	if absf(face_dir) > 0.05:
		body.flip_h = face_dir < 0.0

	# animation state
	if dead:
		pass
	elif oneshot != "":
		if anim.finished:
			oneshot = ""
	if not dead and oneshot == "":
		if dash_t > 0.0 or pounce_t > 0.0:
			anim.play("dash")
		elif vel.length() > 30.0:
			anim.play("run")
		else:
			anim.play("idle")
	anim.update(delta)

	# bow orbits toward the aim, behind the body when aiming up
	bow.visible = not dead and pounce_t <= 0.0
	bow.position = Vector2(0, -21) + aim * 10.0
	bow.rotation = aim.angle()
	bow.frame = 1 if bow_draw > 0.0 else 0
	bow.z_index = -1 if aim.y < -0.45 else 1

	# shader: hit flash, fire rim light from the Capitão, burning tint
	var boss: Boss = main.boss
	var rim := 0.0
	var rdir := Vector2.RIGHT
	if boss != null and boss.visible and not boss.dead:
		var to_b: Vector2 = boss.position - position
		rim = clampf(1.0 - to_b.length() / 300.0, 0.3, 0.85)
		rdir = to_b.normalized()
	if body.flip_h:
		rdir.x = -rdir.x
	mat.set_shader_parameter("rim_dir", rdir)
	mat.set_shader_parameter("rim_strength", rim)
	mat.set_shader_parameter("flash", flash)
	var tint := Color.WHITE
	if burn > 0.0:
		var k := 0.5 + 0.5 * sin(Time.get_ticks_msec() * 0.02)
		tint = Color(1.0, 0.8 + 0.1 * k, 0.65 + 0.1 * k)
	elif heal_t > 0.0:
		tint = Color(0.85, 1.05, 0.85)
	mat.set_shader_parameter("tint", tint)
	# blink while invulnerable after a hit
	var blink := invuln > 0.0 and dash_t <= 0.0 and int(Time.get_ticks_msec() / 60.0) % 2 == 0
	body.modulate.a = 0.45 if blink else 1.0


# ------------------------------------------------------------------ actions
func try_shoot() -> bool:
	if float(powers[0]["t"]) > 0.0 or dash_t > 0.0 or pounce_t > 0.0 or dead:
		return false
	powers[0]["t"] = powers[0]["cd"]
	var origin := position + Vector2(0, -21) + aim * 16.0
	main.shoot(origin, aim, 380.0, 7.0, 4.0, "thorn", "p")
	main.fx.directed(origin, aim, FX.MAGIC, 4, 70.0, 0.6, 0.25)
	main.audio.play("shoot", -4.0, 0.12)
	bow_draw = 0.12
	aim_hold = 0.45
	if oneshot == "" or oneshot == "shoot":
		oneshot = "shoot"
		anim.play("shoot", true)
	vel -= aim * 25.0
	return true


func dash() -> void:
	if dash_cd > 0.0 or dash_t > 0.0 or pounce_t > 0.0 or dead:
		return
	var d: Vector2 = main.move_vector()
	dash_dir = d.normalized() if d.length() > 0.2 else aim
	dash_t = DASH_TIME
	dash_cd = DASH_CD
	oneshot = ""
	anim.play("dash", true)
	main.fx.dust(position, dash_dir.x > 0.0)
	main.fx.burst(position, Color(0.65, 0.55, 0.42, 0.9), 6, 40.0, 0.4, 1, 0.0, 10.0)
	main.audio.play("dash", -6.0)


func cast(i: int) -> void:
	if dead or not ready_power(i) or dash_t > 0.0 or pounce_t > 0.0:
		return
	match i:
		0:
			try_shoot()
			return
		1:
			var target: Vector2 = main.roots_target(position)
			main.cast_roots(target)
			_cast_pose()
		2:
			dash_dir = aim
			pounce_t = POUNCE_TIME
			pounce_hit = false
			oneshot = ""
			anim.play("dash", true)
			main.fx.dust(position, dash_dir.x > 0.0)
			main.fx.ring(position, 26.0, Color(1.0, 0.8, 0.3), 0.3, 2.0)
			main.audio.play("dash", -2.0, 0.05, 0.8)
		3:
			heal_t = 2.0
			if burn > 0.0:
				main.fx.burst(position + Vector2(0, -16), Color(0.7, 0.7, 0.7, 0.8), 10, 40.0, 0.6, 1, -20.0, 20.0)
			burn = 0.0
			main.fx.magic(position + Vector2(0, -14), 22, 80.0, 0.9, 20.0)
			main.fx.leaves(position + Vector2(0, -14), 8, 60.0)
			main.fx.ring(position, 34.0, Color(0.5, 1.0, 0.6), 0.5, 2.0)
			main.fx.label(position + Vector2(0, -60), "SEIVA", Color("8cf05a"))
			main.audio.play("heal")
			_cast_pose()
		4:
			main.forest_fury(position)
			_cast_pose()
	powers[i]["t"] = powers[i]["cd"]


func _cast_pose() -> void:
	oneshot = "cast"
	anim.play("cast", true)


## Returns true when the damage landed.
func take_damage(amount: float, burn_tick := false) -> bool:
	if dead or is_invulnerable():
		return false
	if not burn_tick and invuln > 0.0:
		return false
	hp -= amount
	damage_taken += amount
	main.fx.number(position + Vector2(0, -50), str(int(amount)), Color("ff6a3d"), not burn_tick and amount >= 15.0)
	if burn_tick:
		flash = 0.35
		main.audio.play("burn", -10.0)
	else:
		invuln = 0.7
		flash = 1.0
		oneshot = "hurt"
		anim.play("hurt", true)
		main.add_trauma(0.4, Vector2.ZERO)
		main.do_hitstop(0.07)
		main.flash_screen(Color(1.0, 0.25, 0.15), 0.18)
		main.fx.burst(position + Vector2(0, -20), Color("ec5a35"), 10, 90.0, 0.4, 1)
		main.audio.play("hurt")
	if hp <= 0.0:
		hp = 0.0
		main.on_player_dead()
	return true
