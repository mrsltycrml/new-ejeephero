import Mapbox from '@rnmapbox/maps';
import { supabase } from '../lib/supabase';
import { getDb } from '../lib/database';

export const downloadOfflineMap = async (packName: string = 'makati-offline-pack') => {
  try {
    const MAKATI_BOUNDS = {
      ne: [121.06, 14.58],
      sw: [121.01, 14.54],
    };

    const options = {
      name: packName,
      styleURL: Mapbox.StyleURL.Street,
      bounds: [MAKATI_BOUNDS.ne, MAKATI_BOUNDS.sw],
      minZoom: 10,
      maxZoom: 16,
    };

    // Note: In a real app, you'd handle progress listeners
    // @ts-ignore
    await Mapbox.offlineManager.createPack(options);
    console.log('Successfully started offline map download');
  } catch (error) {
    console.error('Error downloading offline map:', error);
  }
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
