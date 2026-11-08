extends SceneTree
## Salva as texturas procedurais em PNG para inspeção (uso no desenvolvimento).

func _init() -> void:
    var out := "user://"
    for a in OS.get_cmdline_user_args():
        if a.begins_with("--out="):
            out = a.substr(6)
    LTex.ember_veins().get_image().save_png(out + "/ember.png")
    var s := LTex.scales()
    (s["emission"] as ImageTexture).get_image().save_png(out + "/scales_emission.png")
    (s["albedo"] as ImageTexture).get_image().save_png(out + "/scales_albedo.png")
    LTex.flame().get_image().save_png(out + "/flame.png")
    print("ok")
    quit(0)
