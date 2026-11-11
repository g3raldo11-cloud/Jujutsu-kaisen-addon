class_name LUnitView
extends Node3D
## Base da apresentação de uma unidade: a simulação decide; a vista interpola, anima e mostra status.

var unit: LUnit
var model: Node3D
var anim_time := 0.0
var last_hit := -10.0
var _burn: CPUParticles3D
var _wind: CPUParticles3D
var _slow_ring: MeshInstance3D
var _blind: MeshInstance3D

func head_height() -> float:
    return 1.6

static func now() -> float:
    return Time.get_ticks_msec() / 1000.0

func bind(u: LUnit) -> void:
    unit = u
    name = "Unidade_%d" % u.id
    model = Node3D.new()
    model.name = "Modelo"
    add_child(model)
    _build()
    _try_imported_model()
    _build_status_fx()
    position = LMath.to_world(u.pos)
    rotation.y = LMath.facing_yaw(u.facing)

func _build() -> void:
    pass

## Identificador usado para procurar um modelo feito por artista (res://assets/models/<id>.glb).
func model_id() -> String:
    return ""

var imported_model: Node3D
var skel: Skeleton3D
## Ossos do modelo importado dirigidos pelas juntas procedurais (que continuam calculando a
## animação: passada, soco, inclinação...). Cada item: [osso, junta, base de repouso da junta,
## posição de repouso da junta, usa_posição].
var _rig: Array = []
var _rig_rest_global: Array[Basis] = []
var _rig_rest_local: Array[Transform3D] = []
var _rig_mapped := {}
var _skel_basis := Basis()

## Mapa osso do .glb -> junta procedural (sobrescrito por cada personagem).
func rig_map() -> Dictionary:
    return {}

## Ossos que também copiam a translação da junta (ex.: o quadril sobe e desce na passada).
func rig_translate() -> Array:
    return []

## Se existir um modelo importado (.glb exportado do Blender), ele substitui o modelo
## procedural: as malhas procedurais somem, mas as juntas continuam animando (agora os ossos do
## modelo) e os efeitos presos a elas continuam aparecendo.
func _try_imported_model() -> void:
    var id := model_id()
    if id == "":
        return
    var path := "res://assets/models/%s.glb" % id
    if not ResourceLoader.exists(path):
        return
    var scene := load(path) as PackedScene
    if scene == null:
        return
    _hide_procedural_meshes(model)
    imported_model = scene.instantiate() as Node3D
    if imported_model == null:
        return
    model.add_child(imported_model)
    skel = _find_skeleton(imported_model)
    if skel != null:
        _setup_rig()
    _setup_imported()

func _hide_procedural_meshes(n: Node) -> void:
    for c in n.get_children():
        if c == imported_model:
            continue
        if c is MeshInstance3D:
            (c as MeshInstance3D).visible = false
        _hide_procedural_meshes(c)

static func _find_skeleton(n: Node) -> Skeleton3D:
    if n is Skeleton3D:
        return n as Skeleton3D
    for c in n.get_children():
        var s := _find_skeleton(c)
        if s != null:
            return s
    return null

## Nó do modelo importado pelo nome (FX_*, malhas).
func imported_node(node_name: String) -> Node3D:
    if imported_model == null:
        return null
    return imported_model.find_child(node_name, true, false) as Node3D

func _rel_basis(n: Node3D) -> Basis:
    return (model.global_transform.basis.inverse() * n.global_transform.basis).orthonormalized()

func _setup_rig() -> void:
    var count := skel.get_bone_count()
    _rig_rest_global.resize(count)
    _rig_rest_local.resize(count)
    for i in range(count):
        _rig_rest_local[i] = skel.get_bone_rest(i)
        var p := skel.get_bone_parent(i)
        _rig_rest_global[i] = (_rig_rest_global[p] if p >= 0 else Basis()) * _rig_rest_local[i].basis
    # base do esqueleto em relação ao nó "Modelo" (para levar rotações do espaço do modelo ao do esqueleto)
    _skel_basis = (model.global_transform.basis.inverse() * skel.global_transform.basis).orthonormalized()
    var tr := rig_translate()
    var m := rig_map()
    for bone_name in m.keys():
        var idx := skel.find_bone(bone_name)
        var j := m[bone_name] as Node3D
        if idx < 0 or j == null:
            continue
        _rig.append([idx, j, _rel_basis(j), j.position, tr.has(bone_name)])
        _rig_mapped[idx] = _rig.size() - 1

