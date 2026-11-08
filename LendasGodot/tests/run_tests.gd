extends SceneTree
## Testes da simulação (portados da suíte NUnit do núcleo C#).
## Rodar: godot --headless --path LendasGodot --script res://tests/run_tests.gd
## Sai com código 0 se tudo passar.

var _passed := 0
var _failed := 0
var _current := ""

func _init() -> void:
    var tests := [
        "test_basic_attack", "test_basic_attack_misses_behind", "test_dodge", "test_jump_avoids_fire",
        "test_sprint", "test_shield", "test_friendly_fire", "test_cooldowns",
        "test_saci_travessura", "test_saci_redemoinho", "test_saci_troca_troca", "test_saci_troca_antecipada",
        "test_saci_ilusao_quebra", "test_saci_vento", "test_saci_reino",
        "test_boitata_calor", "test_boitata_corpo_segmentado", "test_boitata_corpo_queima", "test_boitata_investida",
        "test_boitata_olhar", "test_boitata_rastro", "test_boitata_suprema",
        "test_curupira_combustao", "test_curupira_chamas", "test_curupira_passos", "test_curupira_fogo_guardiao",
        "test_curupira_ira", "test_sinergia_tempestade", "test_sinergia_exige_fogo_aliado", "test_sinergia_brasa",
        "test_sinergia_curupira", "test_boneco_nao_morre", "test_todas_habilidades_no_boneco", "test_aliado_bot",
    ]
    for t in tests:
        _current = t
        var before := _failed
        call(t)
        if _failed == before:
            _passed += 1
            print("  ok    ", t)
    print("\n%d testes passaram, %d falharam" % [_passed, _failed])
    quit(0 if _failed == 0 else 1)

func check(cond: bool, msg: String) -> void:
    if not cond:
        _failed += 1
        printerr("  FALHA ", _current, ": ", msg)

# ------------------------------------------------------------------ utilidades

class Duel:
    var sim: LSim
    var a: LChampion
    var b: LChampion

func duel(a_id: String, b_id: String) -> Duel:
    var d := Duel.new()
    d.sim = LSim.new()
    d.sim.infinite = false
    d.a = d.sim.add_champion(0, a_id, "A", false)
    d.b = d.sim.add_champion(1, b_id, "B", false)
    d.a.pos = Vector2(-10, 0)
    d.b.pos = Vector2(-6, 0)
    return d

func press(sim: LSim, c: LChampion, buttons: int, aim: Vector2, move: Vector2 = Vector2.ZERO) -> void:
    var cmd := LCommand.new()
    cmd.pressed = buttons
    cmd.aim = aim
    cmd.move = move
    sim.events.clear()
    sim.set_command(c.id, cmd)
    sim.step()

func hold(sim: LSim, c: LChampion, move: Vector2, aim: Vector2, seconds: float, attack: bool = false) -> void:
    for i in range(int(seconds * 30.0)):
        var cmd := LCommand.new()
        cmd.move = move
        cmd.aim = aim
        cmd.attack = attack
        sim.events.clear()
        sim.set_command(c.id, cmd)
        sim.step()

func has_event(sim: LSim, type: String) -> bool:
    for e in sim.events:
        if e["type"] == type:
            return true
    return false

func count_zones(sim: LSim, kind: String) -> int:
    var n := 0
    for z in sim.zones:
        if z.kind == kind:
            n += 1
    return n

# ------------------------------------------------------------------ combate

func test_basic_attack() -> void:
    var d := duel("saci", "boitata")
    d.b.pos = d.a.pos + Vector2(1.5, 0)
    var hp := d.b.hp
    hold(d.sim, d.a, Vector2.ZERO, d.b.pos, 0.1, true)
    check(absf(d.b.hp - (hp - d.a.stats.basic_damage)) < 0.5, "um golpe = dano básico (%f)" % (hp - d.b.hp))
    hold(d.sim, d.a, Vector2.ZERO, d.b.pos, 0.3, true)
    check(absf(d.b.hp - (hp - d.a.stats.basic_damage)) < 0.5, "intervalo respeitado")

