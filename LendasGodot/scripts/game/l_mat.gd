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
