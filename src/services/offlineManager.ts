import { supabase } from '../lib/supabase';
import { getDb } from '../lib/database';

export const downloadOfflineMap = async (packName: string = 'makati-offline-pack') => {
  // react-native-maps does not support offline map tile downloads out of the box like Mapbox.
  // This function is retained for API compatibility but will no longer download Mapbox tiles.
  console.log('Offline map tiles are not supported with react-native-maps. Operating in online mode for maps.');
};

export const syncDataToSQLite = async () => {
  try {
    const db = await getDb();
    
    // Fetch from Supabase
    const { data: routes } = await supabase.from('routes').select('*');
    const { data: terminals } = await supabase.from('terminals').select('*');
    
    if (routes && routes.length > 0) {
      await db.execAsync('BEGIN TRANSACTION;');
      await db.execAsync('DELETE FROM routes;');
      await db.execAsync('DELETE FROM terminals;');
      
      for (const r of routes) {
        await db.runAsync(
          'INSERT INTO routes (id, name, description, operating_hours, color_code) VALUES (?, ?, ?, ?, ?)',
          [r.id, r.name, r.description, r.operating_hours, r.color_code]
        );
      }
      
      if (terminals && terminals.length > 0) {
        for (const t of terminals) {
          await db.runAsync(
            'INSERT INTO terminals (id, route_id, name, latitude, longitude, sequence_order) VALUES (?, ?, ?, ?, ?, ?)',
            [t.id, t.route_id, t.name, t.latitude, t.longitude, t.sequence_order]
          );
        }
      }
      
      await db.execAsync('COMMIT;');
      console.log('Successfully synced data to SQLite');
    }
  } catch (error) {
    console.error('Error syncing to SQLite:', error);
    try {
      const db = await getDb();
      await db.execAsync('ROLLBACK;');
    } catch (e) {}
  }
};

export const getOfflineData = async () => {
  const db = await getDb();
  const routes = await db.getAllAsync('SELECT * FROM routes');
  const terminals = await db.getAllAsync('SELECT * FROM terminals ORDER BY route_id, sequence_order');
  return { routes, terminals };
};