func test_basic_attack_misses_behind() -> void:
    var d := duel("saci", "boitata")
    d.b.pos = d.a.pos + Vector2(1.5, 0)
    var hp := d.b.hp
    hold(d.sim, d.a, Vector2.ZERO, d.a.pos - Vector2(3, 0), 0.1, true)
    check(d.b.hp == hp, "não acerta pelas costas")

func test_dodge() -> void:
    var d := duel("saci", "boitata")
    var start := d.a.pos
    press(d.sim, d.a, LCommand.DODGE, d.a.pos, Vector2(0, 1))
    check(d.a.invuln > 0.0, "invulnerável")
    check(d.sim.damage(d.b, d.a, 100.0) == 0.0, "dano ignorado na esquiva")
    hold(d.sim, d.a, Vector2.ZERO, d.a.pos, 0.3)
    check(start.distance_to(d.a.pos) > 4.0, "desloca ~5 m")

func test_jump_avoids_fire() -> void:
    var d := duel("boitata", "saci")
    d.sim.add_zone("fogo", d.a, d.b.pos, 2.0, 3.0)
    press(d.sim, d.b, LCommand.JUMP, d.b.pos)
    var hp := d.b.hp
    hold(d.sim, d.b, Vector2.ZERO, d.b.pos, 0.5)
    check(d.b.hp == hp, "no ar não queima")
    hold(d.sim, d.b, Vector2.ZERO, d.b.pos, 1.0)
    check(d.b.hp < hp, "no chão queima")

func test_sprint() -> void:
    var d := duel("boitata", "saci")
    var normal := d.sim.speed(d.a)
    var cmd := LCommand.new()
    cmd.move = Vector2(0, 1)
    cmd.sprint = true
    cmd.aim = d.a.pos + Vector2(0, 1)
    d.sim.set_command(d.a.id, cmd)
    d.sim.step()
    check(d.a.sprinting, "correndo")
    check(d.sim.speed(d.a) > normal * 1.2, "mais rápido")
    check(d.a.stamina < 100.0, "gasta fôlego")

func test_shield() -> void:
    var d := duel("saci", "boitata")
    d.sim.apply_status(d.b, LStatus.ESCUDO, 5.0, 50.0, null)
    var hp := d.b.hp
    d.sim.damage(d.a, d.b, 80.0)
    check(absf(d.b.hp - (hp - 30.0)) < 0.01, "escudo absorve 50")

func test_friendly_fire() -> void:
    var sim := LSim.new()
    var a1 := sim.add_champion(0, "saci", "a1", false)
    var a2 := sim.add_champion(0, "boitata", "a2", false)
    check(sim.damage(a1, a2, 100.0) == 0.0, "sem dano em aliado")
    check(not sim.apply_status(a2, LStatus.ATORD, 1.0, 1.0, a1), "sem controle em aliado")

func test_cooldowns() -> void:
    var d := duel("saci", "boitata")
    check(d.sim.try_cast(d.a, 3, d.a.pos + Vector2.RIGHT), "lança")
    check(not d.sim.try_cast(d.a, 3, d.a.pos + Vector2.RIGHT), "em recarga")
    d.a.energy = 0.0
    check(not d.sim.try_cast(d.a, 1, d.a.pos + Vector2.RIGHT), "sem energia")
    d.a.energy = 100.0
    check(not d.sim.try_cast(d.a, 4, d.a.pos), "suprema sem carga")

# ------------------------------------------------------------------ Saci

func test_saci_travessura() -> void:
    var d := duel("saci", "boitata")
    var kit := d.a.kit as LSaciKit
    for dir in [Vector2(0, 1), Vector2(1, 0), Vector2(0, -1), Vector2(-1, 0), Vector2(0, 1)]:
        hold(d.sim, d.a, dir, d.a.pos + dir, 0.35)
    check(kit.stacks == LSaciKit.MAX_STACKS, "4 acúmulos (%d)" % kit.stacks)
    hold(d.sim, d.a, Vector2(0, 1), d.a.pos + Vector2(0, 1), 2.2)
    check(kit.stacks == 0, "acúmulos expiram")

