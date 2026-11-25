# Nellies träning 💖

En installerbar PWA för iPhone: plan mot **Göteborgsvarvet 22 maj 2027**, gymloggning, vägen till första pull-upen, steg, vikt och dagsform – med Garmin åt båda hållen.

**Appen:** https://hugohulden.github.io/PT/ (öppna i Safari → Dela → *Lägg till på hemskärmen*)

Allt fungerar offline. Datan sparas först i telefonen (IndexedDB) och synkas till Supabase när hon är inloggad.

---

## Status – vad som behöver göras

| Steg | Vem | Klart? |
|---|---|---|
| Appen på GitHub Pages | – | ✅ |
| Skicka pass till Garmin (fil → hennes Claude) | Nellie | Fungerar nu |
| Importera V1–V5 via *Synka via Claude* | Nellie | Fungerar nu |
| Supabase-projekt (molnbackup + automatisk synk) | Hugo | ⬜ avsnitt 2 |
| Garmin-inloggning (engångs, med MFA) | Nellie + Hugo | ⬜ avsnitt 3 |
| "Synka nu"-knappen | Hugo | ⬜ avsnitt 4 |

### Nellies checklista (5 min, kräver hennes telefon och Claude)
1. Öppna https://hugohulden.github.io/PT/ i **Safari** → Dela ⬆️ → **Lägg till på hemskärmen**. Öppna appen därifrån.
2. **Mer → Skicka till Garmin** → *Skicka till Garmin* → välj Claude → skriv "Gör som filen säger". Synka klockan.
3. **Mer → Synk → Synka via Claude** → *Allt från V1* → kopiera prompten → klistra in i Claude → kopiera svaret → klistra in i appen → Granska → Spara.
4. (När avsnitt 2 är klart) **Mer → Synk** → logga in med e-post och koden från mejlet.

---

