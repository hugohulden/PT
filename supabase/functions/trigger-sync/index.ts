// Supabase Edge Function: "Synka nu"-knappen.
// Startar Garmin-synkjobbet i GitHub Actions. GitHub-token finns bara här på servern.
//
// Hemligheter (supabase secrets set ...):
//   GH_TOKEN          fine-grained token med Actions: read/write på repot
//   GH_REPO           t.ex. hugohulden/PT
//   ALLOWED_USER_IDS  kommaseparerade användar-id:n som får trigga synk

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data } = await supa.auth.getUser();
  const allowed = (Deno.env.get('ALLOWED_USER_IDS') ?? '').split(',').map((s) => s.trim());
  if (!data.user || !allowed.includes(data.user.id)) return json({ ok: false, error: 'Inte behörig' }, 401);

  const res = await fetch(`https://api.github.com/repos/${Deno.env.get('GH_REPO')}/actions/workflows/garmin-sync.yml/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('GH_TOKEN')}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'traningsapp-sync',
    },
    body: JSON.stringify({ ref: 'main' }),
  });
  return json({ ok: res.status === 204, status: res.status });
});