func test_saci_redemoinho() -> void:
    var d := duel("saci", "boitata")
    var kit := d.a.kit as LSaciKit
    var base := d.sim.speed(d.a)
    press(d.sim, d.a, LCommand.H1, d.b.pos)
    check(kit.is_tornado(), "virou redemoinho")
    check(d.sim.speed(d.a) > base * 1.7, "+75% velocidade")
    var hp := d.b.hp
    hold(d.sim, d.a, Vector2.RIGHT, d.b.pos, 1.9)
    check(absf((hp - d.b.hp) - 70.0) < 1.0, "um acerto de 70 (%f)" % (hp - d.b.hp))
    check(count_zones(d.sim, "ancora") >= 1, "deixa âncora")

func test_saci_troca_troca() -> void:
    var d := duel("saci", "boitata")
    var start := d.a.pos
    press(d.sim, d.a, LCommand.H2, start + Vector2(0, 9))
    check(d.sim.decoys.size() == 1, "criou ilusão")
    hold(d.sim, d.a, Vector2.ZERO, d.a.pos, 1.5)
    check(d.a.pos.y - start.y > 5.0, "trocou de lugar com a ilusão")

func test_saci_troca_antecipada() -> void:
    var d := duel("saci", "boitata")
    var start := d.a.pos
    press(d.sim, d.a, LCommand.H2, start + Vector2(0, 9))
    hold(d.sim, d.a, Vector2.ZERO, d.a.pos, 0.5)
    press(d.sim, d.a, LCommand.H2, d.a.pos)
    check(has_event(d.sim, "swap"), "reativar troca na hora")
    check(d.a.pos.y - start.y > 2.0, "posição trocada")

func test_saci_ilusao_quebra() -> void:
    var d := duel("saci", "boitata")
    var decoy := d.sim.add_decoy(d.a, d.b.pos + Vector2(1.5, 0), Vector2(0, 1), 0.0, 3.0)
    hold(d.sim, d.b, Vector2.ZERO, decoy.pos, 0.1, true)
    check(not decoy.alive, "ilusão some ao ser atingida")
    check(d.a.hp == d.a.max_hp, "Saci não recebe dano")

func test_saci_vento() -> void:
    var d := duel("saci", "boitata")
    var before := d.b.pos
    press(d.sim, d.a, LCommand.H3, d.b.pos)
    check(d.b.status.has(LStatus.VENT), "Ventania aplicada")
    hold(d.sim, d.a, Vector2.ZERO, d.b.pos, 0.4)
    check(d.b.pos.x - before.x > 3.0, "empurrado")

func test_saci_reino() -> void:
    var d := duel("saci", "boitata")
    d.a.ult = 100.0
    press(d.sim, d.a, LCommand.ULT, d.a.pos)
    var kit := d.a.kit as LSaciKit
    check(kit.realm_active(), "reino ativo")
    hold(d.sim, d.a, Vector2.ZERO, d.a.pos, 0.3)
    check(d.b.status.has(LStatus.LENT), "inimigo lento")
    var from := d.a.pos
    press(d.sim, d.a, LCommand.ULT, d.a.pos + Vector2(0, 6))
    check(has_event(d.sim, "blink"), "saltou")
    check(from.distance_to(d.a.pos) > 3.0, "mudou de lugar")

# ------------------------------------------------------------------ Boitatá

func test_boitata_calor() -> void:
    var d := duel("boitata", "saci")
    var kit := d.a.kit as LBoitataKit
    hold(d.sim, d.a, Vector2(0, 1), d.a.pos + Vector2(0, 1), 5.0)
    check(kit.heat > 60.0, "esquenta andando (%f)" % kit.heat)
    check(kit.damage_mult() > 1.12, "Calor aumenta dano")
    hold(d.sim, d.a, Vector2.ZERO, d.a.pos, 4.0)
    check(kit.heat < 10.0, "esfria parado")

func test_boitata_corpo_segmentado() -> void:
    var d := duel("boitata", "saci")
    d.a.pos = Vector2(-10, -10)
    var kit := d.a.kit as LBoitataKit
    hold(d.sim, d.a, Vector2(0, 1), d.a.pos + Vector2(0, 1), 2.0)
    hold(d.sim, d.a, Vector2.RIGHT, d.a.pos + Vector2.RIGHT, 0.6)
    check(kit.segments.size() == LBoitataKit.SEGS, "7 segmentos")
    var last := kit.segments[kit.segments.size() - 1]
    check(last.x < d.a.pos.x - 1.0 and last.y < d.a.pos.y - 0.5, "cauda segue o caminho")

