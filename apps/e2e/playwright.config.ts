import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4310);
export const DB = process.env.E2E_DATABASE_URL ?? 'postgres://ouroboros:ouroboros@127.0.0.1:5432/ouroboros_e2e';

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'pt-BR',
    trace: 'retain-on-failure',
    permissions: ['microphone', 'camera'],
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--auto-select-desktop-capture-source=Entire screen',
        '--auto-accept-this-tab-capture',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  webServer: {
    command: 'node ./prepare.mjs && node ../server/dist/index.js',
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      NODE_ENV: 'test',
      PORT: String(PORT),
      HOST: '127.0.0.1',
      APP_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_URL: DB,
      REDIS_URL: process.env.E2E_REDIS_URL ?? 'redis://127.0.0.1:6379/2',
      WEB_DIST_DIR: '../web/dist',
      STORAGE_LOCAL_DIR: '/tmp/ouroboros-e2e-storage',
      LOG_LEVEL: 'warn',
      MAIL_LOG_FILE: '/tmp/ouroboros-e2e-mail.jsonl',
    },
  },
});
