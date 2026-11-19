class_name Main
extends Node2D
## MATA VIVA — Tiaraju vs. o Capitão do Mato.
## Builds the arena from the Pixelwright art, runs the fight and all of its "juice":
## hit-stop, trauma screen shake, flashes, slow motion, dynamic pixel lights and music.

enum S { TITLE, INTRO, FIGHT, PAUSE, WIN, LOSE }

const MAP := Vector2(704, 416)
const VIEW := Vector2(640, 360)
const ARENA := Rect2(56, 104, 592, 236)
const CAM_HOME := Vector2(352, 214)
const PLAYER_START := Vector2(200, 240)
const BOSS_START := Vector2(500, 214)
const PLAYER_NAME := "TIARAJU"
const BOSS_NAME := "CAPITÃO DO MATO"
const BOSS_TITLE := "Mestre das Chamas"
const MAX_LIGHTS := 48

var state := S.TITLE
var t := 0.0
var state_t := 0.0
var fight_time := 0.0
var hitstop := 0.0
var time_scale := 1.0
var trauma := 0.0
var kick := Vector2.ZERO
var cam_base := CAM_HOME
var flash_col := Color(1, 1, 1, 0)
var flash_amt := 0.0
var flash_decay := 4.0
var grade_amt := 0.0
var desat := 0.0

var cam: Camera2D
var ground: Ground
var entities: Node2D
var player: Player
var boss: Boss
var fx: FX
var hud: HUD
var audio: GameAudio
var post: ShaderMaterial
var braziers: Array = []

var projectiles: Array = []
var zones: Array = []
var decals: Array = []
var root_casts: Array = []
var bursts: Array = []
var events: Array = []
var banner := {}
var using_pad := false
var pad_aim := Vector2.RIGHT
# --demo autopilot and screenshot hooks (used for testing and as an attract mode)
var demo := false
var demo_t := 0.0
var shot_times: Array = []
var shot_dir := ""
var shot_n := 0
var quit_at := -1.0
var start_hp := -1.0
var start_player_hp := -1.0
var demo_die := false


func _ready() -> void:
	randomize()
	_parse_args()
	Input.mouse_mode = Input.MOUSE_MODE_HIDDEN
	_build_world()
	_reset_fight()
	state = S.TITLE
	if demo:
		using_pad = true
		after(1.0, _start_intro)


func _exit_tree() -> void:
	PixelText._tex = null


func _parse_args() -> void:
	for a in OS.get_cmdline_user_args():
		if a == "--demo":
			demo = true
		elif a.begins_with("--shots="):
			for v in a.substr(8).split(","):
				shot_times.append(float(v))
		elif a.begins_with("--shot-dir="):
			shot_dir = a.substr(11)
		elif a.begins_with("--quit-at="):
			quit_at = float(a.substr(10))
		elif a.begins_with("--boss-hp="):
			start_hp = float(a.substr(10))
		elif a == "--demo-die":
			demo_die = true
		elif a.begins_with("--player-hp="):
			start_player_hp = float(a.substr(12))
		elif a.begins_with("--seed="):
			seed(int(a.substr(7)))


func _capture() -> void:
	if not shot_times.is_empty() and t >= float(shot_times[0]):
		shot_times.pop_front()
		if shot_dir != "":
			var img := get_viewport().get_texture().get_image()
			img.save_png("%s/shot_%02d.png" % [shot_dir, shot_n])
			shot_n += 1
	if quit_at > 0.0 and t >= quit_at:
		get_tree().quit()


