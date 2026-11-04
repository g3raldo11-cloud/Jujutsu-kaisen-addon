# Progresso do desenvolvimento

Arquivo vivo: registra o que já está implementado e verificado, e o que falta.

## Concluído e testado
- [x] Monorepo (pnpm): `apps/server`, `apps/web`, `packages/shared`
- [x] Banco: 40+ tabelas, migração inicial, índices, busca full-text, dono único garantido por índice parcial
- [x] Autenticação: Argon2id, sessões no servidor (cookie httpOnly), CSRF (double-submit + Origin), revogação, TOTP
- [x] Cadastro → confirmação de e-mail → PENDENTE → aprovação manual (aceitar/rejeitar/bloquear)
- [x] Bloqueio de APIs para pendentes/rejeitados/suspensos/banidos (validado no servidor e no socket)
- [x] Força bruta: bloqueio progressivo por conta e por IP; rate limiting com Redis
- [x] Hierarquia de cargos; ninguém altera os próprios cargos; só o dono concede permissões críticas
