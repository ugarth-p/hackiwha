import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// 1. Set up the raw PostgreSQL pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// 2. Wrap it in the Prisma adapter
const adapter = new PrismaPg(pool);

// 3. Instantiate the raw client with the adapter to bypass tenant isolation
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Injecting database constraints...');

  // 1. Read the SQL file
  const sqlFilePath = path.join(__dirname, 'pgvector.sql');
  const rawSql = fs.readFileSync(sqlFilePath, 'utf8');

  // 2. Execute the raw SQL directly against the database
  try {
    // Prisma's $executeRawUnsafe allows multi-line raw SQL execution
    await prisma.$executeRawUnsafe(rawSql);
    console.log(
      'Database triggers, functions, and RLS policies successfully applied!',
    );
  } catch (error) {
    console.error('Failed to apply database rules:', error);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    // It is good practice to close the raw pg pool in a seed script too
    await pool.end();
  });