# ================================================================== world
func _build_world() -> void:
	var floor_spr := Sprite2D.new()
	floor_spr.texture = load("res://assets/sprites/arena_floor.png")
	floor_spr.centered = false
	floor_spr.z_index = -30
	add_child(floor_spr)

	# the jungle behind the mission walls, and the ruined walls themselves
	var back := Node2D.new()
	back.z_index = -25
	add_child(back)
	var canopy_tex: Texture2D = load("res://assets/sprites/canopy.png")
	for i in 9:
		var c := Sprite2D.new()
		c.texture = canopy_tex
		c.centered = false
		c.position = Vector2(-48 + i * 88, -34 + (i % 2) * 10)
		c.flip_h = i % 2 == 1
		c.modulate = Color(0.42, 0.5, 0.55)
		back.add_child(c)
	var walls := ["ruin_wall_a", "ruin_wall_b", "ruin_wall_a", "ruin_wall_b", "ruin_wall_a", "ruin_wall_b"]
	for i in walls.size():
		var w := Sprite2D.new()
		w.texture = load("res://assets/sprites/%s.png" % walls[i])
		w.centered = false
		w.position = Vector2(-32 + i * 128, 42)
		w.flip_h = i == 3 or i == 4
		back.add_child(w)

	ground = Ground.new()
	ground.main = self
	ground.z_index = -10
	add_child(ground)

	entities = Node2D.new()
	entities.y_sort_enabled = true
	add_child(entities)
	_prop("mission_cross", Vector2(352, 120))
	_prop("column", Vector2(160, 124))
	_prop("column", Vector2(560, 122))
	braziers = [Vector2(98, 142), Vector2(606, 140)]
	for b in braziers:
		_prop("brazier", b)
	# jungle closing in on the sides (y-sorted with the fighters)
	for p in [Vector2(-34, 238), Vector2(-22, 352), Vector2(674, 230), Vector2(690, 348)]:
		var c := Sprite2D.new()
		c.texture = canopy_tex
		c.offset = Vector2(-48, -58)
		c.centered = false
		c.position = p
		c.flip_h = p.x > 300.0
		c.modulate = Color(0.75, 0.82, 0.8)
		entities.add_child(c)

	player = Player.new()
	player.setup(self)
	entities.add_child(player)
	boss = Boss.new()
	boss.setup(self)
	entities.add_child(boss)

	cam = Camera2D.new()
	cam.position = CAM_HOME
	add_child(cam)
	cam.make_current()

	# lighting + grading pass over the world
	var post_layer := CanvasLayer.new()
	post_layer.layer = 1
	add_child(post_layer)
	var rect := ColorRect.new()
	rect.size = VIEW
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	post = ShaderMaterial.new()
	post.shader = load("res://shaders/post.gdshader")
	rect.material = post
	post_layer.add_child(rect)

	# emissive effects above the lighting
	var fx_layer := CanvasLayer.new()
	fx_layer.layer = 2
	fx_layer.follow_viewport_enabled = true
	add_child(fx_layer)
	fx = FX.new()
	fx_layer.add_child(fx)
	fx.setup(self)

	# dark foreground leaves framing the bottom and the top corners (Hades-style depth)
	var fg_layer := CanvasLayer.new()
	fg_layer.layer = 3
	fg_layer.follow_viewport_enabled = true
	add_child(fg_layer)
	var fern_tex: Texture2D = load("res://assets/sprites/ferns_fg.png")
	for i in 8:
		var f := Sprite2D.new()
		f.texture = fern_tex
		f.centered = false
		f.position = Vector2(-30 + i * 98, 384 + (i % 3) * 4)
		f.flip_h = i % 2 == 1
		f.modulate = Color(0.55, 0.62, 0.66)
		fg_layer.add_child(f)
	for p in [Vector2(-36, -6), Vector2(652, -8)]:
		var c := Sprite2D.new()
		c.texture = canopy_tex
		c.centered = false
		c.flip_v = true
		c.flip_h = p.x > 300.0
		c.position = p
		c.modulate = Color(0.3, 0.38, 0.4)
		fg_layer.add_child(c)

	var hud_layer := CanvasLayer.new()
	hud_layer.layer = 10
	add_child(hud_layer)
	hud = HUD.new()
	hud.main = self
	hud_layer.add_child(hud)

	audio = GameAudio.new()
	add_child(audio)


func _prop(name: String, base: Vector2) -> void:
	var s := Sprite2D.new()
	s.texture = load("res://assets/sprites/%s.png" % name)
	s.centered = false
	s.offset = Vector2(-s.texture.get_width() / 2, -s.texture.get_height())
	s.position = base
	entities.add_child(s)


func _reset_fight() -> void:
	player.reset(PLAYER_START)
	boss.reset(BOSS_START)
	projectiles.clear()
	zones.clear()
	decals.clear()
	root_casts.clear()
	bursts.clear()
	events.clear()
	fx.clear()
	banner = {}
	trauma = 0.0
	hitstop = 0.0
	time_scale = 1.0
	grade_amt = 0.0
	desat = 0.0
	fight_time = 0.0
	audio.set_fury(false)


func _start_intro() -> void:
	_reset_fight()
	state = S.INTRO
	state_t = 0.0
	audio.play("boss_intro", -2.0, 0.0)
	show_banner(BOSS_NAME, BOSS_TITLE, Color("ffbe3c"), 2.4)
	boss.anim.play("raise", true)
	fx.ring(boss.position, 70.0, Color(1.0, 0.55, 0.2), 0.6, 3.0)
	fx.embers(boss.position + Vector2(0, -20), 30, 120.0, 8.0, 0.9)
	add_trauma(0.35, Vector2.ZERO)


