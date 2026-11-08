class_name LTex
extends RefCounted
## Texturas procedurais (nenhuma imagem externa): escamas com relevo e frestas incandescentes,
## poros de pele, veios de brasa, madeira, palha e tecido trançado. Tudo sem emendas (repete).

static var _cache := {}

static func _gradient(stops: Array) -> Gradient:
    var g := Gradient.new()
    var offs := PackedFloat32Array()
    var cols := PackedColorArray()
    for s in stops:
        offs.append(float(s[0]))
        cols.append(s[1])
    g.offsets = offs
    g.colors = cols
    return g

static func _noise_tex(key: String, freq: float, octaves: int, fractal: int, normal_map: bool, bump: float,
        ramp: Gradient = null, size: int = 256, noise_type: int = FastNoiseLite.TYPE_SIMPLEX) -> NoiseTexture2D:
    if _cache.has(key):
        return _cache[key]
    var n := FastNoiseLite.new()
    n.noise_type = noise_type
    n.frequency = freq
    n.fractal_octaves = octaves
    n.fractal_type = fractal
    n.seed = key.hash() & 0xFFFF
    var t := NoiseTexture2D.new()
    t.width = size
    t.height = size
    t.seamless = true
    t.noise = n
    t.as_normal_map = normal_map
    t.bump_strength = bump
    t.generate_mipmaps = true
    if ramp != null:
        t.color_ramp = ramp
    _cache[key] = t
    return t

## Poros e irregularidades de pele (mapa de normais).
static func skin_normal() -> NoiseTexture2D:
    return _noise_tex("skin_n", 0.09, 3, FastNoiseLite.FRACTAL_FBM, true, 3.0)

## Veios de brasa (emissão): linhas finas e ramificadas, como rachaduras de carvão em brasa.
## As linhas são as passagens por zero de dois ruídos (fica fino e contínuo), o resto é escuro.
static func ember_veins() -> ImageTexture:
    if _cache.has("ember"):
        return _cache["ember"]
    var size := 256
    var imgs: Array[Image] = []
    for k in range(2):
        var n := FastNoiseLite.new()
        n.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
        n.frequency = 0.011 if k == 0 else 0.024
        n.fractal_type = FastNoiseLite.FRACTAL_FBM
        n.fractal_octaves = 2
        n.seed = 99 + k * 17
        imgs.append(n.get_seamless_image(size, size, false, false, 0.1, true))
    var out := Image.create_empty(size, size, false, Image.FORMAT_RGB8)
    for y in range(size):
        for x in range(size):
            var a := absf(imgs[0].get_pixel(x, y).r - 0.5)
            var b := absf(imgs[1].get_pixel(x, y).r - 0.5)
            var line := maxf(1.0 - smoothstep(0.0, 0.03, a), (1.0 - smoothstep(0.0, 0.018, b)) * 0.55)
            var hot := pow(line, 3.0)
            out.set_pixel(x, y, Color(1.0, 0.36, 0.05) * line + Color(0.0, 0.4, 0.2) * hot)
    out.generate_mipmaps()
    var t := ImageTexture.create_from_image(out)
    _cache["ember"] = t
    return t

static func _alpha_image(w: int, h: int, f: Callable) -> ImageTexture:
    var img := Image.create_empty(w, h, false, Image.FORMAT_RGBA8)
    for y in range(h):
        for x in range(w):
            var c: Color = f.call((x + 0.5) / w, (y + 0.5) / h)
            img.set_pixel(x, y, c)
    img.generate_mipmaps()
    return ImageTexture.create_from_image(img)

## Labareda em forma de gota (base arredondada embaixo, ponta fina em cima), núcleo mais claro.
static func flame() -> ImageTexture:
    if _cache.has("flame"):
        return _cache["flame"]
    var t := _alpha_image(48, 96, func(u: float, v: float) -> Color:
        var up := 1.0 - v  # 0 embaixo, 1 em cima
        var w := 0.46 * pow(1.0 - up, 0.6) * pow(clampf(up * 5.0, 0.0, 1.0), 0.45) + 0.001
        var d := absf(u - 0.5) / w
        var a := clampf(1.0 - d, 0.0, 1.0)
        a = a * a * (3.0 - 2.0 * a) * smoothstep(0.0, 0.12, up)
        var core := clampf(1.0 - d * 1.8, 0.0, 1.0) * clampf(1.0 - up * 1.3, 0.0, 1.0)
        return Color(1.0, 1.0 - 0.15 * (1.0 - core), 1.0 - 0.35 * (1.0 - core), a))
    _cache["flame"] = t
    return t

