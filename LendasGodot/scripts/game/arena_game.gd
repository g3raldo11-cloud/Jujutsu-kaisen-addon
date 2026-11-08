extends Node3D
## LENDAS: O DESPERTAR — Arena de Teste (versão Godot).
## Escolha Saci-Pererê, Boitatá ou Curupira e teste todas as habilidades no boneco de treino.
## A lógica roda na simulação autoritativa (LSim, tick fixo de 30 Hz); este nó só envia comandos,
## avança a simulação e sincroniza a apresentação (modelos, efeitos, sons e interface).

const ABILITY_ACTIONS := ["", "habilidade_1", "habilidade_2", "habilidade_3", "suprema"]

var sim: LSim
var player: LChampion
var ally: LChampion
var dummy: LTrainingDummy
var player_char := "saci"
var ally_enabled := false

var cam: LCameraRig
var hud: LHud
var sfx: LSfx
var indicator: LRangeIndicator
var _units_root: Node3D
var _fx_root: Node3D
var _views := {}
var _zone_views := {}
var _accumulator := 0.0
var _pending := 0
var _log: Array[String] = []
var _tick_damage := 0.0
var _tick_timer := 0.0
var _tick_pos := Vector3.ZERO

# Teste automático (linha de comando: -- --autotest [--shots=pasta])
var autotest := false
var _shots_dir := ""
var _auto_t := 0.0
var _auto_step := 0
var _auto_report: Array[String] = []

func _ready() -> void:
    LInputSetup.ensure()
    LArenaBuilder.build(self)
    _units_root = Node3D.new()
    _units_root.name = "Unidades"
    add_child(_units_root)
    _fx_root = Node3D.new()
    _fx_root.name = "Efeitos"
    add_child(_fx_root)
    cam = LCameraRig.new()
    add_child(cam)
    indicator = LRangeIndicator.new()
    add_child(indicator)
    sfx = LSfx.new()
    add_child(sfx)
    hud = LHud.new()
    add_child(hud)
    hud.setup(self)
    for arg in OS.get_cmdline_user_args():
        if arg == "--autotest":
            autotest = true
        elif arg.begins_with("--shots="):
            _shots_dir = arg.substr(8)
    restart("saci")
    hud.set_help_visible(not autotest)

# ------------------------------------------------------------------ arena

func restart(char_id: String) -> void:
    player_char = char_id
    if sim != null:
        sim.dispose()
    for v in _views.values():
        v.queue_free()
    for z in _zone_views.values():
        z.queue_free()
    _views.clear()
    _zone_views.clear()
    sim = LSim.new()
    player = sim.add_champion(0, char_id, "Você", false)
    player.pos = Vector2(-6.0, 0.0)
    dummy = LTrainingDummy.new(sim, Vector2(4.0, 0.0))
    ally = null
    if ally_enabled:
        var ally_char := "curupira" if char_id == "saci" else "saci"
        ally = sim.add_champion(0, ally_char, "Aliado (bot)", true)
        ally.pos = Vector2(-6.0, 4.0)
    cam.target = _create_view(player)
    cam.yaw = PI * 0.5
    hud.on_restart()
    add_log("Arena pronta: %s%s" % [player.stats.display_name, (" + aliado %s" % ally.stats.display_name) if ally != null else ""])

func toggle_ally() -> void:
    ally_enabled = not ally_enabled
    restart(player_char)

func toggle_dummy_moving() -> void:
    dummy.moving = not dummy.moving
    add_log("Boneco em movimento" if dummy.moving else "Boneco parado")

func reset_dummy() -> void:
    dummy.reset()
    add_log("Boneco zerado")

func toggle_help() -> void:
    hud.set_help_visible(not hud.is_help_visible())

func add_log(line: String) -> void:
    _log.append(line)
    while _log.size() > 7:
        _log.pop_front()
    hud.set_log(_log)
    if autotest:
        _auto_report.append(line)

func _create_view(u: LUnit) -> LUnitView:
    var view: LUnitView
    if u is LChampion and (u as LChampion).is_dummy:
        view = LDummyView.new()
    else:
        var cid: String = (u as LChampion).char_id if u is LChampion else (u as LDecoy).char_id
        match cid:
            "boitata":
                view = LBoitataView.new()
            "curupira":
                view = LCurupiraView.new()
            _:
                view = LSaciView.new()
    _units_root.add_child(view)
    view.bind(u)
    _views[u.id] = view
    return view

