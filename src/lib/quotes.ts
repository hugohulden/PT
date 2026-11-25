export const QUOTES = [
  'Starka tjejer lyfter varandra – och skivstänger 💪',
  'Lugnt idag = snabbt på Varvet 🏃‍♀️',
  'Du behöver inte vara snabb. Du behöver vara envis ✨',
  'Varje set räknas. Även de tunga 💖',
  'Pulstaket är din superkraft.',
  'Rumpan tackar dig imorgon 🍑',
  'Ett steg i taget – 10 000 gånger om dagen.',
  'Den bästa träningen är den du faktiskt gör.',
  'Gå i backen. Vinn på Varvet.',
  'Starkare än igår. Det är hela grejen.',
  'Vila är också träning 🌙',
  'Första pull-upen är närmare än du tror.',
  'Du springer inte från något – du springer mot målet 🏁',
  'Kroppen klarar det. Det är huvudet du övertygar.',
  'Pepp, puls och pull-ups 💗',
  'Liten framgång varje dag blir stor framgång i maj.',
];

export function quoteOfDay(date: string, custom: string[] = []): string {
  const all = [...QUOTES, ...custom];
  const n = [...date].reduce((s, c) => s + c.charCodeAt(0), 0);
  return all[n % all.length];
}