func test_boitata_corpo_queima() -> void:
    var d := duel("boitata", "saci")
    d.a.pos = Vector2(-10, -16)
    var kit := d.a.kit as LBoitataKit
    hold(d.sim, d.a, Vector2(0, 1), d.a.pos + Vector2(0, 1), 6.0)
    check(kit.heat >= LBoitataKit.BURNING_HEAT, "Calor alto")
    d.b.pos = kit.segments[3]
    var cmd := LCommand.new()
    cmd.move = Vector2(0, 1)
    cmd.aim = d.a.pos + Vector2(0, 1)
    d.sim.set_command(d.a.id, cmd)
    d.sim.step()
    var min_d := INF
    for s in kit.segments:
        min_d = minf(min_d, s.distance_to(d.b.pos))
    check(min_d >= LBoitataKit.SEG_RADIUS + d.b.radius - 0.25, "empurrado para fora do corpo (%f)" % min_d)
    check(d.b.status.has(LStatus.QUEIM), "queimado pelo corpo")

func test_boitata_investida() -> void:
    var d := duel("boitata", "saci")
    var start := d.a.pos
    var hp := d.b.hp
    press(d.sim, d.a, LCommand.H1, d.b.pos)
    hold(d.sim, d.a, Vector2.ZERO, d.b.pos, 0.7)
    check(d.a.pos.x - start.x > 6.0, "avança")
    check(d.b.hp < hp - 60.0, "causa dano")

func test_boitata_olhar() -> void:
    var d := duel("boitata", "saci")
    press(d.sim, d.a, LCommand.H2, d.b.pos)
    check(d.b.status.has(LStatus.OFUSC), "ofuscado")
    d.a.pos = d.b.pos + Vector2(-1.2, 0)
    var hp := d.a.hp
    hold(d.sim, d.b, Vector2.ZERO, d.a.pos, 0.1, true)
    check(d.a.hp == hp, "ataque básico falha")

func test_boitata_rastro() -> void:
    var d := duel("boitata", "saci")
    press(d.sim, d.a, LCommand.H3, d.a.pos)
    hold(d.sim, d.a, Vector2(0, 1), d.a.pos + Vector2(0, 1), 2.0)
    check(count_zones(d.sim, "fogo") >= 4, "trilha de fogo")

func test_boitata_suprema() -> void:
    var d := duel("boitata", "saci")
    d.a.ult = 100.0
    press(d.sim, d.a, LCommand.ULT, d.a.pos)
    var kit := d.a.kit as LBoitataKit
    check(kit.giant_form(), "forma gigante")
    check(not d.sim.apply_status(d.a, LStatus.ATORD, 1.0, 1.0, d.b), "imparável")
    hold(d.sim, d.a, Vector2(0, 1), d.a.pos + Vector2(0, 1), 1.0)
    check(kit.segments.size() == LBoitataKit.GIANT_SEGS, "corpo mais longo")
    check(d.b.hp < d.b.max_hp, "onda de fogo atinge")

# ------------------------------------------------------------------ Curupira

func test_curupira_combustao() -> void:
    var d := duel("curupira", "boitata")
    var kit := d.a.kit as LCurupiraKit
    d.b.pos = d.a.pos + Vector2(1.5, 0)
    d.b.max_hp = 99999.0
    d.b.hp = 99999.0
    hold(d.sim, d.a, Vector2.ZERO, d.b.pos, 3.5, true)
    check(kit.is_hot(), "incandescente (%f)" % kit.heat)
    check(d.b.status.has(LStatus.QUEIM), "ataques incendeiam")
    var heat := kit.heat
    hold(d.sim, d.a, Vector2.ZERO, d.a.pos - Vector2(5, 0), 5.0)
    check(kit.heat < heat - 15.0, "esfria sem acertar")

