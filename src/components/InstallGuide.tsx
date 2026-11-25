import { useState } from 'react';
import { Sheet } from './ui';

function shouldShow() {
  try {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone = (navigator as unknown as { standalone?: boolean }).standalone || matchMedia('(display-mode: standalone)').matches;
    return ios && !standalone && !localStorage.getItem('installGuideSeen');
  } catch {
    return false;
  }
}

/** iOS saknar installationsprompt – visa en egen guide första gången i Safari. */
export default function InstallGuide() {
  const [open, setOpen] = useState(shouldShow);
  const close = () => {
    try {
      localStorage.setItem('installGuideSeen', '1');
    } catch {
      /* ok */
    }
    setOpen(false);
  };
  return (
    <Sheet open={open} onClose={close} title="Lägg appen på hemskärmen 💖">
      <ol className="space-y-3 text-base">
        <li className="card-soft">
          1. Tryck på <b>Dela</b>-knappen <span aria-hidden>⬆️</span> längst ner i Safari.
        </li>
        <li className="card-soft">
          2. Scrolla och välj <b>Lägg till på hemskärmen</b>.
        </li>
        <li className="card-soft">
          3. Tryck <b>Lägg till</b>. Öppna sedan appen från hemskärmen – då fungerar den offline, i helskärm och med notiser.
        </li>
      </ol>
      <button className="btn btn-primary mt-4 w-full" onClick={close}>
        Jag fattar!
      </button>
    </Sheet>
  );
}
