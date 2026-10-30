# Ouroboros

Plataforma privada de comunidade — fórum, canais, mensagens em tempo real, voz, vídeo, compartilhamento de tela e bots — controlada por um único proprietário. Ninguém vê nada lá dentro sem pedir acesso e ser aprovado manualmente.

## O que tem

- **Entrada controlada**: cadastro → confirmação de e-mail → solicitação PENDENTE → o proprietário aceita, rejeita ou bloqueia. Validado no servidor e no WebSocket.
- **Administração**: painel exclusivo com estatísticas, solicitações de acesso, membros (suspender, banir, restaurar, silenciar, advertir, remover), cargos e permissões, estrutura de espaços/categorias/canais, bots, denúncias, logs administrativos, armazenamento, anúncios, emojis e configurações (uploads, moderação, aparência, personalização, retenção, segurança, manutenção).
- **Canais**: texto, voz, vídeo, fórum, anúncios, arquivos, galeria, eventos, suporte, área administrativa e palco (transmissão). Permissões por cargo e por membro, canais privados, salas com senha, salas temporárias.
- **Mensagens**: tempo real, DMs e grupos privados, respostas, menções, emojis e emojis personalizados, reações animadas, GIFs (opcional), stickers, imagens, vídeos, arquivos, mensagens de voz gravadas no navegador, fixadas, edição com histórico, exclusão, threads, busca, indicador de digitação, confirmação de leitura opcional, enquetes e mensagens agendadas.
- **Chamadas (WebRTC)**: voz e vídeo individuais e em grupo, seleção de câmera/microfone/saída, câmera frontal/traseira, compartilhamento de tela/janela/aba com áudio quando suportado, detecção de voz, push-to-talk, supressão de ruído, cancelamento de eco, volume por participante, silenciar/desconectar (moderação), indicador de conexão e reconexão automática, quadro branco colaborativo e música sincronizada.
- **Bots**: boas-vindas, moderação automática, avisos, música, enquetes, estatísticas, jogos, IA (Claude, chave configurável), tickets e lembretes; bots personalizados com comandos, scripts em sandbox e webhooks.
- **Social e extras**: fórum com tags, curtidas, ordenação por popularidade e histórico de edição; amizades e bloqueios; calendário com eventos recorrentes, inscrições, lembretes e exportação .ics; notificações em tempo real e por canal; perfis com distintivos, níveis e conquistas; notas pessoais; favoritos; não perturbe e modo invisível; histórico de atividades; página de status e de novidades; temas escuro, claro e personalizado; atalhos de teclado; PWA instalável.

Detalhes: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/SECURITY.md](docs/SECURITY.md) · [docs/PROGRESS.md](docs/PROGRESS.md)

## Rodando localmente

Requisitos: Node 22+, pnpm 10, Docker (ou PostgreSQL 16 e Redis 7 instalados).

```bash
docker compose -f docker-compose.dev.yml up -d
```

```bash
pnpm install
```

```bash
pnpm db:migrate
```

```bash
pnpm create-owner -- --username dono --email voce@exemplo.com
```

```bash
pnpm dev
```

O cliente abre em http://localhost:5173 (a API roda em :4000 e o Vite faz o proxy). Sem `SMTP_URL`, os e-mails aparecem no log do servidor; com o `mailpit` do compose de desenvolvimento, use `SMTP_URL=smtp://localhost:1025` e veja em http://localhost:8025.

## Produção (Docker)

1. Aponte o DNS do domínio para o servidor e libere as portas 80/443 (HTTP/HTTPS) e 3478 + 49160–49200/UDP (TURN).
2. `cp .env.example .env` e preencha `DOMAIN`, `APP_URL`, `APP_SECRET`, `POSTGRES_PASSWORD`, `SMTP_URL`, `S3_SECRET_KEY`, `TURN_*`.
3. Suba tudo:

```bash
docker compose up -d --build
```

4. Crie o proprietário (único) da plataforma:

```bash
docker compose exec app node apps/server/dist/cli/create-owner.js --username dono --email voce@exemplo.com
```

O serviço `backup` grava um dump diário em `./backups` (14 dias por padrão). Antivírus opcional: `docker compose --profile antivirus up -d` e `CLAMAV_HOST=clamav`.

## Testes

Os testes de integração rodam contra PostgreSQL e Redis reais (banco `ouroboros_test`):

```bash
pnpm test
```

Testes ponta a ponta no navegador (cadastro, aprovação, mensagens, chamada com câmera e microfone simulados, compartilhamento de tela):

```bash
pnpm test:e2e
```

## Limites honestos

- Chamadas são ponto a ponto (mesh): ótimas até ~6–8 pessoas com vídeo por sala. Sem um servidor TURN, podem falhar em redes muito restritivas.
- Mensagens não têm criptografia ponta a ponta; ficam protegidas por controle de acesso no servidor.
- Busca de GIFs e bot de IA dependem de chaves externas configuradas pelo proprietário.
