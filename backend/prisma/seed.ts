import { PrismaClient, Role, Priority, TaskStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Password123!', 10);

  const org = await prisma.organization.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: { id: '00000000-0000-0000-0000-000000000001', name: 'Acme Inc' },
  });

  const [admin, manager, member] = await Promise.all([
    prisma.user.upsert({
      where: { email: 'admin@acme.test' },
      update: {},
      create: {
        email: 'admin@acme.test',
        name: 'Alice Admin',
        passwordHash,
        role: Role.ADMIN,
        organizationId: org.id,
      },
    }),
    prisma.user.upsert({
      where: { email: 'manager@acme.test' },
      update: {},
      create: {
        email: 'manager@acme.test',
        name: 'Marty Manager',
        passwordHash,
        role: Role.MANAGER,
        organizationId: org.id,
      },
    }),
    prisma.user.upsert({
      where: { email: 'member@acme.test' },
      update: {},
      create: {
        email: 'member@acme.test',
        name: 'Mona Member',
        passwordHash,
        role: Role.MEMBER,
        organizationId: org.id,
      },
    }),
  ]);

  const project = await prisma.project.upsert({
    where: { id: '00000000-0000-0000-0000-000000000010' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000010',
      name: 'Website Revamp',
      description: 'Q3 marketing site rebuild',
      organizationId: org.id,
    },
  });

  const existing = await prisma.task.count({ where: { projectId: project.id } });
  if (existing === 0) {
    await prisma.task.createMany({
      data: [
        {
          title: 'Design landing page',
          description: 'Hero + pricing sections',
          priority: Priority.HIGH,
          status: TaskStatus.IN_PROGRESS,
          projectId: project.id,
          assigneeId: member.id,
          createdById: manager.id,
          dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        },
        {
          title: 'Set up CI pipeline',
          priority: Priority.MEDIUM,
          status: TaskStatus.TODO,
          projectId: project.id,
          assigneeId: member.id,
          createdById: admin.id,
        },
        {
          title: 'Write API docs',
          priority: Priority.LOW,
          status: TaskStatus.TODO,
          projectId: project.id,
          assigneeId: manager.id,
          createdById: admin.id,
        },
      ],
    });
  }

  console.log('Seed complete. Demo login password for all users: Password123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
