class_name LHud
extends CanvasLayer
## Interface da Arena de Teste. Paleta da noite na mata: verde-mata, amarelo-ipê, urucum e barro.
## Mostra vida, energia, recurso exclusivo, recargas, estatísticas do boneco, registro e ajuda.

const BREU := Color(0.047, 0.075, 0.067, 0.82)
const MATA := Color(0.086, 0.22, 0.165)
const MATA_BORDA := Color(0.17, 0.35, 0.27)
const URUCUM := Color(0.85, 0.33, 0.17)
const IPE := Color(0.95, 0.76, 0.19)
const ARGILA := Color(0.76, 0.57, 0.4)
const NEVOA := Color(0.93, 0.9, 0.84)
const AGUA := Color(0.31, 0.65, 0.77)
const VIDA := Color(0.36, 0.77, 0.43)

var game: Node
var display_font: Font
var ui_font: Font

var _root: Control
var _brand_panel: PanelContainer
var _dummy_panel: PanelContainer
var _player_panel: PanelContainer
var _log_panel: PanelContainer
var _cross: Array[ColorRect] = []
var _char_buttons := {}
var _ally_button: Button
var _move_button: Button
var _help_button: Button
var _d_total: Label
var _d_last: Label
var _d_dps: Label
var _d_bar: ProgressBar
var _d_fx: Label
var _synergy: Label
var _p_name: Label
var _p_role: Label
var _hp: ProgressBar
var _energy: ProgressBar
var _res: ProgressBar
var _stamina: ProgressBar
var _ult: ProgressBar
var _slots: Array[Dictionary] = []
var _log: Label
var _help: PanelContainer
var _kit_text: RichTextLabel
var _hint: Label

func setup(p_game: Node) -> void:
    game = p_game
    display_font = _try_font("res://assets/fonts/LondrinaSolid-Black.woff2")
    ui_font = _try_font("res://assets/fonts/Chivo-Regular.woff2")
    _root = Control.new()
    _root.set_anchors_preset(Control.PRESET_FULL_RECT)
    _root.mouse_filter = Control.MOUSE_FILTER_IGNORE
    add_child(_root)
    if ui_font != null:
        var theme := Theme.new()
        theme.default_font = ui_font
        _root.theme = theme
    _build_brand()
    _build_dummy()
    _build_player()
    _build_log()
    _build_help()
    _build_crosshair()

func _try_font(path: String) -> Font:
    if ResourceLoader.exists(path):
        return load(path) as Font
    return null

# ------------------------------------------------------------------ peças

func _panel(min_size: Vector2 = Vector2.ZERO) -> PanelContainer:
    var p := PanelContainer.new()
    var sb := StyleBoxFlat.new()
    sb.bg_color = BREU
    sb.border_color = MATA_BORDA
    sb.set_border_width_all(1)
    sb.border_width_top = 3
    sb.set_corner_radius_all(6)
    sb.content_margin_left = 12
    sb.content_margin_right = 12
    sb.content_margin_top = 10
    sb.content_margin_bottom = 10
    p.add_theme_stylebox_override("panel", sb)
    p.custom_minimum_size = min_size
    p.mouse_filter = Control.MOUSE_FILTER_IGNORE
    _root.add_child(p)
    return p

func _label(text: String, size: int, color: Color, font: Font = null) -> Label:
    var l := Label.new()
    l.text = text
    l.add_theme_font_size_override("font_size", size)
    l.add_theme_color_override("font_color", color)
    l.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.7))
    l.add_theme_constant_override("shadow_offset_y", 1)
    if font != null:
        l.add_theme_font_override("font", font)
    l.mouse_filter = Control.MOUSE_FILTER_IGNORE
    return l

func _bar(fill: Color, height: float) -> ProgressBar:
    var b := ProgressBar.new()
    b.show_percentage = false
    b.custom_minimum_size = Vector2(0, height)
    b.min_value = 0.0
    b.max_value = 1.0
    var bg := StyleBoxFlat.new()
    bg.bg_color = Color(0, 0, 0, 0.55)
    bg.set_corner_radius_all(3)
    var fg := StyleBoxFlat.new()
    fg.bg_color = fill
    fg.set_corner_radius_all(3)
    b.add_theme_stylebox_override("background", bg)
    b.add_theme_stylebox_override("fill", fg)
    var text := _label("", 11 if height < 14.0 else 13, Color.WHITE)
    text.set_anchors_preset(Control.PRESET_FULL_RECT)
    text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    text.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
    text.name = "Texto"
    b.add_child(text)
    b.mouse_filter = Control.MOUSE_FILTER_IGNORE
    return b