## 1. Utveckling

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # enhetstester (plan, datum, import, Garmin-fil, regler)
cd sync && python -m pytest -q   # tester för synkjobbet
```

Varje push till `main` testas och publiceras automatiskt till GitHub Pages (`.github/workflows/deploy.yml`).

## 2. Supabase (gratis)

1. Skapa ett projekt på https://supabase.com – välj region **Stockholm (eu-north-1)**.
2. **SQL Editor** → klistra in hela `supabase/schema.sql` → Run.
3. **Authentication → Users → Add user → Send invitation**: lägg till Nellies e-post (och din om du vill). Kopiera hennes **User UID**.
4. **Authentication → Sign In / Providers → Email**: stäng av *Allow new users to sign up* (bara inbjudna kan logga in).
5. **Authentication → Emails → Magic Link**: ändra mallen så att koden syns, t.ex.:
   ```html
   <h2>Din kod: {{ .Token }}</h2><p>Skriv in den i träningsappen 💖</p>
   ```
   (Appen använder koden i stället för länken – länkar öppnas i Safari och inte i hemskärms-appen.)
6. **GitHub → repo → Settings → Secrets and variables → Actions**
   - fliken **Variables**: `SUPABASE_URL` = projektets URL, `SUPABASE_ANON_KEY` = *anon public*-nyckeln (Project Settings → API). Dessa är publika och skyddas av RLS.
   - fliken **Secrets**: `SUPABASE_URL` (samma URL), `SUPABASE_SERVICE_KEY` = *service_role*-nyckeln, `NELLIE_USER_ID` = hennes User UID.
7. Kör om deploy-workflowen (Actions → Deploy till GitHub Pages → Run workflow) så att appen får Supabase-adressen.

## 3. Garmin-inloggning (en gång, med Nellie bredvid)

Synken använder det inofficiella biblioteket [`python-garminconnect`](https://github.com/cyberjunky/python-garminconnect) med **hennes** konto och samtycke. Lösenordet sparas aldrig – bara inloggnings-tokens, och de ligger bara i Supabase (tabellen `garmin_tokens`, som ingen klient kan läsa).

```bash
pip install -r sync/requirements.txt
export SUPABASE_URL=https://xxxx.supabase.co
export SUPABASE_SERVICE_KEY=...   # service_role – klistra inte in den någon annanstans
export NELLIE_USER_ID=...
python sync/garmin_login.py       # e-post, lösenord och MFA-kod från Garmin
```

Klart. Jobbet `.github/workflows/garmin-sync.yml` kör varje timme 05–22 och hämtar historik från **19 okt 2026** första gången. Varje körning sparar förnyade tokens, så de går inte ut. Loggarna innehåller bara antal – aldrig hälsodata (repot är publikt).

Kör jobbet direkt: Actions → *Garmin-synk* → Run workflow.

## 4. "Synka nu"-knappen (valfritt)

Knappen startar synkjobbet direkt via en Supabase Edge Function, så att GitHub-token aldrig finns i appen.

1. Skapa en fine-grained token på GitHub: bara repot **PT**, behörighet **Actions: Read and write**.
2. ```bash
   npx supabase login
   npx supabase link --project-ref <projekt-ref>
   npx supabase secrets set GH_TOKEN=<token> GH_REPO=hugohulden/PT ALLOWED_USER_IDS=<Nellies UID>
   npx supabase functions deploy trigger-sync
   ```

Utan detta synkar appen ändå automatiskt varje timme.

## 5. Om Garmin-synken slutar fungera

Biblioteket är inofficiellt och Garmin ändrar ibland inloggningen. Då:
- Appen visar ⚠️ under **Mer → Synk** med meddelandet från senaste körningen.
- **Synka via Claude** fungerar alltid som reserv (hennes Claude har Garmin-kopplingen).
- Uppdatera `garminconnect` i `sync/requirements.txt` och/eller kör `garmin_login.py` igen.

---

## Arkitektur

```
iPhone (PWA, offline först)                    Server
┌──────────────────────────────┐   records    ┌──────────────────────────┐
│ React + Dexie (IndexedDB)    │◄────────────►│ Supabase Postgres (RLS)  │
│ plangenerator, regler,       │ garmin_      │  records, garmin_payloads│
│ matchning, pulstak-omdöme    │◄─payloads────│  sync_status, tokens     │
└──────────────┬───────────────┘              └────────────▲─────────────┘
               │ .md-fil (Web Share)                       │ upsert
               ▼                                           │
     Nellies Claude + Garmin-koppling      GitHub Actions: sync/garmin_sync.py
               │ skapar pass med pulsmål          (python-garminconnect)
               ▼                                           ▲
          Garmin Connect ──────────── klockan ─────────────┘
```

- **Planen genereras från data och regler** (`src/lib/plan/`): faser, avlastningsveckor, långpasstabell, kvalitetspass, gymmallar och pull-up-steg. Inställningar (startdatum, loppdatum, veckodagar, pulstak) styr allt; ändrade/klara pass behålls vid omräkning.
- **Veckonummer:** V1 = 19 okt 2026, V6 = 23 nov, V7 = 30 nov, V31 = loppveckan, lopp lör 22 maj 2027 (testat i `plan.test.ts`).
- **Garmins övningsnycklar** verifieras mot Garmins FIT SDK i testerna.
- **Ingen hip thrust** någonstans – den finns bara i biblioteket som utesluten så att importer känner igen den.
- **Integritet:** RLS på alla tabeller, service-nyckeln finns bara som GitHub-hemlighet, inga analysverktyg, månadsbilder sparas bara i telefonen.
- **Importformat** `nellie-traning/v1` (se `src/lib/importer.ts`) används av synkjobbet, *Synka via Claude*, gymimport och backup – en kodväg, idempotent.

## Kvar att göra
- Webbnotiser (morgonnotis med dagsform, kvällspåminnelse om steg) kräver Web Push med VAPID-nycklar och en schemalagd funktion – byggs när Supabase är på plats.
