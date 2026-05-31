import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, uniq } from './test-app';

/**
 * Exercises the task status state machine and the
 * "only assignee or manager can advance status" rule.
 */
describe('Task status transition flow (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  const suffix = uniq();
  const adminEmail = `admin-${suffix}@test.io`;
  const managerEmail = `manager-${suffix}@test.io`;
  const memberEmail = `member-${suffix}@test.io`;
  const otherMemberEmail = `other-${suffix}@test.io`;
  const password = 'Password123!';

  let adminToken: string;
  let managerToken: string;
  let memberToken: string;
  let otherToken: string;
  let projectId: string;
  let memberId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer());

    // Admin + org
    const reg = await http
      .post('/api/auth/register')
      .send({ email: adminEmail, password, name: 'Admin', organizationName: 'Org' })
      .expect(201);
    adminToken = reg.body.accessToken;

    // Create manager, member, other member
    const mkUser = async (email: string, role: string) => {
      const res = await http
        .post('/api/users')
        .set(auth(adminToken))
        .send({ email, password, name: role, role })
        .expect(201);
      return res.body.id as string;
    };
    await mkUser(managerEmail, 'MANAGER');
    memberId = await mkUser(memberEmail, 'MEMBER');
    await mkUser(otherMemberEmail, 'MEMBER');

    const login = async (email: string) =>
      (await http.post('/api/auth/login').send({ email, password }).expect(200))
        .body.accessToken as string;
    managerToken = await login(managerEmail);
    memberToken = await login(memberEmail);
    otherToken = await login(otherMemberEmail);

    // Project
    const proj = await http
      .post('/api/projects')
      .set(auth(adminToken))
      .send({ name: 'Proj' })
      .expect(201);
    projectId = proj.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const createTask = async () => {
    const res = await http
      .post('/api/tasks')
      .set(auth(adminToken))
      .send({ title: 'A task', projectId, assigneeId: memberId })
      .expect(201);
    return res.body.id as string;
  };

  it('assignee advances through valid transitions TODO -> IN_PROGRESS -> IN_REVIEW -> DONE', async () => {
    const id = await createTask();

    for (const status of ['IN_PROGRESS', 'IN_REVIEW', 'DONE']) {
      const res = await http
        .patch(`/api/tasks/${id}/status`)
        .set(auth(memberToken))
        .send({ status })
        .expect(200);
      expect(res.body.status).toBe(status);
    }
  });

  it('rejects an invalid transition (TODO -> DONE) with 422 INVALID_STATUS_TRANSITION', async () => {
    const id = await createTask();
    const res = await http
      .patch(`/api/tasks/${id}/status`)
      .set(auth(memberToken))
      .send({ status: 'DONE' })
      .expect(422);
    expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('allows BLOCKED from an active state', async () => {
    const id = await createTask();
    await http
      .patch(`/api/tasks/${id}/status`)
      .set(auth(memberToken))
      .send({ status: 'BLOCKED' })
      .expect(200);
  });

  it('forbids a non-assignee MEMBER from advancing the status (403)', async () => {
    const id = await createTask();
    await http
      .patch(`/api/tasks/${id}/status`)
      .set(auth(otherToken))
      .send({ status: 'IN_PROGRESS' })
      .expect(403);
  });

  it('allows a MANAGER to advance any task status', async () => {
    const id = await createTask();
    const res = await http
      .patch(`/api/tasks/${id}/status`)
      .set(auth(managerToken))
      .send({ status: 'IN_PROGRESS' })
      .expect(200);
    expect(res.body.status).toBe('IN_PROGRESS');
  });

  it('forbids a MEMBER from creating tasks (RBAC via guard)', async () => {
    await http
      .post('/api/tasks')
      .set(auth(memberToken))
      .send({ title: 'nope', projectId })
      .expect(403);
  });
});
