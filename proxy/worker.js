// Valfri mellanserver för Intervals.icu (Cloudflare Worker, gratis).
// Behövs bara om Intervals.icu blockerar anrop direkt från appen (CORS).
// Den skickar vidare anropet oförändrat – inklusive nyckeln i Authorization –
// och lägger bara till CORS-huvuden. Den sparar och loggar ingenting.
//
// Deploy: dash.cloudflare.com → Workers & Pages → Create → "Hello World" →
// klistra in den här filen → Deploy. Lägg adressen (https://….workers.dev)
// i appen under Mer → Synk → Mellanserver.

const ALLOWED_ORIGIN = 'https://hugohulden.github.io';

export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Headers': 'authorization, content-type',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Max-Age': '86400',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'GET') return new Response('Bara GET', { status: 405, headers: cors });

    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/v1/')) return new Response('Okänd sökväg', { status: 404, headers: cors });

    const res = await fetch('https://intervals.icu' + url.pathname + url.search, {
      headers: { Authorization: request.headers.get('Authorization') ?? '' },
    });
    const body = await res.arrayBuffer();
    return new Response(body, {
      status: res.status,
      headers: { ...cors, 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
    });
  },
};