func _start_fight() -> void:
	state = S.FIGHT
	state_t = 0.0
	boss.st = "intro"
	boss.timer = 0.4
	boss.total = 0.4
	if start_player_hp > 0.0:
		player.hp = start_player_hp
		player.hp_disp = start_player_hp
	if start_hp > 0.0:
		boss.hp = start_hp
		boss.hp_disp = start_hp
		if start_hp <= boss.hp_max * 0.5:
			_phase_two()


func is_fighting() -> bool:
	return state == S.FIGHT


# ================================================================== input
func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion:
		using_pad = false
	var k := event as InputEventKey
	if k != null and k.pressed and not k.echo:
		using_pad = false
		match k.keycode:
			KEY_F11:
				var full := DisplayServer.window_get_mode() == DisplayServer.WINDOW_MODE_FULLSCREEN
				DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED if full else DisplayServer.WINDOW_MODE_FULLSCREEN)
			KEY_M:
				audio.toggle_music()
			KEY_ESCAPE, KEY_P:
				_toggle_pause()
			KEY_ENTER, KEY_KP_ENTER:
				_confirm()
			KEY_R:
				if state == S.WIN or state == S.LOSE:
					_confirm()
			KEY_1:
				_cast(0)
			KEY_2:
				_cast(1)
			KEY_3:
				_cast(2)
			KEY_4:
				_cast(3)
			KEY_5:
				_cast(4)
			KEY_SPACE, KEY_SHIFT:
				if state == S.FIGHT:
					player.dash()
				elif state == S.TITLE:
					_confirm()
	var mb := event as InputEventMouseButton
	if mb != null and mb.pressed:
		if mb.button_index == MOUSE_BUTTON_LEFT and (state == S.TITLE or ((state == S.WIN or state == S.LOSE) and state_t > 3.0)):
			_confirm()
		elif mb.button_index == MOUSE_BUTTON_RIGHT:
			_cast(2)
	var jb := event as InputEventJoypadButton
	if jb != null and jb.pressed:
		using_pad = true
		match jb.button_index:
			JOY_BUTTON_A:
				if state == S.FIGHT:
					player.dash()
				else:
					_confirm()
			JOY_BUTTON_B:
				_cast(2)
			JOY_BUTTON_X:
				_cast(1)
			JOY_BUTTON_Y:
				_cast(3)
			JOY_BUTTON_LEFT_SHOULDER:
				_cast(4)
			JOY_BUTTON_START:
				if state == S.FIGHT or state == S.PAUSE:
					_toggle_pause()
				else:
					_confirm()


func _confirm() -> void:
	match state:
		S.TITLE, S.WIN, S.LOSE:
			if state_t > 0.4:
				audio.play("ui", -6.0, 0.0)
				_start_intro()
		S.PAUSE:
			_toggle_pause()


func _toggle_pause() -> void:
	if state == S.FIGHT:
		state = S.PAUSE
		audio.play("ui", -8.0, 0.0)
	elif state == S.PAUSE:
		state = S.FIGHT
		audio.play("ui", -8.0, 0.0, 0.8)


func _cast(i: int) -> void:
	if state == S.FIGHT:
		player.cast(i)


func move_vector() -> Vector2:
	if demo and state == S.FIGHT:
		return _demo_move()
	var d := Vector2.ZERO
	if Input.is_physical_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
		d.x -= 1.0
	if Input.is_physical_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
		d.x += 1.0
	if Input.is_physical_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP):
		d.y -= 1.0
	if Input.is_physical_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN):
		d.y += 1.0
	var joy := Vector2(Input.get_joy_axis(0, JOY_AXIS_LEFT_X), Input.get_joy_axis(0, JOY_AXIS_LEFT_Y))
	if joy.length() > 0.25:
		d += joy
		using_pad = true
	return d.limit_length(1.0)


func aim_vector(from: Vector2) -> Vector2:
	var joy := Vector2(Input.get_joy_axis(0, JOY_AXIS_RIGHT_X), Input.get_joy_axis(0, JOY_AXIS_RIGHT_Y))
	if joy.length() > 0.35:
		using_pad = true
		pad_aim = joy.normalized()
		return pad_aim * 100.0
	if using_pad:
		if not boss.dead:
			return (boss.position + Vector2(0, -24)) - from
		return pad_aim * 100.0
	return get_global_mouse_position() - from


