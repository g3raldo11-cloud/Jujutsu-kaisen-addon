class_name LArenaBuilder
extends RefCounted
## Monta a Arena de Teste: chão de terra batida com grade de 2 m (para medir alcances), muretas
## de pedra, uma poça d'água e uma moita (terrenos reconhecidos pela simulação), tochas,
## silhuetas de mata ao redor e luz de fim de tarde.

static func build(root: Node3D) -> Node3D:
    var arena := Node3D.new()
    arena.name = "Arena"
    root.add_child(arena)
    _environment(arena)
    _ground(arena)
    _walls(arena)
    _terrain(arena)
    _torches(arena)
    _forest(arena)
    return arena

static func _environment(arena: Node3D) -> void:
    var we := WorldEnvironment.new()
    var env := Environment.new()
    var sky := Sky.new()
    var psm := ProceduralSkyMaterial.new()
    psm.sky_top_color = Color(0.16, 0.2, 0.36)
    psm.sky_horizon_color = Color(0.86, 0.55, 0.36)
    psm.ground_horizon_color = Color(0.45, 0.32, 0.24)
    psm.ground_bottom_color = Color(0.1, 0.08, 0.06)
    psm.sun_angle_max = 30.0
    sky.sky_material = psm
    env.background_mode = Environment.BG_SKY
    env.sky = sky
    env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
    env.ambient_light_energy = 0.7
    env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
    env.glow_enabled = true
    env.glow_blend_mode = Environment.GLOW_BLEND_MODE_SCREEN
    env.glow_intensity = 0.8
    env.glow_strength = 1.0
    env.glow_bloom = 0.0
    env.glow_hdr_threshold = 0.9
    env.fog_enabled = true
    env.fog_light_color = Color(0.62, 0.52, 0.46)
    env.fog_density = 0.006
    env.fog_sky_affect = 0.3
    we.environment = env
    arena.add_child(we)

    var sun := DirectionalLight3D.new()
    sun.light_color = Color(1.0, 0.85, 0.66)
    sun.light_energy = 1.15
    sun.rotation_degrees = Vector3(-38.0, -35.0, 0.0)
    sun.shadow_enabled = true
    sun.directional_shadow_max_distance = 70.0
    arena.add_child(sun)

static func _ground_texture() -> ImageTexture:
    var size := 512
    var img := Image.create_empty(size, size, false, Image.FORMAT_RGBA8)
    var rng := RandomNumberGenerator.new()
    rng.seed = 7
    var base := Color(0.47, 0.33, 0.22)
    for y in range(size):
        for x in range(size):
            var n := rng.randf_range(-0.05, 0.05)
            var c := Color(base.r + n, base.g + n * 0.8, base.b + n * 0.6)
            img.set_pixel(x, y, c)
    # Pedrinhas e marcas de pisada.
    for i in range(1400):
        var px := rng.randi_range(0, size - 1)
        var py := rng.randi_range(0, size - 1)
        var c := Color(0.36, 0.27, 0.19) if rng.randf() < 0.5 else Color(0.58, 0.45, 0.32)
        img.set_pixel(px, py, c)
    # Grade de 2 m (40 m / 20 células).
    var cell := float(size) / 20.0
    for i in range(21):
        var p := int(clampf(i * cell, 0.0, size - 1))
        for k in range(size):
            for w in range(2):
                var q := clampi(p + w, 0, size - 1)
                img.set_pixel(q, k, img.get_pixel(q, k).lerp(Color(1.0, 0.92, 0.75), 0.22))
                img.set_pixel(k, q, img.get_pixel(k, q).lerp(Color(1.0, 0.92, 0.75), 0.22))
    img.generate_mipmaps()
    return ImageTexture.create_from_image(img)

static func _ground(arena: Node3D) -> void:
    var outer := MeshInstance3D.new()
    var pm := PlaneMesh.new()
    pm.size = Vector2(160, 160)
    outer.mesh = pm
    outer.material_override = LMat.lit(Color(0.2, 0.16, 0.11), 1.0)
    outer.position = Vector3(0, -0.02, 0)
    arena.add_child(outer)

    var ground := MeshInstance3D.new()
    var gm := PlaneMesh.new()
    gm.size = Vector2(40, 40)
    ground.mesh = gm
    var mat := StandardMaterial3D.new()
    mat.albedo_texture = _ground_texture()
    mat.roughness = 0.95
    mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
    ground.material_override = mat
    ground.name = "Chão"
    arena.add_child(ground)