func test_curupira_chamas() -> void:
    var d := duel("curupira", "boitata")
    var kit := d.a.kit as LCurupiraKit
    d.b.pos = d.a.pos + Vector2(8, 0)
    d.b.max_hp = 99999.0
    d.b.hp = 99999.0
    press(d.sim, d.a, LCommand.H1, d.b.pos)
    var lateral := false
    var hits := 0
    for i in range(40):
        var cmd := LCommand.new()
        cmd.aim = d.b.pos
        d.sim.events.clear()
        d.sim.set_command(d.a.id, cmd)
        d.sim.step()
        for f in kit.flames:
            if absf((f["pos"] as Vector2).y - d.a.pos.y) > 0.5:
                lateral = true
        for e in d.sim.events:
            if e["type"] == "projectile_hit":
                hits += 1
    check(lateral, "trajetória sinuosa")
    check(hits >= 2, "chamas acertam (%d)" % hits)

func test_curupira_passos() -> void:
    var d := duel("curupira", "boitata")
    var start := d.a.pos
    d.b.pos = start + Vector2(3, 1)
    var hp := d.b.hp
    press(d.sim, d.a, LCommand.H2, start + Vector2(7, 0))
    hold(d.sim, d.a, Vector2.ZERO, d.a.pos, 0.5)
    check(d.a.pos.x - start.x > 5.0, "avançou")
    check(count_zones(d.sim, "pegada") >= 4, "pegadas")
    check(d.b.hp == hp, "ainda não explodiu")
    d.b.pos = start + Vector2(3, 1)
    hold(d.sim, d.a, Vector2.ZERO, d.a.pos, 1.6)
    check(d.b.hp < hp - 40.0, "pegadas explodem")

func test_curupira_fogo_guardiao() -> void:
    var d := duel("curupira", "boitata")
    press(d.sim, d.a, LCommand.H3, d.a.pos)
    var ring: LZone = null
    for z in d.sim.zones:
        if z.kind == "circulo":
            ring = z
    check(ring != null, "círculo criado")
    if ring == null:
        return
    d.b.pos = ring.pos + Vector2(ring.radius + 2.0, 0)
    var hp := d.b.hp
    for i in range(60):
        var cmd := LCommand.new()
        cmd.move = Vector2.LEFT
        cmd.aim = ring.pos
        d.sim.set_command(d.b.id, cmd)
        d.sim.step()
    check(d.b.pos.distance_to(ring.pos) > ring.radius - 0.5, "não atravessa a borda")
    check(d.b.hp < hp, "queima na borda")

func test_curupira_ira() -> void:
    var d := duel("curupira", "boitata")
    var kit := d.a.kit as LCurupiraKit
    d.a.ult = 100.0
    d.b.pos = d.a.pos + Vector2(3, 0)
    d.b.max_hp = 99999.0
    d.b.hp = 99999.0
    var hp := d.b.hp
    press(d.sim, d.a, LCommand.ULT, d.b.pos)
    check(hp - d.b.hp >= 120.0, "explosão")
    check(kit.wrath_active(), "região em chamas")
    d.b.pos = d.a.pos + Vector2(0, 6)
    d.b.forced_time = 0.0
    hold(d.sim, d.a, Vector2.ZERO, d.a.pos + Vector2(0, 5), 0.1)
    check(kit.jet_dir.y > 0.9, "labaredas seguem a mira")
    var before := d.b.hp
    hold(d.sim, d.a, Vector2.ZERO, d.a.pos + Vector2(0, 5), 1.2)
    check(d.b.hp < before - 30.0, "labaredas acertam")

# ------------------------------------------------------------------ sinergias

func _pair(fire_owner_char: String) -> Array:
    var sim := LSim.new()
    sim.infinite = false
    var saci := sim.add_champion(0, "saci", "saci", false)
    var partner := sim.add_champion(0, fire_owner_char, "parceiro", false)
    var enemy := sim.add_champion(1, "boitata", "inimigo", false)
    saci.pos = Vector2(-10, 0)
    partner.pos = Vector2(-10, 5)
    enemy.pos = Vector2(-4, 0)
    return [sim, saci, partner, enemy]

func test_sinergia_tempestade() -> void:
    var p := _pair("boitata")
    var sim: LSim = p[0]
    sim.add_zone("fogo", p[2], Vector2(-8, 0), 1.3, 3.5)
    press(sim, p[1], LCommand.H1, p[3].pos)
    hold(sim, p[1], Vector2.RIGHT, p[3].pos, 0.6)
    check(count_zones(sim, "tempestade") == 1, "tornado de brasas")
    check(not sim.synergy.is_ready(0, "brasa"), "bloqueio global da equipe")