func fire_held() -> bool:
	if demo:
		return state == S.FIGHT
	return Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT) or Input.is_physical_key_pressed(KEY_1) \
		or Input.is_physical_key_pressed(KEY_J) or Input.get_joy_axis(0, JOY_AXIS_TRIGGER_RIGHT) > 0.4 \
		or Input.is_joy_button_pressed(0, JOY_BUTTON_RIGHT_SHOULDER)


func roots_target(from: Vector2) -> Vector2:
	var target := get_global_mouse_position()
	if using_pad:
		target = boss.position if boss.position.distance_to(from) < Player.ROOT_RANGE else from + player.aim * 140.0
	var off := target - from
	if off.length() > Player.ROOT_RANGE:
		target = from + off.normalized() * Player.ROOT_RANGE
	return clamp_arena(target, 14.0)


func clamp_arena(p: Vector2, margin: float = 0.0) -> Vector2:
	return Vector2(clampf(p.x, ARENA.position.x + margin, ARENA.end.x - margin), clampf(p.y, ARENA.position.y + margin, ARENA.end.y - margin))


# ================================================================== loop
func _process(delta: float) -> void:
	t += delta
	state_t += delta
	_capture()
	_run_events()
	if demo and state == S.FIGHT:
		_demo_powers(delta)
	if demo and (state == S.WIN or state == S.LOSE) and state_t > 6.0:
		_start_intro()
	var dt := delta * time_scale
	if hitstop > 0.0:
		hitstop -= delta
		dt = 0.0
	if state == S.PAUSE:
		dt = 0.0

	match state:
		S.TITLE:
			player.tick(dt, false)
			boss.tick(dt, false)
		S.INTRO:
			player.tick(dt, false)
			boss.tick(dt, false)
			if randf() < 0.5:
				fx.embers(boss.position + Vector2(randf_range(-22, 22), -randf_range(0, 40)), 1, 60.0, 4.0, 0.8)
			if state_t > 2.5:
				_start_fight()
		S.FIGHT:
			fight_time += dt
			player.tick(dt, true)
			boss.tick(dt, true)
			_update_projectiles(dt)
			_update_zones(dt)
			_update_roots(dt)
		S.WIN, S.LOSE:
			player.tick(dt, false)
			boss.tick(dt, false)
			_update_projectiles(dt)
			_update_zones(dt)
			_update_roots(dt)
	_update_decals(dt)
	_update_ambient(dt)
	if dt > 0.0:
		fx.tick(dt)
	if not banner.is_empty():
		banner["t"] += delta
		if float(banner["t"]) > float(banner["life"]):
			banner = {}
	_update_camera(delta)
	_update_post(delta)
	ground.queue_redraw()
	hud.queue_redraw()


func _run_events() -> void:
	var keep: Array = []
	for e in events:
		if t >= float(e["at"]):
			var c: Callable = e["fn"]
			c.call()
		else:
			keep.append(e)
	events = keep


func after(sec: float, fn: Callable) -> void:
	events.append({"at": t + sec, "fn": fn})


# ================================================================== combat
func shoot(pos: Vector2, dir: Vector2, speed: float, dmg: float, r: float, kind: String, owner_id: String) -> void:
	projectiles.append({"p": pos, "v": dir * speed, "dmg": dmg, "r": r, "kind": kind, "owner": owner_id, "life": 3.5, "seed": randi() % 97})


func _update_projectiles(dt: float) -> void:
	if dt <= 0.0:
		return
	var keep: Array = []
	var bounds := Rect2(-40, -40, MAP.x + 80, MAP.y + 80)
	for pr in projectiles:
		pr["p"] += pr["v"] * dt
		pr["life"] -= dt
		var pos: Vector2 = pr["p"]
		var r: float = pr["r"]
		var dead: bool = float(pr["life"]) <= 0.0 or not bounds.has_point(pos)
		if pr["kind"] == "fire":
			if randf() < 0.55:
				fx.embers(pos, 1, 10.0, 2.0, 0.35)
		elif randf() < 0.35:
			fx.burst(pos, Color(0.55, 1.0, 0.4, 0.8), 1, 6.0, 0.25)
		if not dead:
			if pr["owner"] == "b":
				if not player.dead and pos.distance_to(player.position + Vector2(0, -16)) < r + Player.RADIUS:
					if player.take_damage(float(pr["dmg"])):
						player.burn = maxf(player.burn, 2.5)
						dead = true
						fx.explosion(pos, false)
						audio.play("explode", -8.0)
			else:
				if not boss.dead and boss.visible and pos.distance_to(boss.position + Vector2(0, -24)) < Boss.RADIUS + r + 3.0:
					var v: Vector2 = pr["v"]
					damage_boss(float(pr["dmg"]), "light", v.normalized())
					dead = true
		if not dead:
			keep.append(pr)
	projectiles = keep


