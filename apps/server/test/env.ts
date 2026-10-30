process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://enclave:enclave@127.0.0.1:5432/enclave_test';
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/1';
process.env.LOG_LEVEL = 'silent';
process.env.DISABLE_SCHEDULER = 'true';
process.env.STORAGE_LOCAL_DIR = '/tmp/enclave-test-storage';
process.env.APP_URL = 'http://localhost:5173';
