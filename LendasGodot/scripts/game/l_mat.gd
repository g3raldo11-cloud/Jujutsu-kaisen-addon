class_name LMat
extends RefCounted
## Materiais criados em código (sem texturas importadas): a arte desta versão é procedural.

static var _cache := {}
static var _soft_dot: ImageTexture

static func lit(color: Color, rough: float = 0.75, metal: float = 0.0) -> StandardMaterial3D:
    var key := "lit_%s_%.2f_%.2f" % [color.to_html(), rough, metal]
    if _cache.has(key):
        return _cache[key]
    var m := StandardMaterial3D.new()
    m.albedo_color = color
    m.roughness = rough
    m.metallic = metal
    _cache[key] = m
    return m

## Pele com poros (mapa de normais), luz de contorno estilizada e cor por vértice.
static func skin(color: Color, rough: float = 0.55, uv_scale: float = 4.0) -> StandardMaterial3D:
    var key := "skin_%s_%.2f_%.1f" % [color.to_html(), rough, uv_scale]
    if _cache.has(key):
        return _cache[key]
    var m := StandardMaterial3D.new()
    m.albedo_color = color
    m.roughness = rough
    m.vertex_color_use_as_albedo = true
    m.normal_enabled = true
    m.normal_texture = LTex.skin_normal()
    m.normal_scale = 0.35
    m.uv1_scale = Vector3(uv_scale, uv_scale, 1.0)
    m.rim_enabled = true
    m.rim = 0.25
    m.rim_tint = 0.5
    _cache[key] = m
    return m

## Shader PBR próprio (cor base, normal, rugosidade, metálico e mapa de emissão).
## O StandardMaterial3D com textura de emissão sai branco no renderizador Compatibility;
## este shader amostra cada mapa explicitamente e funciona em qualquer renderizador.
const PBR_SHADER := """
shader_type spatial;
uniform vec4 albedo_color : source_color = vec4(1.0);
uniform sampler2D albedo_tex : source_color, hint_default_white, filter_linear_mipmap, repeat_enable;
uniform sampler2D normal_tex : hint_normal, filter_linear_mipmap, repeat_enable;
uniform sampler2D emission_tex : source_color, hint_default_black, filter_linear_mipmap, repeat_enable;
uniform vec2 uv_scale = vec2(1.0, 1.0);
uniform float roughness_v : hint_range(0.0, 1.0) = 0.5;
uniform float metallic_v : hint_range(0.0, 1.0) = 0.0;
uniform float normal_strength = 1.0;
uniform vec3 emission_tint : source_color = vec3(1.0);
uniform float emission_energy = 1.0;
uniform float rim_amount = 0.25;
void fragment() {
    vec2 uv = UV * uv_scale;
    ALBEDO = albedo_color.rgb * texture(albedo_tex, uv).rgb * COLOR.rgb;
    NORMAL_MAP = texture(normal_tex, uv).rgb;
    NORMAL_MAP_DEPTH = normal_strength;
    ROUGHNESS = roughness_v;
    METALLIC = metallic_v;
    EMISSION = texture(emission_tex, uv).rgb * emission_tint * emission_energy;
    RIM = rim_amount;
    RIM_TINT = 0.5;
}
"""
static var _pbr_shader: Shader

static func pbr(color: Color, albedo_tex: Texture2D, normal_tex: Texture2D, emission_tex: Texture2D, uv: Vector2,
        rough: float, metal: float, energy: float, normal_strength: float = 1.0) -> ShaderMaterial:
    if _pbr_shader == null:
        _pbr_shader = Shader.new()
        _pbr_shader.code = PBR_SHADER
    var m := ShaderMaterial.new()
    m.shader = _pbr_shader
    m.set_shader_parameter("albedo_color", color)
    if albedo_tex != null:
        m.set_shader_parameter("albedo_tex", albedo_tex)
    if normal_tex != null:
        m.set_shader_parameter("normal_tex", normal_tex)
    if emission_tex != null:
        m.set_shader_parameter("emission_tex", emission_tex)
    m.set_shader_parameter("uv_scale", uv)
    m.set_shader_parameter("roughness_v", rough)
    m.set_shader_parameter("metallic_v", metal)
    m.set_shader_parameter("emission_energy", energy)
    m.set_shader_parameter("normal_strength", normal_strength)
    return m

## Pele com veios de brasa luminosos (instância própria: a intensidade acompanha o Calor).
static func ember_skin(color: Color) -> ShaderMaterial:
    return pbr(color, null, LTex.skin_normal(), LTex.ember_veins(), Vector2(2.0, 2.0), 0.5, 0.0, 1.0, 0.35)

## Escamas com relevo e frestas incandescentes (instância própria).
static func scales_mat() -> ShaderMaterial:
    var t := LTex.scales()
    var m := pbr(Color.WHITE, t["albedo"], t["normal"], t["emission"], Vector2(3.0, 12.0), 0.35, 0.15, 1.5, 1.0)
    m.set_shader_parameter("rim_amount", 0.3)
    return m

static func wood(uv: Vector2 = Vector2(1.0, 4.0)) -> StandardMaterial3D:
    var key := "wood_%s" % uv
    if _cache.has(key):
        return _cache[key]
    var m := StandardMaterial3D.new()
    m.albedo_texture = LTex.wood_albedo()
    m.normal_enabled = true
    m.normal_texture = LTex.wood_normal()
    m.roughness = 0.85
    m.uv1_scale = Vector3(uv.x, uv.y, 1.0)
    _cache[key] = m
    return m