static func _walls(arena: Node3D) -> void:
    var stone := LMat.lit(Color(0.45, 0.43, 0.4), 0.85)
    var band := LMat.lit(Color(0.72, 0.3, 0.16), 0.8)  # faixa pintada com urucum
    var specs := [
        [Vector3(0, 0.5, 20.5), Vector3(42, 1, 1)],
        [Vector3(0, 0.5, -20.5), Vector3(42, 1, 1)],
        [Vector3(20.5, 0.5, 0), Vector3(1, 1, 40)],
        [Vector3(-20.5, 0.5, 0), Vector3(1, 1, 40)],
    ]
    for s in specs:
        LMat.part(arena, LMat.box(s[1]), s[0], stone)
        LMat.part(arena, LMat.box(Vector3(s[1].x + 0.02, 0.12, s[1].z + 0.02)), s[0] + Vector3(0, 0.3, 0), band)

static func _terrain(arena: Node3D) -> void:
    # Poça d'água (a simulação deixa quem não é aquático 20% mais lento aqui).
    var water := LMat.part(arena, LMat.cylinder(LSim.WATER_RADIUS, LSim.WATER_RADIUS, 0.04, 48), LMath.to_world(LSim.WATER_CENTER, 0.02), _water_mat())
    water.name = "Poça"
    water.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
    var rock := LMat.lit(Color(0.38, 0.36, 0.33), 0.9)
    var rng := RandomNumberGenerator.new()
    rng.seed = 11
    for i in range(14):
        var a := float(i) / 14.0 * TAU + rng.randf_range(-0.1, 0.1)
        var p := LSim.WATER_CENTER + Vector2(cos(a), sin(a)) * (LSim.WATER_RADIUS + 0.2)
        var r := rng.randf_range(0.2, 0.4)
        LMat.part(arena, LMat.sphere(r, 10), LMath.to_world(p, r * 0.3), rock, Vector3(1.0, 0.6, 1.0))
    # Moita de capim alto.
    var leaf := LMat.lit(Color(0.2, 0.42, 0.16), 0.9)
    var leaf2 := LMat.lit(Color(0.28, 0.5, 0.2), 0.9)
    for i in range(32):
        var ang := rng.randf() * TAU
        var rr := sqrt(rng.randf()) * LSim.BUSH_RADIUS * 0.9
        var p := LSim.BUSH_CENTER + Vector2(cos(ang), sin(ang)) * rr
        var h := rng.randf_range(0.7, 1.5)
        LMat.part(arena, LMat.cone(0.22, h), LMath.to_world(p), leaf if i % 2 == 0 else leaf2, Vector3.ONE,
            Vector3(rng.randf_range(-12, 12), 0, rng.randf_range(-12, 12)))

static func _water_mat() -> StandardMaterial3D:
    var m := StandardMaterial3D.new()
    m.albedo_color = Color(0.12, 0.38, 0.46, 0.82)
    m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
    m.roughness = 0.08
    m.metallic = 0.3
    return m

static func _torches(arena: Node3D) -> void:
    var wood := LMat.lit(Color(0.3, 0.2, 0.1), 0.9)
    for c in [Vector2(-19, -19), Vector2(19, -19), Vector2(-19, 19), Vector2(19, 19)]:
        var base := LMath.to_world(c)
        LMat.part(arena, LMat.cylinder(0.08, 0.12, 2.2), base + Vector3(0, 1.1, 0), wood)
        var top := Node3D.new()
        top.position = base + Vector3(0, 2.3, 0)
        arena.add_child(top)
        LFx.fire(top, 0.15, 40)
        var l := OmniLight3D.new()
        l.light_color = Color(1.0, 0.55, 0.2)
        l.light_energy = 1.4
        l.omni_range = 9.0
        top.add_child(l)

static func _forest(arena: Node3D) -> void:
    # Silhuetas de mata ao redor da arena (não colidem; só ambientação).
    var trunk := LMat.lit(Color(0.16, 0.11, 0.08), 1.0)
    var crowns := [LMat.lit(Color(0.09, 0.2, 0.12), 1.0), LMat.lit(Color(0.12, 0.26, 0.14), 1.0), LMat.lit(Color(0.07, 0.16, 0.1), 1.0)]
    var rng := RandomNumberGenerator.new()
    rng.seed = 3
    for i in range(46):
        var a := float(i) / 46.0 * TAU + rng.randf_range(-0.05, 0.05)
        var r := rng.randf_range(28.0, 44.0)
        var p := Vector3(cos(a) * r, 0, sin(a) * r)
        var h := rng.randf_range(7.0, 15.0)
        LMat.part(arena, LMat.cylinder(0.35, 0.6, h), p + Vector3(0, h * 0.5, 0), trunk)
        var crown_r := rng.randf_range(2.5, 5.0)
        LMat.part(arena, LMat.sphere(crown_r, 12), p + Vector3(0, h, 0), crowns[i % 3], Vector3(1.0, 0.7, 1.0))
        if i % 3 == 0:
            LMat.part(arena, LMat.sphere(crown_r * 0.7, 10), p + Vector3(crown_r * 0.6, h - 1.2, 0), crowns[(i + 1) % 3], Vector3(1.0, 0.7, 1.0))
