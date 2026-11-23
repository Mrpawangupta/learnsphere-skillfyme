import pg from 'pg';

const { Pool } = pg;
let pool;

// Created lazily so importing this module never opens a connection.
export function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required');
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  }
  return pool;
}

export function query(text, params) {
  return getPool().query(text, params);
}
