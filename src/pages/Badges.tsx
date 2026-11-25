import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { BADGES } from '../lib/badges';
import { prettyDate } from '../lib/dates';
import { Page } from '../components/ui';

const GROUPS: Record<string, string> = { pullup: 'Pull-up', steg: 'Steg', löpning: 'Löpning', gym: 'Gym', vecka: 'Veckor' };

export default function Badges() {
  const got = useLiveQuery(() => db.badges.toArray(), []) ?? [];
  return (
    <Page title="Märken" back>
      <p className="text-soft -mt-2">
        {got.length} av {BADGES.length} märken 🏅
      </p>
      {Object.entries(GROUPS).map(([g, label]) => (
        <section key={g} className="card">
          <h2 className="mb-2 text-lg font-semibold">{label}</h2>
          <div className="grid grid-cols-3 gap-2">
            {BADGES.filter((b) => b.group === g).map((b) => {
              const e = got.find((x) => x.id === b.id);
              return (
                <div key={b.id} className={`card-soft flex flex-col items-center p-2 text-center ${e ? '' : 'opacity-50'}`} title={b.desc}>
                  <span className={`flex h-14 w-14 items-center justify-center rounded-full text-3xl ${e ? 'bg-gold' : 'bg-surface grayscale'}`} aria-hidden>
                    {b.icon}
                  </span>
                  <span className="mt-1 text-xs font-semibold leading-tight">{b.name}</span>
                  <span className="text-soft text-[11px] leading-tight">{e ? prettyDate(e.date) : b.desc}</span>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </Page>
  );
}
