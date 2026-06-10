import * as SQLite from 'expo-sqlite';

export const getDb = async () => {
  return await SQLite.openDatabaseAsync('ejeephero.db');
};

export const initDb = async () => {
  const db = await getDb();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS routes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      operating_hours TEXT,
      color_code TEXT
    );
    CREATE TABLE IF NOT EXISTS terminals (
      id TEXT PRIMARY KEY,
      route_id TEXT NOT NULL,
      name TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      sequence_order INTEGER NOT NULL
    );
  `);
};
