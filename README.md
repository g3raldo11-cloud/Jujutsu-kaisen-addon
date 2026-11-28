# NPC que Conversa (IA) — Godot 4

Um jogo 2D pequeno em Godot 4 onde você anda pelo pátio de uma escola de feiticeiros e
**conversa por texto com NPCs controlados por IA** (Claude, da Anthropic).
Cada NPC tem personalidade própria e lembra do que você já falou com ele.

Sem chave de API o jogo também funciona: os NPCs usam falas prontas (modo offline).

## Como jogar

1. Instale o **Godot 4.4** ou mais novo: <https://godotengine.org/download>
2. No Godot, clique em **Importar** e escolha o arquivo `project.godot` desta pasta.
3. Aperte **F5** para rodar.

| Tecla | Ação |
|---|---|
| WASD ou setas | andar |
| E | conversar com o NPC próximo |
| Enter | enviar mensagem |
| Esc | fechar a conversa |

## Ligando a IA (Claude)

1. Crie uma chave de API em <https://console.anthropic.com/> (é pago por uso).
2. Copie `claude_config.example.cfg` para **`claude_config.cfg`** e cole sua chave em `api_key`.
   Outra opção é definir a variável de ambiente `ANTHROPIC_API_KEY`.
3. Rode o jogo. No canto da tela deve aparecer `IA: Claude (...)`.

O `claude_config.cfg` está no `.gitignore`, então sua chave **não vai para o GitHub**.

> **Atenção antes de publicar o jogo:** se você exportar o jogo com a chave dentro, qualquer
> jogador consegue extrair a chave e gastar seus créditos. Para um jogo público, coloque um
> servidor pequeno entre o jogo e a API (o jogo fala com o seu servidor, e só o servidor
> guarda a chave). Para testar sozinho, o arquivo de configuração é suficiente.

## Criando seus próprios NPCs

Tudo fica em `scripts/main.gd`, na função `_spawn_npcs()`. Copie o bloco de um NPC e mude:

- `npc_name`: o nome que aparece em cima dele
- `personality`: quem ele é, como fala, o que sabe e que segredos guarda (a IA segue isto)
- `greeting`: a primeira fala quando você chega perto
- `offline_lines` / `offline_default`: as falas usadas sem internet ou sem chave
- `position` e `body_color`

O mundo do jogo (`WORLD_INFO`, no topo de `main.gd`) é compartilhado por todos os NPCs.

## Como funciona

| Arquivo | O que faz |
|---|---|
| `scripts/claude_client.gd` | Envia a conversa para a API do Claude por HTTP e trata erros, novas tentativas e recusas |
| `scripts/chat_npc.gd` | O NPC: desenho, prompt de personalidade, histórico da conversa e falas offline |
| `scripts/dialogue_ui.gd` | A caixa de diálogo com efeito de digitação |
| `scripts/player.gd` | Movimento do jogador |
| `scripts/main.gd` | Monta a cena e define os NPCs |

As respostas usam o modelo `claude-opus-5-5` com esforço `low`, para serem rápidas e baratas.
Dá para trocar o modelo em `claude_config.cfg` (por exemplo `claude-haiku-5-5`, que é bem mais
barato). Se a IA falhar (sem internet, chave errada, limite de uso), o NPC responde com uma fala
offline e o jogo mostra o motivo na conversa.