func test_sinergia_exige_fogo_aliado() -> void:
    var p := _pair("boitata")
    var sim: LSim = p[0]
    sim.add_zone("fogo", p[3], Vector2(-8, 0), 1.3, 3.5)
    press(sim, p[1], LCommand.H1, p[3].pos)
    hold(sim, p[1], Vector2.RIGHT, p[3].pos, 0.6)
    check(count_zones(sim, "tempestade") == 0, "fogo inimigo não conta")

func test_sinergia_brasa() -> void:
    var p := _pair("boitata")
    var sim: LSim = p[0]
    sim.add_zone("fogo", p[2], Vector2(-7, 0), 1.3, 3.5)
    press(sim, p[1], LCommand.H3, p[3].pos)
    check((p[3] as LChampion).status.has(LStatus.QUEIM), "vento espalha brasas")
    check(has_event(sim, "synergy"), "evento de ressonância")

func test_sinergia_curupira() -> void:
    var p := _pair("curupira")
    var sim: LSim = p[0]
    sim.add_zone("circulo", p[2], Vector2(-7, 0), 2.0, 5.0)
    press(sim, p[1], LCommand.H1, p[3].pos)
    hold(sim, p[1], Vector2.RIGHT, p[3].pos, 0.6)
    check(count_zones(sim, "tempestade") == 1, "fogo do Curupira alimenta a Tempestade de Brasas")

# ------------------------------------------------------------------ arena

func _arena(char_id: String) -> Array:
    var sim := LSim.new()
    var player := sim.add_champion(0, char_id, "Jogador", false)
    player.pos = Vector2(-4, 0)
    var dummy := LTrainingDummy.new(sim, Vector2(2, 0))
    return [sim, player, dummy]

func _tick(sim: LSim, dummy: LTrainingDummy, p: LChampion, cmd: LCommand) -> void:
    sim.events.clear()
    sim.set_command(p.id, cmd)
    sim.step()
    dummy.after_step()

func test_boneco_nao_morre() -> void:
    var a := _arena("boitata")
    var sim: LSim = a[0]
    var dummy: LTrainingDummy = a[2]
    sim.damage(a[1], dummy.unit, 99999.0)
    dummy.after_step()
    check(dummy.unit.alive and dummy.unit.hp == dummy.unit.max_hp, "volta com vida cheia")

func test_todas_habilidades_no_boneco() -> void:
    for char_id in LCharacters.IDS:
        var a := _arena(char_id)
        var sim: LSim = a[0]
        var p: LChampion = a[1]
        var dummy: LTrainingDummy = a[2]
        for slot in [1, 2, 3, 4]:
            p.pos = Vector2(-1.5, 0)
            dummy.reset()
            var affected := false
            var cmd := LCommand.new()
            cmd.pressed = LCommand.SLOT_BTN[slot]
            cmd.aim = dummy.unit.pos
            _tick(sim, dummy, p, cmd)
            for i in range(60):
                var c2 := LCommand.new()
                c2.move = (dummy.unit.pos - p.pos).normalized()
                c2.aim = dummy.unit.pos
                _tick(sim, dummy, p, c2)
                if dummy.unit.status.list.size() > 0 or has_event(sim, "swap"):
                    affected = true
                for z in sim.zones:
                    if z.owner_id == p.id and z.pos.distance_to(dummy.unit.pos) <= z.radius + 1.0:
                        affected = true
            affected = affected or dummy.total > 0.0
            check(affected, "%s habilidade %d afeta o boneco" % [char_id, slot])

func test_aliado_bot() -> void:
    var a := _arena("saci")
    var sim: LSim = a[0]
    var p: LChampion = a[1]
    var dummy: LTrainingDummy = a[2]
    var ally := sim.add_champion(0, "curupira", "aliado", true)
    ally.pos = Vector2(-6, 4)
    var casts := 0
    for i in range(30 * 15):
        var cmd := LCommand.new()
        cmd.aim = dummy.unit.pos
        _tick(sim, dummy, p, cmd)
        for e in sim.events:
            if e["type"] == "cast" and e["src"] == ally.id:
                casts += 1
    check(dummy.total > 200.0, "aliado causa dano (%f)" % dummy.total)
    check(casts > 2, "aliado usa habilidades (%d)" % casts)