# ------------------------------------------------------------------ entrada

func _unhandled_input(event: InputEvent) -> void:
    if event is InputEventMouseButton and event.pressed and Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
        if (event as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
            Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
            hud.set_help_visible(false)
            get_viewport().set_input_as_handled()

func _handle_meta_keys() -> void:
    if Input.is_action_just_pressed("soltar_cursor"):
        Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
    if Input.is_action_just_pressed("escolher_saci"):
        restart("saci")
    if Input.is_action_just_pressed("escolher_boitata"):
        restart("boitata")
    if Input.is_action_just_pressed("escolher_curupira"):
        restart("curupira")
    if Input.is_action_just_pressed("alternar_aliado"):
        toggle_ally()
    if Input.is_action_just_pressed("boneco_anda"):
        toggle_dummy_moving()
    if Input.is_action_just_pressed("zerar_boneco"):
        reset_dummy()
    if Input.is_action_just_pressed("ajuda"):
        toggle_help()

# ------------------------------------------------------------------ laço

func _process(delta: float) -> void:
    if sim == null:
        return
    var preview := -1
    var move3: Vector3
    var aim3: Vector3
    var attack := false
    var sprint := false
    if autotest:
        var a := _autotest_frame(delta)
        move3 = a[0]
        aim3 = a[1]
        attack = a[2]
    else:
        _handle_meta_keys()
        for s in range(1, 5):
            var action: String = ABILITY_ACTIONS[s]
            if Input.is_action_pressed(action):
                preview = s
            if Input.is_action_just_released(action):
                _pending |= LCommand.SLOT_BTN[s]
        if Input.is_action_just_pressed("esquiva"):
            _pending |= LCommand.DODGE
        if Input.is_action_just_pressed("saltar"):
            _pending |= LCommand.JUMP
        var axes := Input.get_vector("mover_esquerda", "mover_direita", "mover_tras", "mover_frente")
        move3 = cam.move_direction(axes)
        aim3 = cam.aim_point(14.0)
        attack = (Input.is_action_pressed("atacar") and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED) or Input.is_action_pressed("atacar_controle")
        sprint = Input.is_action_pressed("correr")

    _accumulator += minf(delta, 0.1)
    var steps := 0
    while _accumulator >= LSim.DT and steps < 5:
        _accumulator -= LSim.DT
        steps += 1
        sim.events.clear()
        var cmd := LCommand.new()
        cmd.move = Vector2(move3.x, move3.z)
        cmd.aim = Vector2(aim3.x, aim3.z)
        cmd.attack = attack
        cmd.sprint = sprint
        cmd.pressed = _pending
        _pending = 0
        sim.set_command(player.id, cmd)
        sim.step()
        dummy.after_step()
        _process_events()

    _sync_views(delta)
    if preview > 0 and player.alive:
        indicator.show_for(player.stats.abilities[preview], LMath.to_world(player.pos), aim3)
    else:
        indicator.hide_indicator()
    hud.update_hud()

func _sync_views(dt: float) -> void:
    for c in sim.champions:
        if not _views.has(c.id):
            _create_view(c)
    for d in sim.decoys:
        if not _views.has(d.id):
            _create_view(d)
    for id in _views.keys():
        var u := sim.unit(id)
        var v: LUnitView = _views[id]
        if u == null or (u is LDecoy and not u.alive):
            v.queue_free()
            _views.erase(id)
            continue
        v.sync_view(dt)
    var alive_ids := {}
    for z in sim.zones:
        alive_ids[z.id] = true
        if not _zone_views.has(z.id):
            var zv := LZoneView.new()
            _units_root.add_child(zv)
            zv.bind(z)
            _zone_views[z.id] = zv
    for id in _zone_views.keys():
        var zv: LZoneView = _zone_views[id]
        if not alive_ids.has(id):
            zv.zone = null
            get_tree().create_timer(0.6).timeout.connect(zv.queue_free)
            _zone_views.erase(id)
        else:
            zv.sync_view(dt)

## Traduz eventos da simulação em feedback visual e sonoro.
func _process_events() -> void:
    for e in sim.events:
        var pos := LMath.to_world(e["pos"], 1.0)
        match e["type"]:
            "damage":
                if _views.has(e["tgt"]):
                    _views[e["tgt"]].on_hit()
                var v := float(e["value"])
                if v >= 3.0:
                    _floater(pos + Vector3(0, 1.2, 0), str(roundi(v)), Color(1.0, 0.85, 0.3) if e["src"] == player.id else Color(1.0, 0.55, 0.45))
                    LFx.burst(_fx_root, pos, Color(1.0, 0.75, 0.4), 10, 3.0, 0.35)
                    sfx.play("impacto", pos, 0.5, randf_range(0.9, 1.1))
                else:
                    _accumulate_tick(v, pos)
            "basic":
                if _views.has(e["src"]):
                    _views[e["src"]].on_basic_attack()
                sfx.play("golpe", pos, 0.6, randf_range(0.9, 1.15))
            "miss":
                _floater(pos + Vector3(0, 1.0, 0), "errou!", Color(0.7, 0.7, 0.7))
                sfx.play("erro", pos)
            "cast":
                add_log("%s: %s" % [_name_of(e["src"]), e["text"]])
                _play_ability_sound(e, pos)
            "recast":
                add_log("%s: %s (reativação)" % [_name_of(e["src"]), e["text"]])
            "swap":
                LFx.burst(_fx_root, pos, Color(0.85, 0.72, 0.5), 30, 5.0, 0.45)
                sfx.play("troca", pos)
            "blink":
                LFx.burst(_fx_root, pos, Color(0.9, 0.95, 1.0), 40, 7.0, 0.5)
                sfx.play("vento", pos, 1.0, 1.4)
            "dodge":
                sfx.play("esquiva", pos)
            "jump":
                sfx.play("salto", pos)
            "explode":
                LFx.burst(_fx_root, pos, Color(1.0, 0.55, 0.1), 35, 8.0, 0.7)
                sfx.play("explosao", pos, 0.9, 0.8)
            "wave":
                LFx.burst(_fx_root, pos, Color(1.0, 0.75, 0.3), 40, 9.0, 0.6)
            "wrath":
                LFx.burst(_fx_root, pos, Color(1.0, 0.55, 0.15), 70, 12.0, 0.9)
                sfx.play("suprema", pos)
            "jet":
                sfx.play("fogo", pos, 0.7, 1.3)
            "synergy":
                add_log("★ RESSONÂNCIA: %s!" % e["text"])
                _floater(pos + Vector3(0, 2.0, 0), String(e["text"]), Color(1.0, 0.9, 0.4), 72)
                sfx.play("sinergia", pos)
            "decoy_broken":
                LFx.burst(_fx_root, pos, Color(0.7, 0.6, 0.45), 25, 4.0, 0.4)

## Dano contínuo (queimaduras, zonas) é somado e exibido a cada 0,5 s.
func _accumulate_tick(v: float, pos: Vector3) -> void:
    _tick_damage += v
    _tick_pos = pos + Vector3(0, 1.4, 0)
    _tick_timer += LSim.DT
    if _tick_timer >= 0.5:
        if _tick_damage >= 1.0:
            _floater(_tick_pos, str(roundi(_tick_damage)), Color(1.0, 0.55, 0.15))
        _tick_damage = 0.0
        _tick_timer = 0.0

func _floater(pos: Vector3, text: String, color: Color, font_size: int = 56) -> void:
    var l := Label3D.new()
    l.text = text
    l.font_size = font_size
    l.pixel_size = 0.006
    l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
    l.no_depth_test = true
    l.modulate = color
    l.outline_size = 10
    l.outline_modulate = Color(0, 0, 0, 0.8)
    if hud.display_font != null:
        l.font = hud.display_font
    l.position = pos + Vector3(randf_range(-0.3, 0.3), 0, randf_range(-0.3, 0.3))
    _fx_root.add_child(l)
    var tw := l.create_tween()
    tw.set_parallel(true)
    tw.tween_property(l, "position", l.position + Vector3(0, 1.3, 0), 1.0)
    tw.tween_property(l, "modulate:a", 0.0, 1.0).set_delay(0.3)
    tw.chain().tween_callback(l.queue_free)

func _play_ability_sound(e: Dictionary, pos: Vector3) -> void:
    var c := sim.champion(e["src"])
    if c == null:
        return
    var slot: int = e["slot"]
    var kind := "golpe"
    match c.char_id:
        "saci":
            kind = "troca" if slot == 2 else ("suprema" if slot == 4 else "vento")
        "boitata":
            kind = ["", "investida", "ofuscar", "fogo", "suprema"][slot]
        "curupira":
            kind = ["", "fogo", "investida", "fogo", "suprema"][slot]
    sfx.play(kind, pos)

func _name_of(id: int) -> String:
    var c := sim.champion(id)
    return c.name if c != null else "?"

# ------------------------------------------------------------------ teste automático

## Roteiro: para cada entidade, usa as 4 habilidades e ataques no boneco; depois liga o aliado.
## Sai com código 0 se tudo causou efeito, 1 caso contrário. Pode salvar capturas de tela.
func _autotest_frame(delta: float) -> Array:
    _auto_t += delta
    var to_dummy := dummy.unit.pos - player.pos
    var aim := LMath.to_world(dummy.unit.pos)
    var move := Vector3.ZERO
    var attack := false
    var chars := ["saci", "boitata", "curupira"]
    var phase := _auto_step
    if phase < 3:
        if player_char != chars[phase]:
            restart(chars[phase])
            _auto_t = 0.0
            dummy.reset()
            return [Vector3.ZERO, aim, false]
        # 0–1 s aproxima e ataca; depois uma habilidade a cada 1,2 s; R reativado em seguida.
        if to_dummy.length() > 2.0:
            move = Vector3(to_dummy.normalized().x, 0, to_dummy.normalized().y)
        attack = true
        var schedule := [1.0, 2.2, 3.4, 4.6, 5.4]
        var slots := [1, 2, 3, 4, 4]
        for i in range(schedule.size()):
            if _auto_t - delta < schedule[i] and _auto_t >= schedule[i]:
                _pending |= LCommand.SLOT_BTN[slots[i]]
                if i == 3:
                    _shot("%s_suprema" % player_char)
        if _auto_t >= 2.6 and _auto_t - delta < 2.6:
            _shot("%s_habilidades" % player_char)
        if phase == 0 and _auto_t >= 0.3 and _auto_t - delta < 0.3:
            hud.set_help_visible(true)
            _shot("ajuda")
        if phase == 0 and _auto_t >= 0.9 and _auto_t - delta < 0.9:
            hud.set_help_visible(false)
        if _auto_t > 6.5:
            _auto_report.append("RESULTADO %s: dano no boneco = %d" % [player_char, int(dummy.total)])
            if dummy.total <= 0.0:
                _auto_report.append("FALHA: %s não causou dano" % player_char)
            _auto_step += 1
            _auto_t = 0.0
    elif phase == 3:
        if ally == null:
            ally_enabled = true
            restart("saci")
            _auto_t = 0.0
            return [Vector3.ZERO, aim, false]
        attack = true
        if to_dummy.length() > 2.0:
            move = Vector3(to_dummy.normalized().x, 0, to_dummy.normalized().y)
        if _auto_t >= 3.0 and _auto_t - delta < 3.0:
            _shot("aliado")
        if _auto_t > 6.0:
            _auto_report.append("RESULTADO aliado: dano total no boneco = %d, ressonâncias = %d" % [int(dummy.total), ally.synergies])
            _auto_step += 1
    else:
        var failed := false
        for line in _auto_report:
            print(line)
            if line.begins_with("FALHA"):
                failed = true
        print("VIEWS=%d ZONES=%d" % [_views.size(), _zone_views.size()])
        print("AUTOTEST %s" % ("FALHOU" if failed else "OK"))
        get_tree().quit(1 if failed else 0)
    return [move, aim, attack]

func _shot(label: String) -> void:
    if _shots_dir == "":
        return
    await RenderingServer.frame_post_draw
    var img := get_viewport().get_texture().get_image()
    if img != null:
        img.save_png("%s/%s.png" % [_shots_dir, label])
