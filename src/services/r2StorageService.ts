export const R2_PUBLIC_BASE_URL = (process.env.EXPO_PUBLIC_R2_PUBLIC_URL ?? '').replace(/\/+$/, '');
export const APK_DOWNLOAD_URL =
  process.env.EXPO_PUBLIC_APK_DOWNLOAD_URL?.trim() ||
  (R2_PUBLIC_BASE_URL
    ? `${R2_PUBLIC_BASE_URL}/releases/ejeephero-latest.apk`
    : 'https://expo.dev/accounts/mrsltycrml/projects/ejeephero/builds');
