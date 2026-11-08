class_name LCharacters
extends RefCounted
## Dados das entidades jogáveis desta versão de teste (mesmos números do núcleo C#).

const IDS: Array[String] = ["saci", "boitata", "curupira"]

static func kit(id: String) -> LKit:
    match id:
        "boitata":
            return LBoitataKit.new()
        "curupira":
            return LCurupiraKit.new()
        _:
            return LSaciKit.new()

static func stats(id: String) -> LStats:
    var s := LStats.new()

    match id:
        "boitata":
            s.display_name = "Boitatá"
            s.role = "Dano em área e controle"
            s.color = Color(1.0, 0.48, 0.1)
            s.lore = "Mbaê-tatá, a cobra de fogo que protege os campos de quem os incendeia. Corpo de escamas luminosas e olhos que ofuscam."
            s.passive_name = "Chama Vigilante"
            s.passive_desc = "Mover-se gera Calor (até 100); parado, esfria. Calor aumenta o dano em até 20%. Acima de 60 o corpo inteiro queima quem encosta. O corpo é segmentado e bloqueia inimigos."
            s.max_hp = 640.0
            s.speed = 5.6
            s.radius = 0.8
            s.basic_damage = 46.0
            s.basic_range = 2.8
            s.basic_arc = 80.0
            s.basic_interval = 0.85
            s.regen = 5.0
            s.abilities = [
                LAbility.make("Bote Incandescente", 0.85, 0.0, 2.8, 0.0, "cone", 80.0, "Bote rápido com presas de brasa."),
                LAbility.make("Investida Flamejante", 8.0, 25.0, 9.0, 1.6, "line", 0.0, "Avança 9 m em linha serpenteante: 70 de dano (mais com Calor) e arremesso. +20 de Calor."),
                LAbility.make("Olhar Incandescente", 13.0, 30.0, 8.0, 0.0, "cone", 60.0, "Onda de luz em cone: 25 de dano, Ofusca por 2,2 s (ataques básicos falham) e 30% de lentidão."),
                LAbility.make("Rastro de Fogo", 14.0, 30.0, 0.0, 1.3, "none", 0.0, "Por 4 s a cauda deixa uma trilha de fogo (24 de dano por segundo). +15% de velocidade. Quem salta não é atingido."),
                LAbility.make("Serpente do Incêndio Celestial", 80.0, 0.0, 0.0, 5.0, "circle", 0.0, "Forma gigante por 6 s: corpo maior e mais longo, +35% de velocidade, Imparável, Calor máximo e onda de fogo a cada 0,8 s (42 de dano, 5 m)."),
            ]
        "curupira":
            s.display_name = "Curupira"
            s.role = "Fogo, mobilidade e território"
            s.color = Color(1.0, 0.23, 0.07)
            s.lore = "Guardião da mata de pés virados para trás e cabelos que ardem. Quem segue suas pegadas anda para longe dele — e aqui elas explodem."
            s.passive_name = "Combustão Natural · Domínio Térmico"
            s.passive_desc = "Acertos geram Calor (básico +12, habilidades +6). Sem acertar por 3 s, esfria. Com Calor ≥ 60 tudo incendeia o alvo e ele fica 10% mais rápido. O Calor aumenta chamas, raio do círculo e dano das pegadas e da Suprema."
            s.max_hp = 600.0
            s.speed = 6.2
            s.radius = 0.5
            s.basic_damage = 42.0
            s.basic_range = 2.4
            s.basic_arc = 90.0
            s.basic_interval = 0.65
            s.regen = 5.5
            s.abilities = [
                LAbility.make("Golpe em Brasa", 0.65, 0.0, 2.4, 0.0, "cone", 90.0, "Golpe com o punho em brasa. +12 de Calor por acerto."),
                LAbility.make("Chamas Invertidas", 7.0, 25.0, 12.0, 0.8, "line", 0.0, "Sequência de chamas em trajetória sinuosa: 3 chamas, +1 a cada 33 de Calor. 40 de dano cada."),
                LAbility.make("Passos Incandescentes", 9.0, 20.0, 7.0, 1.0, "line", 0.0, "Avança 7 m deixando pegadas de fogo viradas para trás que explodem após 1,5 s (50 de dano em 2 m, mais com Calor)."),
                LAbility.make("Fogo Guardião", 15.0, 35.0, 8.0, 4.5, "area", 0.0, "Círculo de chamas por 5 s (raio 4,5 a 6 m). Inimigos que cruzam a borda queimam e são empurrados para fora."),
                LAbility.make("Ira do Curupira", 75.0, 0.0, 0.0, 7.0, "circle", 0.0, "Explosão de fogo (120 de dano em 7 m, até +50% com Calor). A região arde por 5 s e a cada 0,5 s uma labareda dispara para onde você mira."),
            ]
        _:
            s.display_name = "Saci-Pererê"
            s.role = "Mobilidade e confusão"
            s.color = Color(0.78, 0.2, 0.12)
            s.lore = "Vive nos redemoinhos das estradas de terra, de carapuça vermelha e uma perna só. Engana com ilusões e nunca está onde parece."
            s.passive_name = "Travessura"
            s.passive_desc = "Cada mudança brusca de direção acumula Travessura (até 4): +7% de velocidade e 4% de redução de dano por acúmulo, por 2 s."
            s.max_hp = 580.0
            s.speed = 6.4
            s.radius = 0.45
            s.basic_damage = 44.0
            s.basic_range = 2.2
            s.basic_arc = 100.0
            s.basic_interval = 0.55
            s.regen = 6.0
            s.abilities = [
                LAbility.make("Pulo-Chute", 0.55, 0.0, 2.2, 0.0, "cone", 100.0, "Chute giratório com a única perna."),
                LAbility.make("Redemoinho", 9.0, 25.0, 0.0, 1.2, "circle", 0.0, "Vira um redemoinho por 1,8 s: +75% de velocidade, atravessa inimigos (70 de dano e empurrão) e deixa uma âncora de redemoinho no fim."),
                LAbility.make("Troca-Troca", 12.0, 20.0, 9.0, 0.6, "line", 0.0, "Cria uma ilusão que corre na direção mirada. Após 1,4 s (ou ao apertar de novo) o Saci troca de lugar com ela."),
                LAbility.make("Vento Travesso", 10.0, 30.0, 9.0, 0.0, "cone", 70.0, "Rajada em cone: 35 de dano, empurra 4 m e aplica Ventania (o vento arrasta o movimento do alvo por 2 s)."),
                LAbility.make("Reino dos Redemoinhos", 70.0, 0.0, 8.0, 10.0, "area", 0.0, "Área de vento (10 m, 7 s) com 4 redemoinhos; inimigos ficam 25% mais lentos. Aperte de novo para saltar ao redemoinho mais perto da mira (80 de dano ao chegar)."),
            ]
    return s
