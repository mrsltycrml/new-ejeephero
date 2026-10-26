// Data embedded in a WebView HTML document must never terminate its script tag.
export const scriptJson = (value: unknown): string => JSON.stringify(value)
  .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
  .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
