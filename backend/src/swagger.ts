import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, OpenAPIObject } from '@nestjs/swagger';

/** Builds the OpenAPI document (shared by the running app and the exporter). */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Team Task Tracker API')
    .setDescription(
      'Team-based task tracker with JWT auth, RBAC, and Redis caching.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth')
    .addTag('users')
    .addTag('projects')
    .addTag('tasks')
    .build();
  return SwaggerModule.createDocument(app, config);
}

export function setupSwagger(app: INestApplication): void {
  const document = buildOpenApiDocument(app);

  // Serve OpenAPI JSON spec (bypasses global 'api' prefix via raw adapter)
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/docs-json', (_req: any, res: any) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(document));
  });

  // Serve Swagger UI via CDN — avoids EPERM issues reading node_modules/swagger-ui-dist
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Team Task Tracker API</title>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
<div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>
  SwaggerUIBundle({
    url: '/docs-json',
    dom_id: '#swagger-ui',
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
    layout: 'BaseLayout',
    persistAuthorization: true,
  });
</script>
</body>
</html>`;

  httpAdapter.get('/docs', (_req: any, res: any) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  });
}
