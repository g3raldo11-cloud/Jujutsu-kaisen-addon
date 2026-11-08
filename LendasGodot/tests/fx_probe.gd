extends SceneTree
## Diagnóstico visual de materiais de partícula (usado só durante o desenvolvimento).
## godot --path . --rendering-driver opengl3 --script res://tests/fx_probe.gd -- --out=/caminho/arquivo.png

var _frames := 0
var _out := "user://fx_probe.png"

func _init() -> void:
    for a in OS.get_cmdline_user_args():
        if a.begins_with("--out="):
            _out = a.substr(6)
    var root := Node3D.new()
    var we := WorldEnvironment.new()
    var env := Environment.new()
    env.background_mode = Environment.BG_COLOR
    env.background_color = Color(0.45, 0.6, 0.75)
    env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
    env.ambient_light_color = Color(0.6, 0.6, 0.6)
    we.environment = env
    root.add_child(we)
    var cam := Camera3D.new()
    cam.position = Vector3(0, 1, 5)
    root.add_child(cam)
    var light := DirectionalLight3D.new()
    light.rotation_degrees = Vector3(-45, 30, 0)
    root.add_child(light)
    var labels := ["mix branco", "mix bege", "aditivo", "mix sem cor-vértice"]
    for i in range(4):
        var p := CPUParticles3D.new()
        p.amount = 40
        p.lifetime = 1.0
        p.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
        p.emission_sphere_radius = 0.3
        p.gravity = Vector3.ZERO
        p.initial_velocity_min = 0.0
        p.initial_velocity_max = 0.1
        var q := QuadMesh.new()
        q.size = Vector2(0.6, 0.6)
        p.mesh = q
        var m := StandardMaterial3D.new()
        m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
        m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
        m.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
        m.albedo_texture = LMat.soft_dot()
        if i == 2:
            m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
        if i != 3:
            m.vertex_color_use_as_albedo = true
        p.material_override = m
        p.color = Color(1, 1, 1, 0.8) if i != 1 else Color(0.8, 0.65, 0.45, 0.8)
        p.position = Vector3(-2.4 + i * 1.6, 1, 0)
        root.add_child(p)
        var l := Label3D.new()
        l.text = labels[i]
        l.position = p.position + Vector3(0, -0.7, 0)
        l.font_size = 40
        root.add_child(l)
    get_root().add_child(root)

func _process(_delta: float) -> bool:
    _frames += 1
    if _frames == 40:
        var img := get_root().get_texture().get_image()
        img.save_png(_out)
        print("salvo ", _out)
        return true
    return false
