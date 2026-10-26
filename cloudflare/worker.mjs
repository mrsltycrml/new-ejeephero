const prefixes = ['/transit/', '/boundaries/', '/releases/'];
const contentTypes = {json:'application/json',apk:'application/vnd.android.package-archive',png:'image/png',jpeg:'image/jpeg',jpg:'image/jpeg',webp:'image/webp'};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (prefixes.some(prefix => url.pathname.startsWith(prefix))) {
      if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD, OPTIONS'}});
      if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
      let key;
      try { key=decodeURIComponent(url.pathname.slice(1)); } catch { return new Response('Invalid path',{status:400}); }
      if (key.includes('..') || key.includes('\\') || !/^[A-Za-z0-9/_.,-]+$/.test(key)) return new Response('Invalid path',{status:400});
      const object=await env.EJEEPHERO_STATIC.get(key);
      if (!object) return new Response('File not found',{status:404,headers:{'Cache-Control':'no-store'}});
      const headers=new Headers(); object.writeHttpMetadata(headers);
      const type=contentTypes[key.split('.').pop()?.toLowerCase()];
      if(type) headers.set('Content-Type',type);
      headers.set('ETag',object.httpEtag);
      headers.set('X-Content-Type-Options','nosniff');
      headers.set('Access-Control-Allow-Origin','*');
      headers.set('Cache-Control',key.endsWith('-latest.apk')?'no-cache':'public, max-age=3600');
      if(request.headers.get('If-None-Match')===object.httpEtag) return new Response(null,{status:304,headers});
      return new Response(request.method==='HEAD'?null:object.body,{headers});
    }
    const response=await env.ASSETS.fetch(request);
    const headers=new Headers(response.headers);
    headers.set('X-Content-Type-Options','nosniff');
    headers.set('Referrer-Policy','strict-origin-when-cross-origin');
    headers.set('Permissions-Policy','geolocation=(self), camera=(), microphone=()');
    if(headers.get('Content-Type')?.includes('text/html') || url.pathname==='/manifest.json') headers.set('Cache-Control','no-cache');
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  },
};
