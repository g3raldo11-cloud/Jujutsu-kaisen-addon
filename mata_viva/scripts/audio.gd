class_name GameAudio
extends Node
## Sound effects (pooled players with a little pitch variety), two music loops kept in
## sync so the "Fúria" layer can crossfade in on the beat, and a jungle ambience bed.

const SFX := ["shoot", "hit", "hit_heavy", "hurt", "dash", "roots", "heal", "burst", "fireball", "explode",
	"ring", "roar", "charge", "warn", "ui", "burn", "boss_intro", "win", "lose"]

var sfx := {}
var pool: Array[AudioStreamPlayer] = []
var next := 0
var music_calm: AudioStreamPlayer
var music_fury: AudioStreamPlayer
var ambience: AudioStreamPlayer
var music_on := true
var fury := false
var last_played := {}


func _ready() -> void:
	for n in SFX:
		sfx[n] = load("res://assets/audio/%s.wav" % n)
	for i in 16:
		var p := AudioStreamPlayer.new()
		add_child(p)
		pool.append(p)
	music_calm = _loop("res://assets/audio/music_mata.wav")
	music_fury = _loop("res://assets/audio/music_furia.wav")
	ambience = _loop("res://assets/audio/ambience.wav")
	ambience.volume_db = -12.0
	music_calm.volume_db = -9.0
	music_fury.volume_db = -60.0
	music_calm.play()
	music_fury.play()
	ambience.play()


func _loop(path: String) -> AudioStreamPlayer:
	var s: AudioStreamWAV = load(path)
	s.loop_mode = AudioStreamWAV.LOOP_FORWARD
	s.loop_begin = 0
	s.loop_end = int(s.get_length() * s.mix_rate)
	var p := AudioStreamPlayer.new()
	p.stream = s
	add_child(p)
	return p


func play(name: String, volume_db: float = 0.0, pitch_var: float = 0.07, pitch: float = 1.0) -> void:
	if not sfx.has(name):
		return
	# avoid stacking the same sound many times in one frame
	var now := Time.get_ticks_msec()
	if last_played.has(name) and now - int(last_played[name]) < 25:
		return
	last_played[name] = now
	var p := pool[next]
	next = (next + 1) % pool.size()
	p.stream = sfx[name]
	p.volume_db = volume_db
	p.pitch_scale = pitch * (1.0 + randf_range(-pitch_var, pitch_var))
	p.play()


func set_fury(on: bool) -> void:
	fury = on


func toggle_music() -> void:
	music_on = not music_on


func _process(delta: float) -> void:
	var k := 1.0 - exp(-2.0 * delta)
	var calm_target := -9.0
	var fury_target := -60.0
	if fury:
		calm_target = -32.0
		fury_target = -7.0
	if not music_on:
		calm_target = -80.0
		fury_target = -80.0
	music_calm.volume_db = lerpf(music_calm.volume_db, calm_target, k)
	music_fury.volume_db = lerpf(music_fury.volume_db, fury_target, k)
