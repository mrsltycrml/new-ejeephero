import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase;

export const initDB = async () => {
  db = await SQLite.openDatabaseAsync('ejeephero.db');

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS routes_cache (
      id TEXT PRIMARY KEY,
      name TEXT,
      description TEXT,
      color_code TEXT,
      operating_hours TEXT,
      base_fare REAL,
      per_km_rate REAL
    );
    CREATE TABLE IF NOT EXISTS terminals_cache (
      id TEXT PRIMARY KEY,
      route_id TEXT,
      name TEXT,
      latitude REAL,
      longitude REAL,
      sequence_order INTEGER
    );
  `);
};

export const getDB = () => db;
