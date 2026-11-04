# Arquitetura do Ouroboros

Plataforma privada de comunidade: fórum, canais, mensagens em tempo real, voz, vídeo, compartilhamento de tela e bots. Entrada só com aprovação manual do proprietário.

## Visão geral

```
                ┌──────────────── navegador / PWA ────────────────┐
                │ React 19 · Vite · Tailwind v4 · React Query     │
                │ zustand (estado em tempo real) · WebRTC (mesh)  │
                └───────┬───────────────────────┬─────────────────┘
               HTTPS REST (cookies)     WebSocket (Socket.IO)   mídia P2P (DTLS-SRTP)
                        │                       │                 ▲
          ┌─────────────▼───────────────────────▼──────┐          │ relay quando o NAT impede
          │ Fastify (Node 22)                           │      ┌───┴────┐
          │  módulos: auth · admin · structure ·        │      │ coturn │
          │  messages · files · forum · events · social │      └────────┘
          │  moderation · bots · misc                   │
          │  realtime: presença · digitação · sinaliz.  │
          │  bots: runtime + sandbox QuickJS (WASM)     │
          │  agendador: lembretes, eventos, retenção    │
          └──────┬──────────────┬──────────────┬────────┘
                 │              │              │
           PostgreSQL 16     Redis 7     armazenamento privado
           (dados, busca     (presença,  (disco local ou S3/MinIO;
            full-text)       rate limit,  nunca exposto por URL)
                             salas de voz,
                             pub/sub do Socket.IO)
```

## Escolhas e justificativas

| Sugestão do briefing | Escolha | Por quê |
|---|---|---|
| Next.js | **Vite + React (SPA)** | Tudo é privado e atrás de login — SSR/SEO não trazem ganho. Uma SPA evita a complexidade de SSR com WebRTC, WebSockets e APIs de mídia, e é servida como arquivos estáticos pelo próprio backend. |
| NestJS | **Fastify modular** | Mesma organização por módulos (um arquivo de rotas por domínio, serviços em `lib/`) com menos camadas e melhor desempenho. Validação com zod compartilhado entre cliente e servidor. |
| ORM | **Drizzle ORM** | Consultas parametrizadas tipadas, migrações SQL versionadas (`apps/server/drizzle`), sem binários nativos. |
| WebSockets | **Socket.IO + adaptador Redis** | Reconexão automática, salas por canal/usuário e escala horizontal via Redis. |
| WebRTC | **Mesh P2P + STUN/TURN** | Sem servidor de mídia para manter; ótimo até ~6–8 pessoas por sala. Para salas grandes ou gravação, o próximo passo é um SFU (LiveKit/mediasoup). |
| Bots isolados | **QuickJS em WebAssembly** | Scripts de bots personalizados rodam numa VM sem acesso a rede, disco, processo ou dados — limites de tempo (200 ms), memória (16 MB) e pilha. |
| Senhas | **Argon2id** (`@node-rs/argon2`) | Parâmetros recomendados pela OWASP (m=19 MiB, t=2). |
| Sessões | **Cookie httpOnly + tabela `sessions`** | Revogação imediata (logout remoto, troca de senha, banimento) — algo que JWT sem estado não oferece. |

## Monorepo

```
apps/server     API, tempo real, bots, agendador (Fastify)
apps/web        cliente React (PWA)
packages/shared permissões, enums e esquemas zod usados pelos dois lados
infra/          Caddy (HTTPS), coturn (TURN), backups
docs/           arquitetura, segurança, progresso
```

## Controle de acesso

1. **Estado da conta** (`users.status`): `pending` → `approved` | `rejected` | `suspended` | `banned`, mais `email_verified_at`.
   O guard `approved` (em `lib/auth.ts`) roda em **todas** as rotas privadas e no handshake do WebSocket. Pendentes só acessam `/api/auth/*`.
2. **Proprietário único**: `users.is_owner` com índice único parcial — o banco não aceita um segundo dono. Ele detém todas as permissões; nenhuma rota permite conceder "proprietário".
3. **Cargos e permissões**: `roles` + `role_permissions` (catálogo em `permissions`). Hierarquia por `position`: ninguém age sobre quem está no mesmo nível ou acima, nem sobre si mesmo. `administrator`, `manage_roles` e `manage_settings` só podem ser concedidas pelo dono.
4. **Permissões por canal**: `channel_overwrites` (por cargo e por membro: allow/deny), canais privados com `channel_members`, salas com senha (`channel_user_states.unlocked_at`). O cálculo efetivo fica em `lib/permissions.ts` (`PermissionService.channelPerms`).
5. **Conversas privadas** (DMs e grupos) só são visíveis aos participantes — nem o proprietário lê.