func _set_bar(b: ProgressBar, frac: float, text: String) -> void:
    b.value = clampf(frac, 0.0, 1.0)
    (b.get_node("Texto") as Label).text = text

func _chip(text: String, on_press: Callable) -> Button:
    var b := Button.new()
    b.text = text
    b.focus_mode = Control.FOCUS_NONE
    b.add_theme_font_size_override("font_size", 13)
    for state in ["normal", "hover", "pressed", "hover_pressed"]:
        var sb := StyleBoxFlat.new()
        var active: bool = state == "pressed" or state == "hover_pressed"
        sb.bg_color = IPE if active else (MATA.lightened(0.12) if state == "hover" else MATA)
        sb.border_color = IPE if active else MATA_BORDA
        sb.set_border_width_all(1)
        sb.set_corner_radius_all(14)
        sb.content_margin_left = 11
        sb.content_margin_right = 11
        sb.content_margin_top = 5
        sb.content_margin_bottom = 5
        b.add_theme_stylebox_override(state, sb)
    b.add_theme_color_override("font_color", NEVOA)
    b.add_theme_color_override("font_hover_color", NEVOA)
    b.add_theme_color_override("font_pressed_color", Color(0.05, 0.07, 0.06))
    b.add_theme_color_override("font_hover_pressed_color", Color(0.05, 0.07, 0.06))
    b.pressed.connect(on_press)
    return b

# ------------------------------------------------------------------ montagem

func _build_brand() -> void:
    var p := _panel()
    _brand_panel = p
    var v := VBoxContainer.new()
    v.add_theme_constant_override("separation", 8)
    p.add_child(v)
    var title := _label("LENDAS: O DESPERTAR", 30, IPE, display_font)
    v.add_child(title)
    v.add_child(_label("Arena de Teste · escolha uma entidade e teste os poderes no boneco", 13, ARGILA))
    var row := HBoxContainer.new()
    row.add_theme_constant_override("separation", 6)
    v.add_child(row)
    var names := {"saci": "1 · Saci-Pererê", "boitata": "2 · Boitatá", "curupira": "3 · Curupira"}
    for id in LCharacters.IDS:
        var b := _chip(names[id], func() -> void: game.restart(id))
        b.toggle_mode = true
        _char_buttons[id] = b
        row.add_child(b)
    var row2 := HBoxContainer.new()
    row2.add_theme_constant_override("separation", 6)
    v.add_child(row2)
    _ally_button = _chip("Tab · Aliado bot", func() -> void: game.toggle_ally())
    _ally_button.toggle_mode = true
    _move_button = _chip("M · Boneco anda", func() -> void: game.toggle_dummy_moving())
    _move_button.toggle_mode = true
    var reset := _chip("⌫ · Zerar boneco", func() -> void: game.reset_dummy())
    _help_button = _chip("H · Ajuda", func() -> void: game.toggle_help())
    _help_button.toggle_mode = true
    for b in [_ally_button, _move_button, reset, _help_button]:
        row2.add_child(b)

func _build_dummy() -> void:
    var p := _panel(Vector2(250, 0))
    _dummy_panel = p
    var v := VBoxContainer.new()
    v.add_theme_constant_override("separation", 5)
    p.add_child(v)
    v.add_child(_label("Boneco de treino", 22, IPE, display_font))
    _d_total = _stat_row(v, "Dano total")
    _d_last = _stat_row(v, "Último golpe")
    _d_dps = _stat_row(v, "DPS (1 s)")
    _d_bar = _bar(URUCUM, 10)
    v.add_child(_d_bar)
    _d_fx = _label("", 12, URUCUM)
    _d_fx.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    _d_fx.custom_minimum_size = Vector2(226, 0)
    v.add_child(_d_fx)
    _synergy = _label("", 12, ARGILA)
    v.add_child(_synergy)

func _stat_row(parent: Container, title: String) -> Label:
    var h := HBoxContainer.new()
    parent.add_child(h)
    var t := _label(title, 13, ARGILA)
    t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    h.add_child(t)
    var val := _label("0", 15, NEVOA)
    h.add_child(val)
    return val

