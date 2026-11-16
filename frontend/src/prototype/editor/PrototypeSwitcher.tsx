// ПРОТОТИП, выбросить. Плавающий переключатель вариантов (← →) + просмотр состояния модели.
import { useEffect, useState } from 'react';

export interface VariantDef {
  key: string;
  name: string;
}

export function useVariant(variants: VariantDef[]): [string, (k: string) => void] {
  const read = () => new URLSearchParams(location.search).get('variant') ?? variants[0].key;
  const [v, setV] = useState(read);
  const set = (k: string) => {
    const p = new URLSearchParams(location.search);
    p.set('variant', k);
    history.replaceState(null, '', `?${p}`);
    setV(k);
  };
  return [v, set];
}

export default function PrototypeSwitcher({
  variants,
  current,
  onChange,
  state,
}: {
  variants: VariantDef[];
  current: string;
  onChange: (k: string) => void;
  state: unknown;
}) {
  const [showState, setShowState] = useState(false);
  const i = Math.max(0, variants.findIndex((v) => v.key === current));
  const go = (d: number) => onChange(variants[(i + d + variants.length) % variants.length].key);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  if (!import.meta.env.DEV) return null;
  return (
    <>
      {showState && <pre className="pe-state">{JSON.stringify(state, null, 2)}</pre>}
      <div className="pe-switcher">
        <button onClick={() => go(-1)} aria-label="Предыдущий вариант">←</button>
        <span>
          {variants[i].key} ({variants[i].name})
        </span>
        <button onClick={() => go(1)} aria-label="Следующий вариант">→</button>
        <button onClick={() => setShowState((x) => !x)}>{showState ? 'скрыть' : 'состояние'}</button>
      </div>
    </>
  );
}