## Modelo de dados

Entidades pedidas no briefing → tabelas (`apps/server/src/db/schema.ts`):

| Briefing | Tabela(s) |
|---|---|
| Users, UserProfiles | `users`, `user_profiles` |
| AccessRequests | `access_requests` |
| Roles, Permissions | `roles`, `permissions`, `role_permissions`, `user_roles` |
| Sessions | `sessions`, `auth_tokens` (verificação de e-mail e recuperação de senha) |
| Channels, ChannelMembers, Categories | `channels`, `channel_members`, `channel_overwrites`, `channel_user_states`, `categories`, `spaces` |
| Messages, MessageAttachments, Reactions, Threads | `messages` (+ busca `tsvector`), `message_attachments`, `message_edits`, `reactions`, `threads`, `scheduled_messages`, `polls`, `poll_votes` |
| Friendships | `friendships`, `user_blocks` |
| VoiceRooms, Calls, CallParticipants | `voice_rooms`, `calls`, `call_participants` (estado ao vivo no Redis) |
| Bots, BotCommands, BotPermissions | `bots`, `bot_commands`, `bot_permissions`, `reminders` |
| ForumPosts, ForumComments | `forum_posts` (+ busca), `forum_comments`, `forum_likes`, `forum_edits` |
| Reports | `reports`, `warnings` |
| Notifications | `notifications` |
| Events | `events`, `event_participants` |
| Files | `files`, `folders`, `custom_emojis` |
| AuditLogs | `audit_logs` |
| Extras | `notes`, `favorites`, `user_achievements`, `changelog_entries`, `whiteboard_strokes`, `settings` |

Índices: busca full-text GIN em mensagens e tópicos, índices compostos para paginação (`channel_id, id`), unicidade case-insensitive de usuário/e-mail, par único de amizade (`least/greatest`).

## Tempo real

Salas Socket.IO: `user:{id}`, `session:{id}`, `channel:{id}` (somente canais visíveis; recalculado quando permissões mudam), `voice:{id}`, `members`, `staff`.

| Evento | Direção | Uso |
|---|---|---|
| `message:new/updated/deleted`, `reaction:add/remove` | servidor → cliente | linha do tempo |
| `typing` | ambos | indicador de digitação |
| `presence:update`, `presence:idle` | ambos | online/ausente/não perturbe/invisível |
| `voice:join/leave/signal/state/moderate` | ambos | sinalização WebRTC e estado de mídia |
| `wb:stroke/cursor/clear` | ambos | quadro branco colaborativo |
| `music:state`, `music:ended` | ambos | escuta sincronizada do bot de música |
| `notification:new`, `call:incoming`, `structure:updated`… | servidor → cliente | notificações e sincronização |

Sessões abertas são revalidadas a cada minuto: banimento, suspensão ou revogação derrubam o socket na hora.

## Chamadas

- Sinalização pelo servidor; mídia ponto a ponto, criptografada por DTLS-SRTP.
- "Perfect negotiation" permite ligar/desligar câmera e tela sem colisões.
- Credenciais TURN temporárias (HMAC, `TURN_SECRET`) — nenhuma senha fixa vai ao cliente.
- Permissões de fala/câmera/tela são calculadas no servidor e anunciadas em `allowed`; o servidor recusa estados não permitidos e os clientes não reproduzem mídia de quem não tem permissão. Em mesh, um cliente adulterado ainda poderia transmitir mídia aos pares — o bloqueio *técnico* exige um SFU (ver SECURITY.md).

## Bots

Eventos do domínio (`lib/bus.ts`) acionam os bots nativos (boas-vindas, moderação, avisos, música, enquetes, estatísticas, jogos, IA, tickets, lembretes). Comandos começam com `/`. Bots personalizados combinam comandos declarativos (modelos com variáveis), scripts em sandbox e webhooks de entrada com token. Cada bot só age nos canais autorizados.

## Agendador

`lib/scheduler.ts` (trava no Redis para rodar em uma instância só): mensagens agendadas, lembretes, lembretes de eventos, avanço de eventos recorrentes e política de retenção (mensagens, auditoria, sessões vencidas, arquivos excluídos).
