# Nellies träning 💖

En installerbar PWA för iPhone: plan mot **Göteborgsvarvet 22 maj 2027**, gymloggning, vägen till första pull-upen, steg, vikt och dagsform – med Garmin åt båda hållen.

**Appen:** https://hugohulden.github.io/PT/ (öppna i Safari → Dela → *Lägg till på hemskärmen*)

Allt fungerar offline. Datan sparas först i telefonen (IndexedDB) och synkas till Supabase när hon är inloggad.

---

## Status – vad som behöver göras

| Steg | Vem | Klart? |
|---|---|---|
| Appen på GitHub Pages | – | ✅ |
| Klocka → app via Intervals.icu | Nellie (5 min) | ⬜ |
| Skicka pass till Garmin (fil → hennes Claude) | Nellie | Fungerar nu |
| Molnbackup i Supabase (valfritt) | Hugo | ⬜ avsnitt 3 |

### Nellies checklista (10 min, kräver hennes telefon)
1. Öppna https://hugohulden.github.io/PT/ i **Safari** → Dela ⬆️ → **Lägg till på hemskärmen**. Öppna appen därifrån.
2. Skapa ett gratis konto på **intervals.icu** → *Settings → Connections* → koppla **Garmin Connect**. Kryssa i att aktiviteter och **wellness-data** (sömn, HRV, vilopuls, vikt, steg) ska laddas ner.
3. Intervals.icu → *Settings → Developer Settings* → skapa en **API-nyckel**.
4. I appen: **Mer → Synk** → klistra in nyckeln → **Spara och synka**. Allt från 19 okt (V1) hämtas och kopplas till planen.
5. **Mer → Skicka till Garmin** → *Skicka till Garmin* → välj Claude → skriv "Gör som filen säger". Synka klockan.

---

## 1. Utveckling

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # enhetstester (plan, datum, import, Intervals.icu, Garmin-fil, regler)
```

Varje push till `main` testas och publiceras automatiskt till GitHub Pages (`.github/workflows/deploy.yml`).

## 2. Klocka → app (Intervals.icu)

Garmin Connect → **Intervals.icu** (officiell Garmin-partner) → appen. Appen hämtar direkt från Intervals.icus API när den öppnas (högst var 10:e minut) och när hon trycker *Synka nu*. Ingen server, inga Garmin-lösenord.

- **Vad som kommer in:** löppass, simning, styrkepass (tid och puls), promenader, sömn, vilopuls, HRV, vikt och steg – i den mån Intervals.icu får dem från Garmin. Saknas steg visar appen en varning; *Synka via Claude* fyller i luckor.
- **HRV-status:** Intervals.icu har HRV-värdet men inte Garmins status, så appen räknar status mot en 21-dagars baslinje (±1 standardavvikelse = balanserad).
- **Dubbletter:** samma pass från Intervals.icu och Claude slås ihop (samma typ, start inom 3 min).
- **Nyckeln** sparas bara i telefonen (inte i backup eller molnsynk).
- **Om anropet blockeras (CORS):** deploya `proxy/worker.js` som en gratis Cloudflare Worker och lägg adressen under *Mellanserver*. Den skickar bara vidare anrop och sparar ingenting.
- **Senare:** Intervals.icu kan också ladda upp planerade löppass till Garmin-kalendern. Det ska testas när hon är kopplad – pulsmålen måste komma fram korrekt innan vi byter från Claude-filen.

## 3. Molnbackup i Supabase (valfritt)

Utan detta sparas allt bara i telefonen (och i JSON-backupen under Inställningar). Med det synkas allt till molnet och överlever att iOS rensar appen eller att hon byter telefon.

1. Skapa ett projekt på https://supabase.com – region **Stockholm (eu-north-1)**.
2. **SQL Editor** → klistra in `supabase/schema.sql` → Run.
3. **Authentication → Users → Add user → Send invitation** med Nellies e-post.
4. **Authentication → Sign In / Providers → Email**: stäng av *Allow new users to sign up*.
5. **Authentication → Emails → Magic Link**: lägg in koden i mallen, t.ex. `<h2>Din kod: {{ .Token }}</h2>` (appen använder koden – länkar öppnas i Safari och inte i hemskärms-appen).
6. **GitHub → Settings → Secrets and variables → Actions → Variables**: `SUPABASE_URL` och `SUPABASE_ANON_KEY` (*anon public*, Project Settings → API). Publika värden, skyddade av RLS.
7. Kör om deploy-workflowen. Sedan: **Mer → Synk → Molnbackup** → logga in med koden från mejlet.

---

## Arkitektur

```
iPhone (PWA, offline först)                       Valfritt
┌──────────────────────────────┐   records   ┌────────────────────────┐
│ React + Dexie (IndexedDB)    │◄───────────►│ Supabase (RLS) backup  │
│ plangenerator, regler,       │             └────────────────────────┘
│ matchning, pulstak-omdöme    │◄── REST ── Intervals.icu ◄── Garmin Connect ◄── klockan
└──────────────┬───────────────┘   (API-nyckel i telefonen)                 ▲
               │ .md-fil (Web Share)                                          │
               ▼                                                              │
     Nellies Claude + Garmin-koppling ── skapar pass med pulsmål ─────────────┘
```

- **Planen genereras från data och regler** (`src/lib/plan/`): faser, avlastningsveckor, långpasstabell, kvalitetspass, gymmallar och pull-up-steg. Inställningar (startdatum, loppdatum, veckodagar, pulstak) styr allt; ändrade/klara pass behålls vid omräkning.
- **Veckonummer:** V1 = 19 okt 2026, V6 = 23 nov, V7 = 30 nov, V31 = loppveckan, lopp lör 22 maj 2027 (testat i `plan.test.ts`).
- **Garmins övningsnycklar** verifieras mot Garmins FIT SDK i testerna.
- **Ingen hip thrust** någonstans – den finns bara i biblioteket som utesluten så att importer känner igen den.
- **Integritet:** inga servrar med hennes Garmin-uppgifter, RLS i Supabase, inga analysverktyg, API-nyckel och månadsbilder sparas bara i telefonen.
- **Importformat** `nellie-traning/v1` (se `src/lib/importer.ts`) används av Intervals.icu-synken, *Synka via Claude*, gymimport och CSV – en kodväg, idempotent.

## Kvar att göra
- Webbnotiser (morgonnotis med dagsform, kvällspåminnelse om steg) kräver Web Push med VAPID-nycklar och en schemalagd server.
- Testa Intervals.icus uppladdning av planerade löppass till Garmin (pulsmål).
