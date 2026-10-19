// SQLite is used by the native offline cache. The web build uses the existing
// Supabase/AsyncStorage paths and must not load expo-sqlite's native wasm worker.
export const initDB = async () => {};

export const getDB = () => undefined;