func _update_zones(dt: float) -> void:
	if dt <= 0.0:
		return
	var keep: Array = []
	for z in zones:
		var pos: Vector2 = z["p"]
		var r: float = z["r"]
		if z["kind"] == "warn":
			z["t"] -= dt
			if float(z["t"]) <= 0.0:
				if not player.dead and player.position.distance_to(pos) < r + 4.0:
					if player.take_damage(18.0):
						player.burn = 3.0
				fx.explosion(pos)
				decals.append({"p": pos, "r": 22.0, "life": 12.0, "max": 12.0, "seed": randf() * 10.0})
				bursts.append({"p": pos + Vector2(0, -8), "r": 100.0, "i": 0.85, "col": Color(1.0, 0.5, 0.22), "life": 0.35, "max": 0.35})
				add_trauma(0.22, Vector2.ZERO)
				audio.play("explode", -5.0)
				continue
		else:
			z["life"] -= dt
			if float(z["life"]) <= 0.0:
				continue
			if not player.dead and not player.is_invulnerable() and player.position.distance_to(pos) < r + 4.0:
				player.burn = maxf(player.burn, 1.6)
		keep.append(z)
	zones = keep


func cast_roots(target: Vector2) -> void:
	root_casts.append({"p": target, "r": 55.0, "t": 0.0, "struck": false})
	fx.ring(target, 55.0, Color(0.55, 1.0, 0.35), 0.45, 1.0, 55.0, 0.55)
	fx.magic(target, 10, 30.0, 0.5)


func _update_roots(dt: float) -> void:
	var keep: Array = []
	for rc in root_casts:
		rc["t"] += dt
		var p: Vector2 = rc["p"]
		var r: float = rc["r"]
		if not rc["struck"] and float(rc["t"]) >= 0.45:
			rc["struck"] = true
			for i in 10:
				var a := TAU * float(i) / 10.0 + randf_range(-0.15, 0.15)
				fx.root_spike(p + Vector2(cos(a) * r * 0.8, sin(a) * r * 0.45), randf_range(0.0, 0.12), 2.6)
			for i in 3:
				fx.root_spike(p + Vector2(randf_range(-12, 12), randf_range(-6, 6)), 0.05, 2.6)
			fx.burst(p, Color(0.45, 0.3, 0.18), 22, 90.0, 0.6, 2, 120.0, 40.0)
			fx.leaves(p, 8, 70.0)
			add_trauma(0.25, Vector2.ZERO)
			audio.play("roots")
			bursts.append({"p": p, "r": 90.0, "i": 0.7, "col": Color(0.4, 1.0, 0.35), "life": 0.6, "max": 0.6})
			if not boss.dead and boss.position.distance_to(p) < r + Boss.RADIUS:
				boss.root = 3.0
				damage_boss(18.0, "heavy", (boss.position - p).normalized())
				fx.label(boss.position + Vector2(0, -82), "PRESO!", Color("c99a4a"))
		if float(rc["t"]) < 3.4:
			keep.append(rc)
	root_casts = keep


func forest_fury(pos: Vector2) -> void:
	var radius := 100.0
	var c := pos + Vector2(0, -12)
	fx.ring(pos, radius, Color(0.75, 1.0, 0.45), 0.55, 4.0)
	fx.ring(pos, radius * 0.7, Color(1.0, 1.0, 0.8), 0.4, 2.0)
	fx.magic(c, 40, 230.0, 0.7)
	fx.leaves(c, 26, 170.0)
	flash_screen(Color(0.8, 1.0, 0.65), 0.28)
	add_trauma(0.6, Vector2.ZERO)
	do_hitstop(0.08)
	audio.play("burst")
	bursts.append({"p": c, "r": 170.0, "i": 1.1, "col": Color(0.5, 1.0, 0.42), "life": 0.5, "max": 0.5})
	if not boss.dead and pos.distance_to(boss.position) < radius + Boss.RADIUS:
		var d := (boss.position - pos).normalized()
		damage_boss(36.0, "heavy", d)
		boss.knock = d * 320.0
	var keep: Array = []
	for pr in projectiles:
		var pp: Vector2 = pr["p"]
		if pr["owner"] == "b" and pp.distance_to(pos) < radius + 10.0:
			fx.magic(pp, 5, 60.0, 0.4)
		else:
			keep.append(pr)
	projectiles = keep
	for k in 12:
		shoot(c, Vector2.from_angle(TAU * float(k) / 12.0), 300.0, 5.0, 4.0, "thorn", "p")