## Chamado a cada quadro depois da animação procedural: aplica as rotações das juntas nos ossos,
## dos pais para os filhos, sem depender do cache de poses do Skeleton3D.
func _drive_rig() -> void:
    if skel == null or _rig.is_empty():
        return
    var count := skel.get_bone_count()
    var G: Array[Basis] = []
    G.resize(count)
    var S := _skel_basis
    var Si := S.inverse()
    for i in range(count):
        var p := skel.get_bone_parent(i)
        var pg: Basis = G[p] if p >= 0 else Basis()
        if _rig_mapped.has(i):
            var e: Array = _rig[_rig_mapped[i]]
            var j := e[1] as Node3D
            var delta := _rel_basis(j) * (e[2] as Basis).inverse()
            var gb: Basis = (Si * delta * S) * _rig_rest_global[i]
            skel.set_bone_pose_rotation(i, (pg.inverse() * gb).get_rotation_quaternion())
            if e[4]:
                skel.set_bone_pose_position(i, _rig_rest_local[i].origin + Si * (j.position - (e[3] as Vector3)))
            G[i] = gb
        else:
            G[i] = pg * skel.get_bone_pose(i).basis

## Ajustes do modelo importado (materiais com shader, efeitos nos FX_*). Sobrescrito pelos heróis.
func _setup_imported() -> void:
    pass

## Material próprio (o importador do glTF cria StandardMaterial3D): troca por um shader que lê os
## dados gravados no mapa UV pelo Blender (brasa nas rachaduras, gradiente das mechas de fogo...).
func override_material(mat_name: String, make: Callable) -> Array[ShaderMaterial]:
    var out: Array[ShaderMaterial] = []
    if imported_model == null:
        return out
    for mi in imported_model.find_children("*", "MeshInstance3D", true, false):
        var m := mi as MeshInstance3D
        for s in range(m.mesh.get_surface_count()):
            var mat := m.get_active_material(s)
            if mat != null and mat.resource_name == mat_name:
                var sm := make.call(mat) as ShaderMaterial
                m.set_surface_override_material(s, sm)
                out.append(sm)
    return out

func _build_status_fx() -> void:
    _burn = LFx.fire(self, 0.35, 24)
    _burn.position = Vector3(0, 0.8, 0)
    LFx.set_rate(_burn, 0.0)
    _wind = LFx.swirl(self, 0.6, 1.2, Color(0.85, 0.95, 1.0, 0.8), 40)
    LFx.set_rate(_wind, 0.0)
    _slow_ring = LMat.disc(self, 0.9, LMat.transparent(Color(0.3, 0.6, 1.0, 0.35)), 0.03)
    _slow_ring.visible = false
    _blind = LMat.part(self, LMat.sphere(0.3), Vector3(0, head_height(), 0), LMat.glow(Color(1.0, 0.95, 0.6, 0.45)))
    _blind.visible = false

func on_hit() -> void:
    last_hit = now()

func on_basic_attack() -> void:
    pass

## Tremida curta ao receber dano.
func hit_shake() -> Vector3:
    var k := clampf(1.0 - (now() - last_hit) / 0.2, 0.0, 1.0)
    if k <= 0.0:
        return Vector3.ZERO
    var t := now()
    return Vector3(sin(t * 90.0), 0.0, cos(t * 70.0)) * 0.06 * k

func sync_view(dt: float) -> void:
    if unit == null:
        return
    anim_time += dt
    var h := 0.0
    if unit.is_air():
        h = sin(clampf(1.0 - unit.airborne / 0.65, 0.0, 1.0) * PI) * 1.2
    var target := LMath.to_world(unit.pos, h)
    position = position.lerp(target, 1.0 - exp(-dt * 25.0))
    if position.distance_squared_to(target) > 9.0:
        position = target  # teleporte (troca, salto entre redemoinhos)
    rotation.y = lerp_angle(rotation.y, LMath.facing_yaw(unit.facing), 1.0 - exp(-dt * 14.0))
    var st := unit.status
    LFx.set_rate(_burn, 1.0 if st.has(LStatus.QUEIM) else 0.0)
    LFx.set_rate(_wind, 1.0 if st.has(LStatus.VENT) else 0.0)
    _slow_ring.visible = st.has(LStatus.LENT)
    _blind.visible = st.has(LStatus.OFUSC)
    if _blind.visible:
        _blind.scale = Vector3.ONE * (1.0 + sin(anim_time * 10.0) * 0.15)
    visible = unit.alive
    if skel != null:
        _drive_rig.call_deferred()
