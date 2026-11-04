# Segurança e privacidade

Controles implementados, mapeados ao briefing (seção 17), e limites conhecidos.

## Controles

| Requisito | Implementação |
|---|---|
| Hash de senha | Argon2id (m=19 MiB, t=2, p=1). Login de conta inexistente gasta o mesmo tempo (anti-enumeração). |
| Autenticação | Sessão opaca de 256 bits em cookie `httpOnly`, `SameSite=Lax`, `Secure` em HTTPS; só o hash SHA-256 do token fica no banco. |
| Verificação de e-mail | Token de uso único com validade de 24 h; a solicitação só chega à administração depois da confirmação. |
| Aprovação no servidor | Guard `approved` em todas as rotas privadas e no handshake do WebSocket; pendentes, rejeitados, suspensos e banidos recebem 403. Coberto por testes (`apps/server/test/auth.test.ts`). |
| Força bruta | Bloqueio progressivo por conta (5 falhas → 15 min, dobrando) e por IP; códigos TOTP não podem ser reutilizados. |
| Rate limiting | Global por usuário/IP (Redis) e limites específicos em cadastro, login, envio de mensagens, uploads, buscas e denúncias. |
| XSS | O cliente nunca injeta HTML de usuários (Markdown renderizado como nós React); CSP restritiva (`script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`); arquivos servidos com `nosniff`, `Content-Disposition` e CSP `sandbox`; SVG e HTML não são aceitos como upload. |
| CSRF | Token double-submit em cookie + cabeçalho `x-csrf-token` em toda requisição que altera estado, mais verificação de `Origin` em produção. |
| SQL injection | Somente consultas parametrizadas (Drizzle / `pg` com placeholders). |
| Sessões | Lista de dispositivos, revogação individual ou de todas as outras; troca/redefinição de senha revoga as demais; sockets da sessão revogada caem imediatamente. |
| Permissões no servidor | Toda decisão passa por `PermissionService`; o cliente só recebe o resultado para desenhar a interface. |
| Auditoria | `audit_logs` registra aprovações, rejeições, bloqueios, suspensões, banimentos, remoções, mudanças de cargo, canais, configurações, exclusões e edições de moderação, bots, denúncias, arquivos e bloqueios de força bruta. |
| Backups | Serviço `backup` no docker-compose: dump diário comprimido com rotação. |
| Criptografia em trânsito | Caddy com HTTPS automático + HSTS; mídia WebRTC com DTLS-SRTP; TURN com credenciais temporárias. |
| Arquivos privados | Armazenamento nunca exposto: cada download passa por verificação de acesso (anexo de canal visível, DM do participante, biblioteca do canal…). Tipo real detectado pelo conteúdo, limite de tamanho, cota por membro e antivírus opcional (ClamAV). |
| Retenção | Configurável pelo dono: dias para mensagens, logs de auditoria e arquivos excluídos. |
| Recuperação de senha | Link de uso único com validade de 1 h, resposta idêntica para e-mails inexistentes. |
| 2FA | TOTP para qualquer membro; o dono pode exigir 2FA para usar as funções administrativas. Segredos TOTP e chaves de API ficam criptografados (AES-256-GCM). |
| Elevação de privilégio | Ninguém altera os próprios cargos; só se atribui cargo abaixo do próprio; permissões críticas só pelo dono; dono único garantido por índice do banco. Coberto por testes. |
| Segredos | Nenhuma chave vai ao frontend: a busca de GIFs e o bot de IA passam pelo servidor. |
| Bots | Scripts em VM QuickJS (WASM) sem rede/disco/processo, com limites de tempo, memória e pilha; bots só atuam nos canais autorizados e nunca leem conversas privadas de que não participam. |
| Privacidade de DMs | Conversas privadas e seus anexos só são acessíveis aos participantes — nem o proprietário lê. A moderação de abusos em DMs acontece por denúncia, que guarda uma cópia do conteúdo denunciado. |

## Limites conhecidos (sem promessas além do que existe)

- **Mensagens não têm criptografia ponta a ponta.** Ficam no banco em texto, protegidas por controle de acesso. Quem administra o servidor/banco consegue lê-las.
- **Chamadas em mesh**: as permissões de fala, câmera e tela são aplicadas pela sinalização e pelos clientes. Um cliente modificado ainda poderia enviar mídia diretamente aos pares. O bloqueio técnico completo exige um SFU.
- **Conectividade**: sem um servidor TURN configurado, chamadas podem falhar em redes com NAT simétrico ou firewalls corporativos.
- **Escala do mesh**: recomendado até ~6–8 participantes com vídeo por sala.
- **Antivírus** só roda quando `CLAMAV_HOST` está configurado.