func damage_boss(amount: float, kind: String = "light", dir: Vector2 = Vector2.ZERO) -> void:
	if state != S.FIGHT or boss.dead:
		return
	var rooted := boss.root > 0.0
	if rooted:
		amount *= 1.25
	boss.hp = maxf(0.0, boss.hp - amount)
	boss.flash = 1.0 if kind != "light" else 0.7
	var col := Color("f0c040") if rooted else Color("c4ec6a")
	fx.number(boss.position + Vector2(randf_range(-10, 10), -66), str(int(round(amount))), col, kind != "light")
	fx.spark(boss.position + Vector2(randf_range(-4, 4), -26) - dir * 6.0, Color(0.8, 1.0, 0.6), randf() * TAU)
	fx.magic(boss.position + Vector2(0, -26) - dir * 6.0, 4, 70.0, 0.3)
	if kind == "heavy":
		boss.hurt_t = 0.25
		add_trauma(0.3, dir)
	else:
		audio.play("hit", -7.0, 0.12)
		kick += dir * 0.6
	if not boss.phase2 and boss.hp <= boss.hp_max * 0.5 and boss.hp > 0.0:
		_phase_two()
	if boss.hp <= 0.0:
		_boss_dead()


func _phase_two() -> void:
	boss.enter_phase2()
	show_banner("FÚRIA DO FOGO", "O Capitão do Mato arde em cólera!", Color("ff7a1a"), 2.2)
	audio.play("roar", 0.0, 0.0)
	audio.set_fury(true)
	add_trauma(0.8, Vector2.ZERO)
	do_hitstop(0.3)
	flash_screen(Color(1.0, 0.55, 0.2), 0.45)
	fx.embers(boss.position + Vector2(0, -20), 40, 160.0, 10.0, 1.0)
	grade_amt = 0.0


func _boss_dead() -> void:
	state = S.WIN
	state_t = 0.0
	boss.dead = true
	boss.hp = 0.0
	time_scale = 0.3
	do_hitstop(0.35)
	flash_screen(Color.WHITE, 0.9)
	add_trauma(1.0, Vector2.ZERO)
	audio.play("explode", 0.0, 0.0, 0.8)
	audio.set_fury(false)
	for pr in projectiles:
		if pr["owner"] == "b":
			fx.magic(pr["p"], 3, 40.0, 0.5)
	projectiles = projectiles.filter(func(pr): return pr["owner"] != "b")
	zones.clear()
	for i in 6:
		after(0.25 + i * 0.22, _death_blast.bind(i))
	after(1.2, _normal_time)
	after(1.6, _victory)


func _death_blast(i: int) -> void:
	var p := boss.position + Vector2(randf_range(-22, 22), -randf_range(4, 50))
	fx.explosion(p, i % 2 == 0)
	bursts.append({"p": p, "r": 110.0, "i": 0.95, "col": Color(1.0, 0.55, 0.25), "life": 0.4, "max": 0.4})
	add_trauma(0.35, Vector2.ZERO)
	audio.play("explode", -4.0)


func _normal_time() -> void:
	time_scale = 1.0


func _victory() -> void:
	fx.leaves(boss.position + Vector2(0, -20), 40, 140.0, 1.6)
	fx.magic(boss.position + Vector2(0, -20), 40, 120.0, 1.2, 30.0)
	audio.play("win", -2.0, 0.0)
	show_banner("A FLORESTA VENCEU", "O fogo do Capitão do Mato se apagou.", Color("c4ec6a"), 4.0)


func on_player_dead() -> void:
	if state != S.FIGHT:
		return
	state = S.LOSE
	state_t = 0.0
	player.dead = true
	time_scale = 0.35
	do_hitstop(0.25)
	flash_screen(Color(1.0, 0.2, 0.1), 0.8)
	add_trauma(0.9, Vector2.ZERO)
	audio.set_fury(false)
	audio.play("lose", -2.0, 0.0)
	fx.embers(player.position + Vector2(0, -20), 40, 120.0, 10.0, 1.2)
	player.mat.set_shader_parameter("tint", Color(1.0, 0.5, 0.3))
	after(1.0, _normal_time)
	after(1.2, _defeat_banner)


