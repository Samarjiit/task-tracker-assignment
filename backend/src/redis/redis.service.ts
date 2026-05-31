import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import Redis from 'ioredis';

/**
 * Redis wrapper with helpers for the per-assignee task-list cache.
 *
 * Invalidation strategy (versioned namespace):
 *   - Each assignee has an integer "version" key.
 *   - Cache entries embed the current version in their key.
 *   - On any task mutation affecting an assignee we INCR their version,
 *     instantly orphaning every old cache entry (TTL reaps them later).
 *   - This is O(1) and avoids KEYS/SCAN, which are unsafe at scale.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.client = new Redis({
      host: this.config.get<string>('REDIS_HOST'),
      port: this.config.get<number>('REDIS_PORT'),
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
    this.client.on('error', (err) =>
      this.logger.error(`Redis error: ${err.message}`),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit();
  }

  // ---- generic helpers ----

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  // ---- task-list cache key construction ----

  private versionKey(orgId: string, assigneeId: string): string {
    return `tasks:org:${orgId}:assignee:${assigneeId}:version`;
  }

  async getAssigneeVersion(orgId: string, assigneeId: string): Promise<number> {
    const v = await this.client.get(this.versionKey(orgId, assigneeId));
    return v ? parseInt(v, 10) : 1;
  }

  /** Bump the version → all cached lists for this assignee become unreachable. */
  async bumpAssigneeVersion(orgId: string, assigneeId: string): Promise<void> {
    await this.client.incr(this.versionKey(orgId, assigneeId));
  }

  /** Build a deterministic cache key for a task-list query. */
  buildTaskListKey(
    orgId: string,
    assigneeId: string,
    version: number,
    filters: Record<string, unknown>,
  ): string {
    const filterHash = createHash('sha1')
      .update(JSON.stringify(filters))
      .digest('hex')
      .slice(0, 16);
    return `tasks:org:${orgId}:assignee:${assigneeId}:v${version}:${filterHash}`;
  }
}
