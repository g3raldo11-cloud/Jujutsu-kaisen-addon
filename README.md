# Noite Maldita 🌙

Jogo de Roblox de **sobrevivência em ondas** com feitiçaria. De 1 a 4 jogadores
defendem o **Selo Sagrado** no centro de um templo enquanto maldições saem de
4 portais. Cada jogador desperta uma **técnica de feitiçaria sorteada**, com
3 habilidades e um golpe especial: o **Território**.

## Como jogar

| Ação | Computador | Celular | Controle |
| --- | --- | --- | --- |
| Golpe em combo | Clique (segure) | botão "Golpe" | R2 |
| Habilidade 1 (projétil) | Z ou 1 | botão | X |
| Habilidade 2 (área) | X ou 2 | botão | Y |
| Habilidade 3 (investida) | C ou 3 | botão | B |
| Território (barra dourada cheia) | V ou 4 | botão | L1 |
| Loja | B | botão "Loja" | ↑ |
| Técnica (Despertar) | T | botão "Técnica" | ↓ |

**Ciclo da partida:** Saguão → Onda → Loja → Onda → … → Fim da Noite.
A cada 5 ondas aparece um **chefe**. A partida acaba se o Selo for destruído
ou se todos os jogadores caírem.

### Técnicas (sorteadas no Despertar)

| Técnica | Raridade | Efeito especial |
| --- | --- | --- |
| Punho de Rocha | Comum | Empurra os inimigos |
| Lâmina do Vento | Comum | Projéteis atravessam (3 de uma vez) |
| Chama Carmesim | Raro | Queimadura (dano contínuo) |
| Geada Eterna | Raro | Deixa os inimigos lentos |
| Trovão Celeste | Épico | Raio salta para inimigos próximos |
| Sombra Faminta | Épico | Rouba vida |
| Vazio Estelar | Lendário | Puxa os inimigos |
| Coração do Sol | Lendário | Cura você e os aliados |

A primeira técnica é grátis. Para trocar, gaste **fragmentos amaldiçoados**,
que você ganha no fim de cada partida. A cada 10 rolagens sem Épico ou
Lendário, a próxima é garantida.

### Maldições

- **Maldição Menor:** fraca e numerosa
- **Maldição Veloz:** muito rápida (onda 7+)
- **Maldição Bruta:** lenta e resistente (onda 2+)
- **Maldição Cuspidora:** ataca de longe (onda 3+)
- **Chefes:** *Devorador de Selos* e *Rainha das Mil Bocas*, que se alternam.
  Eles têm pancada em área (com aviso vermelho no chão), investida, invocação
  e rajada de projéteis.

### Loja (moedas da partida)

Vigor (vida), Fúria (dano), Fluxo Amaldiçoado (energia), Foco (recarga),
Passos Leves (velocidade) e Restaurar Selo (cura o selo para o time todo).

---

## Como abrir e testar no Roblox Studio (jeito fácil)

1. Instale o **Roblox Studio**: https://create.roblox.com
2. Baixe o arquivo **`dist/NoiteMaldita.rbxlx`** deste repositório.
3. No Studio: **Arquivo → Abrir do arquivo** (File → Open from File) e escolha
   o arquivo.
4. Aperte **Play (F5)**. O mapa (templo, portais, árvores, iluminação noturna)
   é **construído automaticamente quando o jogo começa**. Por isso, no modo
   de edição, o mundo parece vazio. Isso é normal.
5. Para testar com mais de um jogador: aba **Testar → Clientes e Servidores**,
   escolha 2 jogadores e clique em **Iniciar**.

> No Studio, o progresso (fragmentos e técnica) só é salvo depois que o jogo
> é publicado **e** você ativa: *Configurações do Jogo → Segurança →
> Enable Studio Access to API Services*. Sem isso o jogo funciona normalmente,
> só não guarda o progresso entre testes.

## Como publicar no Roblox

1. Com o jogo aberto no Studio: **Arquivo → Publicar no Roblox**
   (File → Publish to Roblox).
2. Dê um nome (ex.: *Noite Maldita*), uma descrição e escolha o gênero.
3. No **Creator Hub** (https://create.roblox.com/dashboard/creations):
   - Abra o jogo → configure o **número máximo de jogadores por servidor
     para 4**.
   - Preencha o **questionário de maturidade** (obrigatório para ficar
     público).
   - Adicione um ícone e imagens de capa.
   - Mude a visibilidade para **Público**.
4. Ative o salvamento: *Configurações do Jogo → Segurança → Enable Studio
   Access to API Services* (para testar no Studio). No servidor publicado,
   o salvamento já funciona sozinho.

---

## Para desenvolvedores

Código em **Luau** (`--!strict`), organizado no padrão do [Rojo](https://rojo.space):

```
src/
├── shared/   → ReplicatedStorage/Shared       (técnicas, inimigos, loja, config)
├── server/   → ServerScriptService/Server     (lógica com autoridade do servidor)
│   ├── Systems/  MapBuilder, PlayerData, CharacterService, EnemyService,
│   │             CombatService, WaveService, ShopService, AwakenService
│   └── Util/     Run (dados da partida), RateLimit, Guard
└── client/   → StarterPlayerScripts/Client    (interface, controles, efeitos)
    ├── Controllers/  Hud, Input, Fx, EnemyBars, Shop, Awaken, Announcer
    └── Util/         Ui, Sfx, ClientState
```

- **Segurança:** o cliente só *pede* ações. O servidor confere recarga,
  energia, moedas e distância, e calcula todo o dano. Todos os RemoteEvents
  têm validação de argumentos e limite de chamadas.
- **Salvamento:** DataStore com `UpdateAsync`, tentativas com espera,
  trava de sessão, salvamento automático e `BindToClose`.
- **Balanceamento:** quase todos os números ficam em `src/shared/Config.luau`,
  `Techniques.luau`, `Enemies.luau` e `Upgrades.luau`.

### Gerar o arquivo do Studio

```bash
python3 tools/build_place.py
```

Isso gera `dist/NoiteMaldita.rbxlx` a partir de `src/`.

### Usar com Rojo (sincronização ao vivo com o Studio)

```bash
rokit install
```

```bash
rojo serve
```

No Studio, instale o plugin do Rojo e clique em **Connect**.

### Verificações

```bash
selene src
```

O GitHub Actions roda o Selene (lint), o `rojo build` e confere se
`dist/` está atualizado a cada envio.

### Ideias para as próximas versões

- Sons e músicas da Creator Store (troque os caminhos em `src/client/Util/Sfx.luau`)
- Animações próprias para os golpes
- Mais técnicas, chefes e mapas
- Ranking global de recorde de ondas (OrderedDataStore)