func _defeat_banner() -> void:
	show_banner("O FOGO CONSUMIU A MATA", "Tente de novo: a floresta ainda respira.", Color("ff7a1a"), 4.0)


# ================================================================== juice
func add_trauma(amount: float, dir: Vector2) -> void:
	trauma = clampf(trauma + amount, 0.0, 1.0)
	kick += dir * 6.0 * amount


func do_hitstop(sec: float) -> void:
	hitstop = maxf(hitstop, sec)


func flash_screen(col: Color, amount: float) -> void:
	flash_col = col
	flash_amt = maxf(flash_amt, amount)


func show_banner(title: String, sub: String, col: Color, life: float = 2.4) -> void:
	banner = {"title": title, "sub": sub, "col": col, "t": 0.0, "life": life}


func _update_decals(dt: float) -> void:
	var keep: Array = []
	for d in decals:
		d["life"] -= dt
		if float(d["life"]) > 0.0:
			keep.append(d)
	decals = keep
	keep = []
	for b in bursts:
		b["life"] -= dt
		if float(b["life"]) > 0.0:
			keep.append(b)
	bursts = keep


func _update_ambient(dt: float) -> void:
	if dt <= 0.0:
		return
	for b in braziers:
		if randf() < 0.35:
			fx.embers(b + Vector2(randf_range(-4, 4), -22), 1, 16.0, 2.0, 0.9)
	if randf() < dt * 0.6:
		fx.leaves(Vector2(randf_range(40, 660), randf_range(40, 90)), 1, 20.0, 3.0)


func _update_camera(delta: float) -> void:
	var target := CAM_HOME
	if state == S.FIGHT or state == S.PAUSE or state == S.LOSE:
		target = CAM_HOME.lerp(player.position + Vector2(0, -16), 0.2) + player.aim * 6.0
	elif state == S.INTRO:
		target = CAM_HOME.lerp(boss.position + Vector2(0, -20), 0.35)
	elif state == S.WIN:
		target = CAM_HOME.lerp(boss.position + Vector2(0, -20), 0.3)
	cam_base = cam_base.lerp(target, 1.0 - exp(-4.0 * delta))
	var half := VIEW * 0.5
	cam_base.x = clampf(cam_base.x, half.x, MAP.x - half.x)
	cam_base.y = clampf(cam_base.y, half.y, MAP.y - half.y)
	trauma = maxf(0.0, trauma - delta * 1.5)
	var s := trauma * trauma
	var shake := Vector2(randf_range(-1.0, 1.0), randf_range(-1.0, 1.0)) * 9.0 * s
	kick = kick.lerp(Vector2.ZERO, 1.0 - exp(-12.0 * delta))
	cam.position = (cam_base + shake + kick).round()


func _screen(p: Vector2) -> Vector2:
	return p - cam.position + VIEW * 0.5