## Fagulha: ponto quente com brilho em cruz.
static func spark() -> ImageTexture:
    if _cache.has("spark"):
        return _cache["spark"]
    var t := _alpha_image(32, 32, func(u: float, v: float) -> Color:
        var dx := u - 0.5
        var dy := v - 0.5
        var r := sqrt(dx * dx + dy * dy) * 2.0
        var core := pow(clampf(1.0 - r, 0.0, 1.0), 3.0)
        var cross := pow(clampf(1.0 - absf(dx) * 14.0, 0.0, 1.0), 2.0) * clampf(1.0 - absf(dy) * 2.2, 0.0, 1.0)
        cross = maxf(cross, pow(clampf(1.0 - absf(dy) * 14.0, 0.0, 1.0), 2.0) * clampf(1.0 - absf(dx) * 2.2, 0.0, 1.0))
        return Color(1, 1, 1, clampf(core + cross * 0.6, 0.0, 1.0)))
    _cache["spark"] = t
    return t

## Folha seca (redemoinho do Saci): elipse pontuda com nervura central.
static func leaf() -> ImageTexture:
    if _cache.has("leaf"):
        return _cache["leaf"]
    var t := _alpha_image(32, 48, func(u: float, v: float) -> Color:
        var w := 0.45 * sin(v * PI)
        var d := absf(u - 0.5) / maxf(w, 0.001)
        var a := 1.0 if d < 1.0 else 0.0
        var rib := 0.75 if absf(u - 0.5) < 0.03 else 1.0
        var vein := 0.88 if fposmod(v * 6.0 + absf(u - 0.5) * 4.0, 1.0) < 0.12 else 1.0
        return Color(rib * vein, rib * vein, rib * vein, a))
    _cache["leaf"] = t
    return t

## Fumaça: nuvem macia e irregular.
static func smoke() -> ImageTexture:
    if _cache.has("smoke"):
        return _cache["smoke"]
    var n := FastNoiseLite.new()
    n.frequency = 6.0
    n.fractal_octaves = 3
    n.seed = 5
    var t := _alpha_image(64, 64, func(u: float, v: float) -> Color:
        var dx := u - 0.5
        var dy := v - 0.5
        var r := sqrt(dx * dx + dy * dy) * 2.0
        var cloud := 0.6 + 0.4 * n.get_noise_2d(u, v)
        var a := clampf((1.0 - r) * cloud * 1.6, 0.0, 1.0)
        return Color(1, 1, 1, a * a))
    _cache["smoke"] = t
    return t

## Brilho redondo e suave para clarões.
static func glow_dot() -> ImageTexture:
    if _cache.has("glowdot"):
        return _cache["glowdot"]
    var t := _alpha_image(64, 64, func(u: float, v: float) -> Color:
        var dx := u - 0.5
        var dy := v - 0.5
        var r := sqrt(dx * dx + dy * dy) * 2.0
        return Color(1, 1, 1, pow(clampf(1.0 - r, 0.0, 1.0), 2.2)))
    _cache["glowdot"] = t
    return t

static func wood_albedo() -> NoiseTexture2D:
    var ramp := _gradient([[0.0, Color(0.22, 0.13, 0.07)], [0.45, Color(0.38, 0.24, 0.12)], [0.7, Color(0.47, 0.31, 0.16)], [1.0, Color(0.3, 0.18, 0.09)]])
    return _noise_tex("wood_a", 0.03, 4, FastNoiseLite.FRACTAL_FBM, false, 0.0, ramp, 256, FastNoiseLite.TYPE_PERLIN)

static func wood_normal() -> NoiseTexture2D:
    return _noise_tex("wood_n", 0.03, 4, FastNoiseLite.FRACTAL_FBM, true, 6.0, null, 256, FastNoiseLite.TYPE_PERLIN)

static func straw_albedo() -> NoiseTexture2D:
    var ramp := _gradient([[0.0, Color(0.55, 0.42, 0.18)], [0.5, Color(0.86, 0.72, 0.38)], [1.0, Color(0.95, 0.85, 0.52)]])
    return _noise_tex("straw_a", 0.06, 3, FastNoiseLite.FRACTAL_FBM, false, 0.0, ramp, 256, FastNoiseLite.TYPE_PERLIN)

static func straw_normal() -> NoiseTexture2D:
    return _noise_tex("straw_n", 0.06, 3, FastNoiseLite.FRACTAL_FBM, true, 8.0, null, 256, FastNoiseLite.TYPE_PERLIN)

