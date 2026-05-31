import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';
import { buildOpenApiDocument } from './swagger';

/** Generates backend/openapi.json without starting the HTTP server. */
async function run() {
  const app = await NestFactory.create(AppModule, { logger: false });
  const document = buildOpenApiDocument(app);
  const outPath = join(process.cwd(), 'openapi.json');
  writeFileSync(outPath, JSON.stringify(document, null, 2));
  await app.close();
  console.log(`OpenAPI spec written to ${outPath}`);
  process.exit(0);
}

run();