func _update_post(delta: float) -> void:
	var L: Array = []
	var flick := 0.85 + 0.15 * sin(t * 17.0) * sin(t * 5.3)
	if boss.visible and boss.death_t < 2.0:
		var bi := (0.85 if not boss.phase2 else 1.15) * flick
		L.append([boss.position + Vector2(0, -24), 150.0 if not boss.phase2 else 190.0, bi, Color(1.0, 0.52, 0.22)])
		L.append([boss.world_point(Boss.BLADE), 60.0, 0.55 * flick, Color(1.0, 0.62, 0.25)])
	if player.visible:
		var pi := 0.28 + (0.55 if player.heal_t > 0.0 else 0.0)
		L.append([player.position + Vector2(0, -16), 70.0, pi, Color(0.45, 1.0, 0.5)])
	for b in braziers:
		L.append([b + Vector2(0, -24), 110.0, 0.75 * (0.8 + 0.2 * sin(t * 13.0 + b.x)), Color(1.0, 0.6, 0.3)])
	for pr in projectiles:
		if pr["kind"] == "fire":
			L.append([pr["p"], 40.0, 0.45, Color(1.0, 0.5, 0.2)])
		else:
			L.append([pr["p"], 26.0, 0.4, Color(0.5, 1.0, 0.4)])
	for z in zones:
		if z["kind"] == "trail":
			L.append([z["p"], 40.0, 0.45 * clampf(float(z["life"]) / 0.6, 0.0, 1.0), Color(1.0, 0.45, 0.15)])
		else:
			var prog := clampf(1.0 - float(z["t"]) / float(z["max"]), 0.0, 1.0)
			L.append([z["p"], float(z["r"]) * 1.7, 0.2 + 0.6 * prog, Color(1.0, 0.25, 0.1)])
	for b in bursts:
		var k := float(b["life"]) / float(b["max"])
		L.append([b["p"], float(b["r"]), float(b["i"]) * k, b["col"]])
	for rc in root_casts:
		if rc["struck"]:
			L.append([rc["p"], 70.0, 0.35 * clampf((3.4 - float(rc["t"])) / 1.0, 0.0, 1.0), Color(0.4, 1.0, 0.35)])
	L.sort_custom(func(a, b): return float(a[1]) * float(a[2]) > float(b[1]) * float(b[2]))
	var pos_arr: Array = []
	var col_arr: Array = []
	var n := mini(L.size(), MAX_LIGHTS)
	for i in MAX_LIGHTS:
		if i < n:
			var e: Array = L[i]
			var sp := _screen(e[0])
			pos_arr.append(Vector4(sp.x, sp.y, float(e[1]), float(e[2])))
			var c: Color = e[3]
			col_arr.append(Vector4(c.r, c.g, c.b, 1.0))
		else:
			pos_arr.append(Vector4(0, 0, 1, 0))
			col_arr.append(Vector4(0, 0, 0, 0))
	post.set_shader_parameter("light_count", n)
	post.set_shader_parameter("light_pos", pos_arr)
	post.set_shader_parameter("light_col", col_arr)

	var amb := Vector3(0.6, 0.65, 0.8)
	if state == S.TITLE:
		amb = Vector3(0.5, 0.55, 0.7)
	if boss.phase2 and not boss.dead:
		amb = Vector3(0.68, 0.58, 0.62)
	post.set_shader_parameter("ambient", amb)
	flash_amt = maxf(0.0, flash_amt - delta * flash_decay)
	post.set_shader_parameter("flash", Vector4(flash_col.r, flash_col.g, flash_col.b, flash_amt))
	var g_target := 0.12 if (boss.phase2 and not boss.dead and state == S.FIGHT) else 0.0
	grade_amt = move_toward(grade_amt, g_target, delta * 0.5)
	post.set_shader_parameter("grade", Vector4(1.0, 0.35, 0.18, grade_amt))
	var d_target := 0.65 if state == S.LOSE else 0.0
	desat = move_toward(desat, d_target, delta * 0.8)
	post.set_shader_parameter("desaturate", desat)


# ================================================================== demo autopilot
func _demo_move() -> Vector2:
	if demo_die:
		return (boss.position - player.position).normalized()
	var to_b := boss.position - player.position
	var dist := to_b.length()
	var dir := to_b / maxf(dist, 0.01)
	var tangent := dir.orthogonal() * (1.0 if sin(t * 0.35) > -0.2 else -1.0)
	var want := 115.0
	var radial := dir * clampf((dist - want) / 40.0, -1.0, 1.0)
	var m := tangent * 0.8 + radial
	# keep away from the walls of the arena
	var c := ARENA.get_center()
	if not ARENA.grow(-40).has_point(player.position):
		m += (c - player.position).normalized() * 0.8
	# step out of meteor circles
	for z in zones:
		if z["kind"] == "warn" and player.position.distance_to(z["p"]) < float(z["r"]) + 10.0:
			m += (player.position - Vector2(z["p"])).normalized() * 2.0
	return m.limit_length(1.0)


func _demo_powers(delta: float) -> void:
	if demo_die:
		return
	demo_t -= delta
	# dodge the closest incoming fireball with a dash
	for pr in projectiles:
		if pr["owner"] != "b":
			continue
		var pp: Vector2 = pr["p"]
		var v: Vector2 = pr["v"]
		var to_p := player.position + Vector2(0, -16) - pp
		if to_p.length() < 36.0 and v.dot(to_p) > 0.0 and player.dash_cd <= 0.0:
			player.dash()
			break
	if boss.st == "charge" and boss.step == 0 and boss.timer < 0.25 and player.dash_cd <= 0.0:
		player.dash()
	if demo_t > 0.0:
		return
	demo_t = 0.35
	var dist := player.position.distance_to(boss.position)
	if player.ready_power(3) and player.hp < 60.0:
		player.cast(3)
	elif player.ready_power(1) and dist < 200.0:
		player.cast(1)
	elif player.ready_power(4) and dist < 105.0:
		player.cast(4)
	elif player.ready_power(2) and dist < 150.0 and boss.root > 0.0:
		player.cast(2)
