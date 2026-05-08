import postgres from 'postgres';

// BAJO-1: fail fast with a clear message instead of a cryptic postgres error.
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const sql = postgres(process.env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  connection: { TimeZone: 'UTC' },
});

export default sql;