static func straw(uv: Vector2 = Vector2(2.0, 6.0)) -> StandardMaterial3D:
    var key := "straw_%s" % uv
    if _cache.has(key):
        return _cache[key]
    var m := StandardMaterial3D.new()
    m.albedo_texture = LTex.straw_albedo()
    m.normal_enabled = true
    m.normal_texture = LTex.straw_normal()
    m.vertex_color_use_as_albedo = true
    m.roughness = 0.95
    m.uv1_scale = Vector3(uv.x, uv.y, 1.0)
    _cache[key] = m
    return m

## Tecido trançado tingido.
static func cloth(color: Color, uv: float = 6.0) -> StandardMaterial3D:
    var key := "cloth_%s_%.1f" % [color.to_html(), uv]
    if _cache.has(key):
        return _cache[key]
    var t := LTex.weave()
    var m := StandardMaterial3D.new()
    m.albedo_color = color
    m.albedo_texture = t["albedo"]
    m.vertex_color_use_as_albedo = true
    m.normal_enabled = true
    m.normal_texture = t["normal"]
    m.normal_scale = 0.8
    m.roughness = 0.95
    m.uv1_scale = Vector3(uv, uv, 1.0)
    _cache[key] = m
    return m

## Fogo sólido (mechas do Curupira, barbatanas do Boitatá): cor por vértice sem sombreamento,
## acima de 1 para acender o brilho (bloom).
static func fire_vc(boost: float = 1.6) -> StandardMaterial3D:
    var key := "firevc_%.2f" % boost
    if _cache.has(key):
        return _cache[key]
    var m := StandardMaterial3D.new()
    m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
    m.vertex_color_use_as_albedo = true
    m.albedo_color = Color(boost, boost, boost)
    m.cull_mode = BaseMaterial3D.CULL_DISABLED
    _cache[key] = m
    return m

## Material emissivo próprio (instância nova, para animar a emissão).
static func emissive(base: Color, emission: Color, energy: float) -> StandardMaterial3D:
    var m := StandardMaterial3D.new()
    m.albedo_color = base
    m.roughness = 0.45
    m.emission_enabled = true
    m.emission = emission
    m.emission_energy_multiplier = energy
    return m

static func transparent(color: Color) -> StandardMaterial3D:
    var key := "tr_%s" % color.to_html()
    if _cache.has(key):
        return _cache[key]
    var m := StandardMaterial3D.new()
    m.albedo_color = color
    m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
    m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
    m.cull_mode = BaseMaterial3D.CULL_DISABLED
    _cache[key] = m
    return m

static func glow(color: Color) -> StandardMaterial3D:
    var key := "glow_%s" % color.to_html()
    if _cache.has(key):
        return _cache[key]
    var m := transparent(color).duplicate() as StandardMaterial3D
    m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
    m.no_depth_test = false
    _cache[key] = m
    return m

## Material de partícula (billboard, cor por vértice, ponto suave).
static func particle(additive: bool) -> StandardMaterial3D:
    var key := "particle_%s" % additive
    if _cache.has(key):
        return _cache[key]
    var m := StandardMaterial3D.new()
    m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
    if additive:
        m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
    m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
    m.vertex_color_use_as_albedo = true
    m.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
    m.albedo_texture = soft_dot()
    m.cull_mode = BaseMaterial3D.CULL_DISABLED
    _cache[key] = m
    return m

static func soft_dot() -> ImageTexture:
    if _soft_dot != null:
        return _soft_dot
    var size := 64
    var img := Image.create_empty(size, size, false, Image.FORMAT_RGBA8)
    for y in range(size):
        for x in range(size):
            var dx := (x + 0.5) / size * 2.0 - 1.0
            var dy := (y + 0.5) / size * 2.0 - 1.0
            var a := clampf(1.0 - sqrt(dx * dx + dy * dy), 0.0, 1.0)
            img.set_pixel(x, y, Color(1, 1, 1, a * a))
    _soft_dot = ImageTexture.create_from_image(img)
    return _soft_dot

## Peça geométrica sem colisão (a colisão é da simulação).
static func part(parent: Node3D, mesh: Mesh, pos: Vector3, mat: Material, scale_v: Vector3 = Vector3.ONE, rot_deg: Vector3 = Vector3.ZERO, part_name: String = "") -> MeshInstance3D:
    var mi := MeshInstance3D.new()
    mi.mesh = mesh
    mi.material_override = mat
    mi.position = pos
    mi.scale = scale_v
    mi.rotation_degrees = rot_deg
    if part_name != "":
        mi.name = part_name
    parent.add_child(mi)
    return mi

static func sphere(r: float = 0.5, seg: int = 16) -> SphereMesh:
    var m := SphereMesh.new()
    m.radius = r
    m.height = r * 2.0
    m.radial_segments = seg
    m.rings = maxi(6, seg / 2)
    return m

static func cylinder(r_top: float, r_bottom: float, h: float, seg: int = 14) -> CylinderMesh:
    var m := CylinderMesh.new()
    m.top_radius = r_top
    m.bottom_radius = r_bottom
    m.height = h
    m.radial_segments = seg
    m.rings = 1
    return m

static func capsule(r: float, h: float) -> CapsuleMesh:
    var m := CapsuleMesh.new()
    m.radius = r
    m.height = maxf(h, r * 2.0)
    m.radial_segments = 14
    m.rings = 6
    return m

static func box(size: Vector3) -> BoxMesh:
    var m := BoxMesh.new()
    m.size = size
    return m

## Cone com a base em y = 0 e a ponta em y = h.
static func cone(r: float, h: float) -> CylinderMesh:
    return cylinder(0.0, r, h, 16)

## Disco fino (áreas, anéis de status).
static func disc(parent: Node3D, r: float, mat: Material, y: float = 0.03) -> MeshInstance3D:
    var mi := part(parent, cylinder(r, r, 0.02, 40), Vector3(0, y, 0), mat)
    mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
    return mi
