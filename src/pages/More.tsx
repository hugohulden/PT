import { MenuLink, Page } from '../components/ui';

export default function More() {
  return (
    <Page title="Mer">
      <div className="space-y-2">
        <MenuLink to="/plan" icon="🗺️" label="Plan" hint="Hela vägen V6 → Göteborgsvarvet" />
        <MenuLink to="/pullup" icon="🧗‍♀️" label="Vägen till min första pull-up" hint="Milstolpar, tester och graf" />
        <MenuLink to="/vikt" icon="⚖️" label="Vikt & mått" hint="Trend, midja, höft, lår" />
        <MenuLink to="/halsa" icon="🌙" label="Hälsa" hint="Sömn, vilopuls, HRV" />
        <MenuLink to="/marken" icon="🏅" label="Märken" hint="Alla märken och milstolpar" />
        <MenuLink to="/garmin" icon="⌚" label="Skicka till Garmin" hint="Fil till din Claude + guide" />
        <MenuLink to="/synk" icon="☁️" label="Synk" hint="Garmin → app, eller via Claude" />
        <MenuLink to="/import" icon="📥" label="Importera" hint="Gamla pass, CSV, fritext" />
        <MenuLink to="/installningar" icon="⚙️" label="Inställningar" hint="Datum, pulstak, tema, backup" />
      </div>
    </Page>
  );
}
