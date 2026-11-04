import { buildApp } from './app';

const { app, ctx, close } = await buildApp();
try {
  await app.listen({ host: ctx.config.HOST, port: ctx.config.PORT });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    app.log.info(`${sig} received, shutting down`);
    const t = setTimeout(() => process.exit(1), 10_000);
    await close().catch(() => {});
    clearTimeout(t);
    process.exit(0);
  });
}
