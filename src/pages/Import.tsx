import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CSV_TEMPLATE, claudeGymPrompt } from '../lib/importer';
import { shareTextFile } from '../lib/garminExport';
import ImportFlow, { CopyBox } from '../components/ImportFlow';
import { Page, Section, Toast } from '../components/ui';

export default function Import() {
  const [toast, setToast] = useState<string | null>(null);
  return (
    <Page title="Importera" back>
      <Toast msg={toast} onDone={() => setToast(null)} />

      <Section title="🏃‍♀️ Garmin-historik (V1–V5)">
        <p className="text-sm">
          Löppass, simning, steg, sömn och vikt från 19 okt hämtas automatiskt av Garmin-synken. Vill du ha in dem direkt: använd{' '}
          <Link to="/synk" className="text-accent font-semibold underline">
            Synka via Claude
          </Link>{' '}
          och välj <i>Allt från V1</i>.
        </p>
      </Section>

      <Section title="📝 Gymanteckningar via Claude">
        <p className="mb-2 text-sm">Har du gamla pass i anteckningar, en annan app eller som Garmin-styrkepass? Kopiera prompten, klistra in den i Claude med dina anteckningar under, och klistra sedan in svaret här.</p>
        <CopyBox text={claudeGymPrompt()} label="📋 Kopiera prompten" />
        <div className="mt-3">
          <ImportFlow source="json" placeholder="Klistra in Claudes JSON-svar, en CSV eller en backup…" onDone={setToast} />
        </div>
      </Section>

      <Section title="📄 CSV-mall">
        <p className="mb-2 text-sm">
          Fyll i i Numbers, Excel eller Google Kalkylark med kolumnerna <code>datum, övning, set, reps, vikt_kg, anteckning</code>, spara som CSV och välj filen ovan.
        </p>
        <button className="btn btn-ghost w-full" onClick={() => shareTextFile('gym-mall.csv', CSV_TEMPLATE)}>
          Ladda ner CSV-mallen
        </button>
      </Section>

      <Section title="✍️ Manuellt">
        <p className="mb-2 text-sm">Registrera ett pass för valfritt datum, med samma loggning som vanligt.</p>
        <Link to="/logga" className="btn btn-ghost w-full">
          Logga → Eget pass eller historiskt datum
        </Link>
      </Section>

      <p className="text-soft text-center text-xs">Allt du importerar visas i en förhandsgranskning först. Samma fil två gånger skapar inga dubbletter.</p>
    </Page>
  );
}
