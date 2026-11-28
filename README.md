# Vila dos Bichinhos (Godot 4)

Um jogo 2D fofinho em pixel art. Você é um cachorrinho caramelo de lencinho vermelho que
passeia pela vila e **conversa digitando** com três bichinhos que têm IA:

| Bichinho | Quem é | Casa |
|---|---|---|
| **Pipoca**, coelhinha | Confeiteira doce e carinhosa, um pouco tímida. Fica magoada com grosseria. | Telhado rosa |
| **Biscoito**, gatinho | Preguiçoso, convencido e engraçado. Responde xingamento com provocação. | Telhado azul |
| **Bolinho**, pandinha | Calmo, sábio e dorminhoco. Adora curiosidades e conselhos. | Telhado verde |

O que eles fazem:

- **Respondem a qualquer coisa**: escola, futebol, contas, perguntas, sentimentos…
- **Reagem a xingamentos**: ficam magoados ou bravos, e depois de muita grosseria só voltam a
  conversar se você **pedir desculpas**.
- **Lembram de você**: seu nome, do que você gosta e como você os tratou (fica salvo entre partidas).
- **Fazem fofoca**: se você xingar a Pipoca, o Biscoito pode ficar sabendo.
- **Mostram emoções**: animações de feliz, triste, bravo e surpreso, balõezinhos (coração, raiva,
  lágrima, !, ?, música, zzz…) e corações de amizade na caixa de diálogo.

## Como jogar

1. Instale o **Godot 4.4** ou mais novo: <https://godotengine.org/download>
2. No Godot, clique em **Importar** e escolha o `project.godot` desta pasta.
3. Aperte **F5**.

| Tecla | Ação |
|---|---|
| WASD ou setas | andar |
| E | conversar com o bichinho perto de você |
| Enter | enviar a mensagem |
| Esc | sair da conversa |
| F1 | configurar a IA |

## Ligando a IA de verdade (Claude)

Sem configurar nada, os bichinhos usam o **cérebro offline**: ele entende cumprimentos,
xingamentos, desculpas, elogios, o seu nome, contas e perguntas, e sempre comenta o que você
falou. Mas para eles conversarem **de verdade** sobre qualquer assunto, ligue a IA:

1. Crie uma chave de API em <https://console.anthropic.com/> (é pago por uso; peça ajuda a um adulto).
2. No jogo, aperte **F1**, cole a chave e clique em **Salvar**.
3. Clique em **Testar conexão**. No canto da tela deve aparecer `IA: ligada`.

A chave fica guardada só no seu computador (na pasta de dados do jogo, `user://`).
Também funciona colocar a chave na variável de ambiente `ANTHROPIC_API_KEY` ou num arquivo
`claude_config.cfg` (veja `claude_config.example.cfg`; ele está no `.gitignore`).

Na tela F1 dá para escolher o modelo: **Opus 5.5** (o mais esperto, padrão),
**Sonnet 5.5** (mais rápido) ou **Haiku 5.5** (o mais barato).

> **Antes de publicar o jogo:** se você exportar o jogo com uma chave dentro, qualquer jogador
> consegue pegar a chave e gastar seus créditos. Para um jogo público, use um servidor pequeno
> entre o jogo e a API (só o servidor guarda a chave).

## A arte (Pixelwright)

Todos os desenhos foram feitos no Pixelwright, no projeto **"Vila dos Bichinhos"**, e
exportados para o Godot na pasta `sprites/`:

| Arquivo | O que é |
|---|---|
| `pipoca_coelha`, `biscoito_gato`, `bolinho_panda` (`.png` + `.tres`) | Os bichinhos, 64×64, com as animações `idle`, `talk`, `feliz`, `triste`, `bravo`, `surpreso` |
| `filhote_jogador-s/n/e/w` (`.png` + `.tres`) | O cachorrinho do jogador nas 4 direções, com `idle` e `walk` |
| `emotes.png` | 10 balõezinhos de emoção (16×16 cada) |
| `vila_chao.png` | O chão da vila (grama, flores e caminhos), 768×480 |
| `casinha.png` | A casinha nas 3 cores de telhado |
| `arvore.png`, `arbusto.png`, `laguinho.png` | Enfeites da vila |

Se mudar um desenho no Pixelwright, exporte de novo (preset **Godot** para personagens, **PNG**
para o resto) e substitua o arquivo em `sprites/`.

## Como funciona

| Arquivo | O que faz |
|---|---|
| `scripts/main.gd` | Monta a vila: chão, casas, árvores, bichinhos, jogador, câmera, HUD e conversas |
| `scripts/npc.gd` | O bichinho: animações, balões de emoção, prompt da IA e memória da conversa |
| `scripts/npc_profiles.gd` | A personalidade de cada bichinho e as falas do modo offline |
| `scripts/offline_brain.gd` | O cérebro offline (funciona sem internet e sem chave) |
| `scripts/claude_client.gd` | Fala com a API do Claude; a resposta vem em JSON (fala, emoção, amizade, o que lembrar, fofoca) |
| `scripts/game_state.gd` | Guarda a chave, a amizade, as memórias e as fofocas (salvas entre partidas) |
| `scripts/dialogue_ui.gd` | A caixa de diálogo com o retrato animado e os corações |
| `scripts/settings_ui.gd` | A tela F1 para colocar a chave e testar a conexão |
| `scripts/player.gd` | O cachorrinho do jogador |

Se a IA falhar (sem internet, chave errada, limite de uso), o bichinho responde com o cérebro
offline e a conversa mostra o motivo.

## Criando um bichinho novo

1. Desenhe o bichinho no Pixelwright com as animações `idle`, `talk`, `feliz`, `triste`, `bravo`
   e `surpreso`, e exporte no preset **Godot** para a pasta `sprites/`.
2. Em `scripts/npc_profiles.gd`, copie um dos perfis e mude o nome, a personalidade, o jeito de
   falar e as falas offline. Em `"sprite"`, coloque o `.tres` do novo bichinho.
3. Em `scripts/main.gd`, adicione em `NPC_SPOTS` onde ele fica na vila.
