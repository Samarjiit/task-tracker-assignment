import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, uniq } from './test-app';

describe('Auth flow (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const email = `admin-${uniq()}@test.io`;
  const password = 'Password123!';

  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a new organization + ADMIN and returns a token pair', async () => {
    const res = await http
      .post('/api/auth/register')
      .send({ email, password, name: 'Admin', organizationName: 'TestOrg' })
      .expect(201);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  it('rejects duplicate registration', async () => {
    await http
      .post('/api/auth/register')
      .send({ email, password, name: 'Admin', organizationName: 'TestOrg' })
      .expect(409);
  });

  it('rejects invalid credentials with a consistent error shape', async () => {
    const res = await http
      .post('/api/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);

    expect(res.body).toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    });
    expect(typeof res.body.message).toBe('string');
  });

  it('logs in and returns a token pair', async () => {
    const res = await http
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
    expect(accessToken).toBeDefined();
    expect(refreshToken).toBeDefined();
  });

  it('rejects access to a protected route without a token', async () => {
    await http.get('/api/users/me').expect(401);
  });

  it('allows access to a protected route with a valid token', async () => {
    const res = await http
      .get('/api/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.email).toBe(email);
    expect(res.body.role).toBe('ADMIN');
  });

  it('rotates the refresh token (old token becomes invalid)', async () => {
    const res = await http
      .post('/api/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    const newRefresh = res.body.refreshToken;
    expect(newRefresh).toBeDefined();
    expect(newRefresh).not.toBe(refreshToken);

    // Re-using the rotated (old) token must fail.
    await http.post('/api/auth/refresh').send({ refreshToken }).expect(401);

    refreshToken = newRefresh;
  });

  it('logs out and revokes the refresh token', async () => {
    await http.post('/api/auth/logout').send({ refreshToken }).expect(204);
    await http.post('/api/auth/refresh').send({ refreshToken }).expect(401);
  });
});
