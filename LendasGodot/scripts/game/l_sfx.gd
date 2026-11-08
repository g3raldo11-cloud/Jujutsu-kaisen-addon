class_name LSfx
extends Node3D
## Sons sintetizados em código (sem arquivos de terceiros) tocados em 3D, com limite de vozes.

const RATE := 22050
const MAX_VOICES := 16
var volume_db := -6.0
var _clips := {}
var _pool: Array[AudioStreamPlayer3D] = []
var _noise := 2463534242

func _rand() -> float:
    _noise = (_noise ^ (_noise << 13)) & 0xFFFFFFFF
    _noise = (_noise ^ (_noise >> 17)) & 0xFFFFFFFF
    _noise = (_noise ^ (_noise << 5)) & 0xFFFFFFFF
    return float(_noise & 0xFFFF) / 32768.0 - 1.0

func clip(kind: String) -> AudioStreamWAV:
    if _clips.has(kind):
        return _clips[kind]
    var dur := 0.18
    match kind:
        "vento", "fogo":
            dur = 0.7
        "suprema", "sinergia":
            dur = 1.2
        "troca", "ofuscar", "investida", "explosao":
            dur = 0.45
    var n := int(dur * RATE)
    var bytes := PackedByteArray()
    bytes.resize(n * 2)
    var lp := 0.0
    for i in range(n):
        var t := float(i) / RATE
        var k := t / dur
        var env := clampf(t * 60.0, 0.0, 1.0) * (1.0 - k) * (1.0 - k)
        var v := 0.0
        match kind:
            "golpe":
                v = sin(TAU * lerpf(180.0, 60.0, k) * t) * 0.8 + _rand() * 0.3 * (1.0 - k)
            "impacto":
                v = sin(TAU * lerpf(120.0, 45.0, k) * t) + _rand() * 0.2
            "erro":
                lp += (_rand() - lp) * 0.08
                v = lp * 2.5
            "vento":
                lp += (_rand() - lp) * lerpf(0.02, 0.12, sin(k * PI))
                v = lp * 3.0
                env = sin(k * PI)
            "fogo":
                lp += (_rand() - lp) * 0.3
                v = lp * (2.5 if _rand() > 0.92 else 0.6)
                env = sin(k * PI)
            "troca":
                v = sin(TAU * lerpf(500.0, 1300.0, k) * t) * 0.6
            "salto":
                v = sin(TAU * lerpf(220.0, 440.0, k) * t) * 0.5
            "esquiva":
                lp += (_rand() - lp) * 0.25
                v = lp * 2.0
            "ofuscar":
                v = (sin(TAU * 1760.0 * t) + sin(TAU * 2217.0 * t)) * 0.3
            "investida", "explosao":
                lp += (_rand() - lp) * 0.15
                v = lp * 2.0 + sin(TAU * lerpf(90.0, 50.0, k) * t) * 0.6
            "sinergia":
                # acorde com vibrato, lembrando a corda e a cabaça do berimbau
                v = (sin(TAU * 196.0 * t) + sin(TAU * 247.0 * t) * 0.7 + sin(TAU * 294.0 * t) * 0.5) * 0.4 * (1.0 + 0.3 * sin(TAU * 5.0 * t))
            _:
                v = sin(TAU * lerpf(80.0, 160.0, k) * t) * 0.7 + _rand() * 0.25 * env
        bytes.encode_s16(i * 2, int(clampf(v * env * 0.6, -1.0, 1.0) * 32767.0))
    var w := AudioStreamWAV.new()
    w.format = AudioStreamWAV.FORMAT_16_BITS
    w.mix_rate = RATE
    w.stereo = false
    w.data = bytes
    _clips[kind] = w
    return w

func play(kind: String, pos: Vector3, vol: float = 1.0, pitch: float = 1.0) -> void:
    var src: AudioStreamPlayer3D = null
    for a in _pool:
        if not a.playing:
            src = a
            break
    if src == null:
        if _pool.size() >= MAX_VOICES:
            return
        src = AudioStreamPlayer3D.new()
        src.unit_size = 6.0
        src.max_distance = 50.0
        src.attenuation_model = AudioStreamPlayer3D.ATTENUATION_INVERSE_DISTANCE
        add_child(src)
        _pool.append(src)
    src.global_position = pos
    src.stream = clip(kind)
    src.volume_db = volume_db + linear_to_db(maxf(vol, 0.001))
    src.pitch_scale = pitch
    src.play()