func _build_player() -> void:
    var p := _panel(Vector2(560, 0))
    _player_panel = p
    var v := VBoxContainer.new()
    v.add_theme_constant_override("separation", 5)
    p.add_child(v)
    var head := HBoxContainer.new()
    v.add_child(head)
    _p_name = _label("", 24, NEVOA, display_font)
    _p_name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    head.add_child(_p_name)
    _p_role = _label("", 12, ARGILA)
    _p_role.vertical_alignment = VERTICAL_ALIGNMENT_BOTTOM
    head.add_child(_p_role)
    _hp = _bar(VIDA, 18)
    v.add_child(_hp)
    var r1 := HBoxContainer.new()
    r1.add_theme_constant_override("separation", 6)
    v.add_child(r1)
    _energy = _bar(AGUA, 12)
    _res = _bar(URUCUM, 12)
    for b in [_energy, _res]:
        b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
        r1.add_child(b)
    var r2 := HBoxContainer.new()
    r2.add_theme_constant_override("separation", 6)
    v.add_child(r2)
    _stamina = _bar(ARGILA, 10)
    _ult = _bar(IPE, 10)
    for b in [_stamina, _ult]:
        b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
        r2.add_child(b)
    var slots := HBoxContainer.new()
    slots.alignment = BoxContainer.ALIGNMENT_CENTER
    slots.add_theme_constant_override("separation", 6)
    v.add_child(slots)
    var keys := ["Clique", "Q", "E", "F", "R", "Ctrl", "Espaço"]
    for i in range(7):
        _slots.append(_make_slot(slots, keys[i], i >= 5))

func _make_slot(parent: Container, key: String, small: bool) -> Dictionary:
    var size := 50.0 if small else 66.0
    var panel := Panel.new()
    panel.custom_minimum_size = Vector2(size, size)
    panel.size_flags_vertical = Control.SIZE_SHRINK_END
    var sb := StyleBoxFlat.new()
    sb.bg_color = Color(0.17, 0.13, 0.09) if small else MATA
    sb.border_color = MATA_BORDA
    sb.set_border_width_all(1)
    sb.set_corner_radius_all(6)
    panel.add_theme_stylebox_override("panel", sb)
    panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
    parent.add_child(panel)
    var k := _label(key, 11, IPE)
    k.position = Vector2(0, 3)
    k.size = Vector2(size, 14)
    k.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    panel.add_child(k)
    var n := _label("", 10, NEVOA)
    n.position = Vector2(2, 17)
    n.size = Vector2(size - 4, size - 30)
    n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    n.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
    n.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    n.clip_text = true
    panel.add_child(n)
    var cd := ColorRect.new()
    cd.color = Color(0, 0, 0, 0.66)
    cd.mouse_filter = Control.MOUSE_FILTER_IGNORE
    panel.add_child(cd)
    var t := _label("", 12, Color.WHITE)
    t.position = Vector2(0, size - 17)
    t.size = Vector2(size, 15)
    t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    panel.add_child(t)
    return {"panel": panel, "style": sb, "name": n, "cd": cd, "time": t, "size": size, "small": small}

func _build_log() -> void:
    var p := _panel(Vector2(340, 0))
    _log_panel = p
    _log = _label("", 12, ARGILA)
    _log.custom_minimum_size = Vector2(316, 0)
    p.add_child(_log)
    _hint = _label("Clique na arena para controlar a câmera com o mouse · Esc solta o cursor", 14, NEVOA)
    _hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    _root.add_child(_hint)