## Escamas sobrepostas (como telhas) com relevo e frestas que brilham: o corpo do Boitatá.
## Retorna {"albedo", "normal", "emission"}.
static func scales() -> Dictionary:
    if _cache.has("scales"):
        return _cache["scales"]
    var size := 128
    var count := 6
    var radius := 0.74
    var h := PackedFloat32Array()
    h.resize(size * size)
    var tint := PackedFloat32Array()
    tint.resize(size * size)
    for y in range(size):
        var v := float(y) / size * count
        var row := int(floor(v))
        for x in range(size):
            var u := float(x) / size * count
            var best_row := -999
            var best_h := 0.0
            var best_t := 0.5
            for r in range(row - 1, row + 2):
                var off := 0.5 if posmod(r, 2) == 1 else 0.0
                var col := int(floor(u - off))
                for c in range(col - 1, col + 2):
                    var dx := wrapf(u - (c + off + 0.5) + count * 0.5, 0.0, float(count)) - count * 0.5
                    var dy := (wrapf(v - (r + 0.2) + count * 0.5, 0.0, float(count)) - count * 0.5) * 1.15
                    var d := sqrt(dx * dx + dy * dy)
                    if d < radius and r >= best_row:
                        var hh := 1.0 - pow(d / radius, 2.2)
                        if r > best_row or hh > best_h:
                            best_row = r
                            best_h = hh
                            best_t = fposmod(sin(float(posmod(c, count) * 12 + posmod(r, count) * 7)) * 43758.5453, 1.0)
            h[y * size + x] = best_h
            tint[y * size + x] = best_t
    var albedo := Image.create_empty(size, size, false, Image.FORMAT_RGB8)
    var emission := Image.create_empty(size, size, false, Image.FORMAT_RGB8)
    var normal := Image.create_empty(size, size, false, Image.FORMAT_RGB8)
    for y in range(size):
        for x in range(size):
            var i := y * size + x
            var hv := h[i]
            var t := tint[i]
            var base := Color(0.09, 0.025, 0.015).lerp(Color(0.38, 0.09, 0.03), hv) * (0.8 + 0.4 * t)
            albedo.set_pixel(x, y, Color(base.r, base.g, base.b))
            var glow := pow(clampf(1.0 - hv / 0.28, 0.0, 1.0), 2.0)
            emission.set_pixel(x, y, Color(1.0, 0.4, 0.06) * glow)
            var hl := h[y * size + posmod(x - 1, size)]
            var hr := h[y * size + posmod(x + 1, size)]
            var hu := h[posmod(y - 1, size) * size + x]
            var hd := h[posmod(y + 1, size) * size + x]
            var n := Vector3((hl - hr) * 3.0, (hu - hd) * 3.0, 1.0).normalized()
            normal.set_pixel(x, y, Color(n.x * 0.5 + 0.5, n.y * 0.5 + 0.5, n.z * 0.5 + 0.5))
    albedo.generate_mipmaps()
    emission.generate_mipmaps()
    normal.generate_mipmaps()
    var out := {
        "albedo": ImageTexture.create_from_image(albedo),
        "emission": ImageTexture.create_from_image(emission),
        "normal": ImageTexture.create_from_image(normal),
    }
    _cache["scales"] = out
    return out

## Tecido trançado (calção do Saci, tanga do Curupira, saco do boneco). {"albedo", "normal"}
static func weave() -> Dictionary:
    if _cache.has("weave"):
        return _cache["weave"]
    var size := 64
    var threads := 16
    var albedo := Image.create_empty(size, size, false, Image.FORMAT_RGB8)
    var hmap := PackedFloat32Array()
    hmap.resize(size * size)
    for y in range(size):
        for x in range(size):
            var cx := float(x) / size * threads
            var cy := float(y) / size * threads
            var over := (int(cx) + int(cy)) % 2 == 0
            var fx := fposmod(cx, 1.0)
            var fy := fposmod(cy, 1.0)
            var hv := sin(fy * PI) if over else sin(fx * PI)
            hmap[y * size + x] = hv
            var shade := 0.72 + 0.28 * hv
            albedo.set_pixel(x, y, Color(shade, shade, shade))
    var normal := Image.create_empty(size, size, false, Image.FORMAT_RGB8)
    for y in range(size):
        for x in range(size):
            var hl := hmap[y * size + posmod(x - 1, size)]
            var hr := hmap[y * size + posmod(x + 1, size)]
            var hu := hmap[posmod(y - 1, size) * size + x]
            var hd := hmap[posmod(y + 1, size) * size + x]
            var n := Vector3((hl - hr) * 1.5, (hu - hd) * 1.5, 1.0).normalized()
            normal.set_pixel(x, y, Color(n.x * 0.5 + 0.5, n.y * 0.5 + 0.5, n.z * 0.5 + 0.5))
    albedo.generate_mipmaps()
    normal.generate_mipmaps()
    var out := {"albedo": ImageTexture.create_from_image(albedo), "normal": ImageTexture.create_from_image(normal)}
    _cache["weave"] = out
    return out
