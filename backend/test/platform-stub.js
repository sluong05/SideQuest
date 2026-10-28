// Test helper: installs an in-memory stand-in for src/lib/prisma before any
// module under test requires it (the real client needs a generated engine + DB).
const path = require('path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-0123456789-abcdefghijklmnopqrstu';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/test';

const prismaPath = path.resolve(__dirname, '../src/lib/prisma.js');
const stub = {
  users: new Map(),
  updates: [],
  user: {
    async findUnique({ where }) { return stub.users.get(where.id) || null; },
    async updateMany(args) { stub.updates.push(args); return { count: 1 }; },
  },
};
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: stub };

module.exports = { prismaStub: stub };