func _build_help() -> void:
    _help = _panel(Vector2(820, 0))
    var h := HBoxContainer.new()
    h.add_theme_constant_override("separation", 22)
    _help.add_child(h)
    var left := VBoxContainer.new()
    h.add_child(left)
    left.add_child(_label("Controles", 22, IPE, display_font))
    var controls := RichTextLabel.new()
    controls.bbcode_enabled = true
    controls.fit_content = true
    controls.custom_minimum_size = Vector2(320, 0)
    controls.scroll_active = false
    controls.add_theme_font_size_override("normal_font_size", 13)
    controls.add_theme_font_size_override("bold_font_size", 13)
    controls.text = (
        "[color=#f2c230][b]WASD[/b][/color]  mover (relativo à câmera)\n"
        + "[color=#f2c230][b]Mouse[/b][/color]  girar a câmera e mirar (centro da tela)\n"
        + "[color=#f2c230][b]Roda[/b][/color]  aproximar / afastar\n"
        + "[color=#f2c230][b]Clique[/b][/color]  ataque básico (segure)\n"
        + "[color=#f2c230][b]Q · E · F[/b][/color]  segure para ver o alcance, solte para lançar\n"
        + "[color=#f2c230][b]R[/b][/color]  Suprema (aperte de novo para reativar)\n"
        + "[color=#f2c230][b]Shift[/b][/color]  correr · [color=#f2c230][b]Espaço[/b][/color] saltar\n"
        + "[color=#f2c230][b]Ctrl / botão direito[/b][/color]  esquiva\n"
        + "[color=#f2c230][b]1 · 2 · 3[/b][/color]  Saci · Boitatá · Curupira\n"
        + "[color=#f2c230][b]Tab · M · ⌫[/b][/color]  aliado bot · boneco anda · zerar\n"
        + "[color=#f2c230][b]Setas[/b][/color]  girar a câmera sem o mouse\n"
        + "[color=#f2c230][b]Esc[/b][/color]  soltar o cursor\n"
        + "[color=#c19166]Controle (gamepad) também funciona: analógicos, X/Y/B/RB, A salta, LB esquiva, RT ataca.[/color]")
    left.add_child(controls)
    var right := VBoxContainer.new()
    right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    h.add_child(right)
    right.add_child(_label("Habilidades", 22, IPE, display_font))
    _kit_text = RichTextLabel.new()
    _kit_text.bbcode_enabled = true
    _kit_text.fit_content = true
    _kit_text.scroll_active = false
    _kit_text.custom_minimum_size = Vector2(420, 0)
    _kit_text.add_theme_font_size_override("normal_font_size", 13)
    _kit_text.add_theme_font_size_override("bold_font_size", 13)
    right.add_child(_kit_text)
    right.add_child(_label("Na arena a energia e a Suprema são infinitas e as recargas são 4x mais rápidas.", 12, ARGILA))

func _build_crosshair() -> void:
    for horizontal in [true, false]:
        var r := ColorRect.new()
        r.color = Color(1, 1, 1, 0.85)
        r.mouse_filter = Control.MOUSE_FILTER_IGNORE
        r.size = Vector2(18, 2) if horizontal else Vector2(2, 18)
        _root.add_child(r)
        _cross.append(r)

# ------------------------------------------------------------------ atualização

func on_restart() -> void:
    var p: LChampion = game.player
    _p_name.text = p.stats.display_name
    _p_role.text = p.stats.role
    for id in _char_buttons:
        _char_buttons[id].set_pressed_no_signal(id == game.player_char)
    _ally_button.set_pressed_no_signal(game.ally_enabled)
    var lines := "[b][color=#f2c230]%s[/color][/b] — %s\n[color=#d9542b][b]Passiva · %s[/b][/color]: %s\n" % [
        p.stats.display_name, p.stats.role, p.stats.passive_name, p.stats.passive_desc]
    var keys := ["Clique", "Q", "E", "F", "R"]
    for i in range(5):
        var a := p.stats.abilities[i]
        lines += "[color=#f2c230][b]%s[/b][/color] [b]%s[/b] [color=#c19166](recarga %ss · energia %d)[/color]: %s\n" % [
            keys[i], a.name, str(snappedf(a.cd, 0.01)), int(a.cost), a.desc]
    _kit_text.text = lines
    for i in range(5):
        _slots[i]["name"].text = p.stats.abilities[i].name
    _slots[5]["name"].text = "Esquiva"
    _slots[6]["name"].text = "Salto"

func set_log(lines: Array[String]) -> void:
    _log.text = "\n".join(lines)

## Posiciona os painéis pelo tamanho real do conteúdo (independe da resolução da janela).
func _layout() -> void:
    var vp := _root.get_viewport_rect().size
    var m := 16.0
    _brand_panel.position = Vector2(m, m)
    _brand_panel.size = _brand_panel.get_combined_minimum_size()
    var ds := _dummy_panel.get_combined_minimum_size()
    _dummy_panel.size = ds
    _dummy_panel.position = Vector2(vp.x - ds.x - m, m)
    var ps := _player_panel.get_combined_minimum_size()
    _player_panel.size = ps
    _player_panel.position = Vector2((vp.x - ps.x) * 0.5, vp.y - ps.y - 14.0)
    var ls := _log_panel.get_combined_minimum_size()
    _log_panel.size = ls
    _log_panel.position = Vector2(m, vp.y - ls.y - m)
    _log_panel.visible = _log.text != "" and _player_panel.position.x > ls.x + 2.0 * m
    var hs := _help.get_combined_minimum_size()
    _help.size = hs
    _help.position = ((vp - hs) * 0.5).max(Vector2(m, m))
    _hint.size = Vector2(vp.x, 24.0)
    _hint.position = Vector2(0.0, vp.y * 0.5 + 48.0)
    var c := vp * 0.5
    for r in _cross:
        r.position = c - r.size * 0.5

