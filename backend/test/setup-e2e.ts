// Default env for e2e tests. Assumes `docker compose up` has Postgres + Redis
// exposed on localhost (override via real env vars in CI).
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://tasktracker:tasktracker@localhost:5432/tasktracker?schema=public';
process.env.REDIS_HOST = process.env.REDIS_HOST ?? 'localhost';
process.env.REDIS_PORT = process.env.REDIS_PORT ?? '6379';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret';
process.env.JWT_ACCESS_TTL = process.env.JWT_ACCESS_TTL ?? '900';
process.env.JWT_REFRESH_TTL = process.env.JWT_REFRESH_TTL ?? '604800';
process.env.TASK_CACHE_TTL = process.env.TASK_CACHE_TTL ?? '60';
