const prisma = require('./prisma');

// Runs fn only if this process wins a Postgres advisory lock for `key`, so
// overlapping deploys / multiple replicas never run the same job twice at once.
async function withJobLock(key, fn) {
  const id = hashKey(key);
  const [{ locked }] = await prisma.$queryRaw`SELECT pg_try_advisory_lock(${id}::bigint) AS locked`;
  if (!locked) return { skipped: true };
  try {
    return await fn();
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${id}::bigint)`;
  }
}

// Records (name, runKey) once. Returns true the first time, false if it already ran.
async function claimOnce(name, runKey) {
  try {
    await prisma.jobRun.create({ data: { name, runKey: String(runKey) } });
    return true;
  } catch (err) {
    if (err.code === 'P2002') return false;
    throw err;
  }
}

function hashKey(key) {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) | 0;
  return h;
}

module.exports = { withJobLock, claimOnce };
