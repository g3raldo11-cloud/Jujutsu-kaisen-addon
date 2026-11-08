# LENDAS: O DESPERTAR — versão de teste

Jogo 3D competitivo e original inspirado no folclore brasileiro, feito na **Unity** (C#).
Esta é uma **versão de teste**: uma **arena vazia com um boneco de treino** para experimentar
os poderes das entidades já implementadas.

## O que está pronto (e testado)

| Item | Estado |
|---|---|
| **Arena de Teste** (chão plano 40×40 m com grade de medição, poça d'água, moita) | ✅ |
| **Boneco de treino** (não morre, mede dano total / último golpe / DPS, mostra efeitos; pode andar) | ✅ |
| **Saci-Pererê** — Travessura, Redemoinho, Troca-Troca, Vento Travesso, Reino dos Redemoinhos | ✅ |
| **Boitatá** — Chama Vigilante, corpo segmentado, Investida Flamejante, Olhar Incandescente, Rastro de Fogo, Serpente do Incêndio Celestial | ✅ |
| **Curupira (versão de fogo)** — Combustão Natural, Chamas Invertidas, Passos Incandescentes, Fogo Guardião, Ira do Curupira, Domínio Térmico | ✅ |
| Combate base: ataque básico, esquiva (invulnerável), salto (evita fogo no chão), corrida com fôlego | ✅ |
| Ressonâncias (sinergias): *Tempestade de Brasas* e *Brasa ao Vento* (Saci + Boitatá/Curupira), com recargas anti-abuso | ✅ |
| Aliado bot opcional (para testar sinergias) | ✅ |
| Modelos 3D procedurais, partículas, sons sintetizados com áudio 3D, indicadores de alcance, HUD | ✅ (visual simples de protótipo) |

O núcleo também já contém (com testes automatizados, mas **sem** cena Unity ainda):
o Ciclo das Lendas (Ecos → Marcos → Coração), o mapa *Floresta Amazônica — Igarapé das Ruínas*,
eventos ambientais (Cheia do Rio, Névoa da Mata, Raízes Antigas, Assombrações), visão por equipe,
bots 5v5 que jogam partidas completas e progressão por domínio (só cosméticos/histórias).

### O que **não** está pronto
Os outros 12 personagens, os outros 4 mapas, multiplayer em rede, modelos/animações artísticos
finais e trilha sonora. Os modelos atuais são montados com formas geométricas em código — servem para
testar jogabilidade e silhueta, não são a arte final.

## Como abrir e jogar

1. Instale a **Unity 6 LTS (6000.0.x)** pelo Unity Hub (2022.3 LTS também deve funcionar).
2. No Hub: **Add → Add project from disk** e escolha a pasta `LendasODespertar/`.
3. Com o projeto aberto, use o menu **Lendas → Abrir Arena de Teste e dar Play**.
   (Alternativa: em qualquer cena vazia, apertar **Play** já monta a arena sozinha.)

Opcional: instale o pacote *Universal RP* no Package Manager e rode **Lendas → Configurar URP**.
Sem isso o jogo usa o pipeline embutido — os materiais funcionam nos dois.

### Controles

| Tecla | Ação |
|---|---|
| WASD | mover (relativo à câmera) |
| Mouse / roda | girar câmera e mirar / zoom |
| Clique esquerdo | ataque básico |
| **Q / E / F** | habilidades (segure para ver o alcance, solte para lançar) |
| **R** | Suprema (aperte de novo para reativar: salto do Saci) |
| Shift / Espaço / Ctrl ou clique direito | correr / saltar / esquivar |
| **1 / 2 / 3** | Saci / Boitatá / Curupira |
| Tab | liga/desliga aliado bot |
| M / Backspace | boneco anda / zerar boneco |
| H / Esc | ajuda / soltar o cursor |

Na arena, energia e Suprema são infinitas e as recargas são 4× mais rápidas, para testar à vontade.

## Arquitetura

```
LendasODespertar/Assets/Scripts/
  Core/    Simulação autoritativa (C# puro, sem UnityEngine) — tick fixo de 30 Hz, determinística.
           Characters/ (kits de cada entidade), Combat/, Match/ (regras, visão, eventos, sinergias),
           Map/ (mapas e navegação A*), AI/ (bots e assombrações), Progression/.
  Game/    Camada Unity: arena, vistas 3D procedurais, câmera, entrada, HUD, efeitos e áudio.
  Editor/  Menu "Lendas" (criar cena, incluir shaders, configurar URP).
tests/Lendas.Core.Tests/   58 testes NUnit (habilidades, objetivos, eventos, sinergias, bots, arena).
tests/BalanceProbe/        Roda dezenas de partidas de bots e mede vitórias/dano por entidade.
tools/UnityCompileCheck/   Compila todos os scripts contra as assemblies de referência da Unity.
```

A simulação não depende da Unity: o mesmo código pode rodar num servidor autoritativo (o cliente só envia
`PlayerCommand` e desenha o resultado). Isso também permite testar tudo sem abrir o Editor.

### Rodar os testes

```bash
dotnet test tests/Lendas.Core.Tests
```

```bash
./tools/fetch-unity-refs.sh && dotnet build tools/UnityCompileCheck
```

```bash
dotnet run -c Release --project tests/BalanceProbe -- 30 tri
```

## Balanceamento (medido com bots)

- Times mistos espelhados: vitórias equilibradas entre lados (ex.: 15×15, 11×9).
- Curupira × Boitatá (5 contra 5 da mesma entidade): 8×12 — equilibrado.
- **Pendência conhecida:** 5 Sacis contra 5 Boitatás/Curupiras perdem quase sempre. O Saci foi
  fortalecido (vida, dano, redução de dano na Travessura, Redemoinho passa por cima do corpo do Boitatá),
  mas ainda depende de aliados. Fica para a etapa de testes e balanceamento.

## Observação sobre esta entrega

A Unity não pôde ser executada no ambiente onde o código foi escrito (sem acesso à rede da Unity e sem
licença). Por isso a verificação foi: todos os scripts **compilam** contra a API da Unity e toda a lógica
de jogo roda nos **testes automatizados**. A parte visual (modelos, partículas, HUD) ainda precisa ser
conferida dentro do Editor — relate qualquer problema que aparecer ao dar Play.