func update_hud() -> void:
    var p: LChampion = game.player
    var d: LTrainingDummy = game.dummy
    if p == null or d == null:
        return
    _layout()
    _set_bar(_hp, p.hp_frac(), "Vida %d / %d" % [ceili(p.hp), int(p.max_hp)])
    _set_bar(_energy, p.energy / p.max_energy, "Energia espiritual %d" % int(p.energy))
    var kit := p.kit
    var extra := ""
    if kit is LCurupiraKit and (kit as LCurupiraKit).is_hot():
        extra = " · INCANDESCENTE"
    elif kit is LBoitataKit and (kit as LBoitataKit).heat >= LBoitataKit.BURNING_HEAT:
        extra = " · corpo em brasa"
    _set_bar(_res, kit.res_value() / kit.res_max(), "%s %d / %d%s" % [kit.res_name(), int(kit.res_value()), int(kit.res_max()), extra])
    _set_bar(_stamina, p.stamina / 100.0, "Fôlego")
    _set_bar(_ult, p.ult / 100.0, "Suprema %d%%" % int(p.ult))

    for i in range(7):
        var s: Dictionary = _slots[i]
        var cd_left := 0.0
        var cd_max := 1.0
        var recast := false
        if i < 5:
            cd_left = p.cd[i]
            cd_max = maxf(0.01, p.stats.abilities[i].cd * (0.25 if game.sim.infinite and i > 0 else 1.0))
            recast = kit.is_recast(i)
        elif i == 5:
            cd_left = p.dodge_cd
            cd_max = 4.5
        else:
            cd_left = p.jump_cd
            cd_max = 1.2
        var size: float = s["size"]
        var frac := clampf(cd_left / cd_max, 0.0, 1.0) if not recast else 0.0
        var cdr: ColorRect = s["cd"]
        cdr.position = Vector2(0, size * (1.0 - frac))
        cdr.size = Vector2(size, size * frac)
        var style: StyleBoxFlat = s["style"]
        style.border_color = IPE if recast else MATA_BORDA
        style.set_border_width_all(2 if recast else 1)
        var t: Label = s["time"]
        if recast:
            t.text = "REATIVAR"
            t.add_theme_font_size_override("font_size", 9)
        elif cd_left > 0.05:
            t.text = "%.1f" % cd_left
            t.add_theme_font_size_override("font_size", 12)
        else:
            t.text = ""

    _set_bar(_d_bar, d.unit.hp_frac(), "%d / %d" % [int(d.unit.hp), int(d.unit.max_hp)])
    _d_total.text = str(int(d.total))
    _d_last.text = str(int(d.last_hit))
    _d_dps.text = str(int(d.dps))
    var fx := ""
    for e in d.unit.status.list:
        fx += "%s %.1fs   " % [e["type"], e["rem"]]
    _d_fx.text = fx if fx != "" else "Efeitos: nenhum"
    _d_fx.add_theme_color_override("font_color", URUCUM if fx != "" else ARGILA)
    if game.ally != null:
        var syn := "Ressonâncias\n"
        for rule_id in LSynergy.RULES:
            var r: float = game.sim.synergy.remaining(p.team, rule_id)
            syn += "%s: %s\n" % [LSynergy.RULES[rule_id]["name"], ("%ds" % ceili(r)) if r > 0.0 else "pronta"]
        _synergy.text = syn
        _synergy.visible = true
    else:
        _synergy.visible = false
    _move_button.set_pressed_no_signal(d.moving)
    _help_button.set_pressed_no_signal(_help.visible)
    _hint.visible = Input.mouse_mode != Input.MOUSE_MODE_CAPTURED and not _help.visible

func set_help_visible(v: bool) -> void:
    _help.visible = v

func is_help_visible() -> bool:
    return _help.visible
