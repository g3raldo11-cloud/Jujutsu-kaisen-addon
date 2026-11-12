# LENDAS: O DESPERTAR — Arena de Teste (Godot 4)

Arena vazia com boneco de treino para testar os poderes de **Saci-Pererê**, **Boitatá** e **Curupira**.

## Como abrir

1. Baixe o **Godot 4** (versão comum, *não* precisa da versão .NET): https://godotengine.org/download
   Testado no Godot 4.6; deve funcionar do 4.4 em diante.
2. Abra o Godot → **Importar** → escolha o arquivo `project.godot` desta pasta.
3. Aperte **F5** (ou o botão ▶) para jogar.

## Controles

| Tecla | Ação |
|---|---|
| WASD | mover |
| Mouse | girar a câmera e mirar (clique na arena para prender o cursor) |
| Clique esquerdo | ataque básico |
| Q / E / F | habilidades — segure para ver o alcance, solte para lançar |
| R | Suprema (aperte de novo para reativar) |
| Shift / Espaço / Ctrl | correr / saltar / esquivar |
| 1 / 2 / 3 | Saci / Boitatá / Curupira |
| Tab | liga/desliga um aliado bot (para testar as combinações) |
| M / Backspace | boneco anda / zerar boneco |
| H / Esc | ajuda / soltar o cursor |

Controle (gamepad) também funciona.

## Testes automáticos

```bash
godot --headless --path . --import
```

```bash
godot --headless --path . --script res://tests/run_tests.gd
```

```bash
godot --headless --path . -- --autotest
```

## Modelos esculpidos no Blender

Os heróis usam os modelos de `assets/models/*.glb`, esculpidos por script no Blender (veja
`blender/README.md`): Curupira (~707 mil faces no Blender), Saci (~589 mil) e Boitatá (~744 mil); no
jogo vão versões dizimadas (~230 mil faces cada), com esqueleto. As juntas procedurais continuam
animando (passada, soco, cabelo, gorro) e giram os ossos do modelo; o corpo do Boitatá segue a
simulação. Apagando um `.glb`, o herói volta ao modelo procedural antigo.

Os mesmos scripts fazem renders realistas no **Cycles** (Blender 4.2+ ou módulo `bpy`): fogo
**simulado** (solver próprio gravado em OpenVDB), mata e cerrado com milhares de folhas, capim e
samambaias, cabelo crespo fio a fio, olhos com íris e córnea, céu físico e névoa com fachos de luz.
As imagens finais ficam em `blender/galeria/`.

## Organização

- `scripts/sim/` — regras do jogo (porte fiel do núcleo C# do projeto Unity): combate, efeitos,
  as três entidades, boneco, aliado bot e sinergias.
- `scripts/game/` — arena 3D, modelos procedurais, partículas, sons sintetizados, câmera e interface.
- `blender/` — scripts do Blender que esculpem, renderizam e exportam os heróis; `blender/galeria/`
  traz os renders realistas.
- `assets/models/` — os `.glb` exportados do Blender.
- `tests/` — 34 testes das regras.

Fontes: Londrina Solid e Chivo (licença SIL OFL, em `assets/fonts/`).
