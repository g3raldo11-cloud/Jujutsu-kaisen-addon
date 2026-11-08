extends SceneTree
## Diagnóstico visual de materiais (uso no desenvolvimento).

var _frames := 0
var _out := "user://mat_probe.png"

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
    env.ambient_light_color = Color(0.5, 0.5, 0.5)
    we.environment = env
    root.add_child(we)
    var cam := Camera3D.new()
    cam.position = Vector3(0, 0, 6)
    root.add_child(cam)
    var light := DirectionalLight3D.new()
    light.rotation_degrees = Vector3(-30, 30, 0)
    root.add_child(light)
    var black_emit := LMat.skin(Color(0.4, 0.22, 0.12)).duplicate() as StandardMaterial3D
    black_emit.emission_enabled = true
    black_emit.emission = Color(0, 0, 0)
    var mats := [LMat.skin(Color(0.4, 0.22, 0.12)), LMat.ember_skin(Color(0.4, 0.22, 0.12)), LMat.scales_mat(), black_emit]
    var names := ["pele", "pele+brasa", "escamas", "emissão preta"]
    for i in range(mats.size()):
        var mi := MeshInstance3D.new()
        mi.mesh = LMesh.ellipsoid(Vector3(0.6, 0.6, 0.6), 24, 16)
        mi.material_override = mats[i]
        mi.position = Vector3(-2.4 + i * 1.6, 0.3, 0)
        root.add_child(mi)
        var l := Label3D.new()
        l.text = names[i]
        l.position = mi.position + Vector3(0, -0.95, 0)
        l.font_size = 36
        root.add_child(l)
    get_root().add_child(root)

func _process(_delta: float) -> bool:
    _frames += 1
    if _frames == 30:
        get_root().get_texture().get_image().save_png(_out)
        print("salvo")
        return true
    return false
