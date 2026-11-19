class_name StripAnim
extends RefCounted
## Plays the Pixelwright animation strips listed in SpriteDB on a Sprite2D.

var sprite: Sprite2D
var data := {}
var textures := {}
var current := ""
var frame := 0
var timer := 0.0
var finished := false
var hold := false


func _init(s: Sprite2D, char_name: String) -> void:
	sprite = s
	var entry: Dictionary = SpriteDB.ANIMS[char_name]
	for a in entry["anims"]:
		data[a] = entry["anims"][a]
		textures[a] = load(String(entry["anims"][a]["tex"]))


func play(anim: String, restart: bool = false) -> void:
	if anim == current and not restart:
		return
	current = anim
	frame = 0
	timer = 0.0
	finished = false
	hold = false
	var d: Dictionary = data[anim]
	sprite.texture = textures[anim]
	sprite.hframes = int(d["n"])
	sprite.vframes = 1
	sprite.frame = 0


## Freeze on a frame of the current animation (used for wind-ups).
func set_frame(i: int) -> void:
	frame = clampi(i, 0, int(data[current]["n"]) - 1)
	hold = true
	sprite.frame = frame


func update(delta: float) -> void:
	if current == "" or hold:
		return
	var d: Dictionary = data[current]
	var ms: Array = d["ms"]
	var n := int(d["n"])
	timer += delta * 1000.0
	while timer >= float(ms[frame]):
		timer -= float(ms[frame])
		if frame + 1 < n:
			frame += 1
		elif bool(d["loop"]):
			frame = 0
		else:
			finished = true
			timer = 0.0
			break
	sprite.frame = frame


func frame_region() -> Rect2:
	var w := float(sprite.texture.get_width()) / float(sprite.hframes)
	return Rect2(w * frame, 0, w, sprite.texture.get_height())
