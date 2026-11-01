import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } });
const users = await p.user.findMany();
for (const u of users) console.log(JSON.stringify({ id: u.id, personnelCode: u.personnelCode, fullName: u.fullName, role: u.role, isActive: u.isActive }, null, 0));
await p.$disconnect();
