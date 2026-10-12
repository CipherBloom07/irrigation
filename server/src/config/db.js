import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionTimeoutMillis: 3000,
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/agritech_db',
});