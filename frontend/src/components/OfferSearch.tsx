import { useEffect, useRef, useState } from 'react';

import { api, toApiError, type ApiError, type OfferShort } from '../api';
import ErrorBanner from './ErrorBanner';

/** Пауза после ввода перед запросом к бэку, мс. */
const DEBOUNCE_MS = 300;

interface Props {
  /** ID выбранного оффера строкой; `''` — ничего не выбрано. */
  value: string;
  onChange: (value: string) => void;
}

function label(o: OfferShort): string {
  return o.group ? `${o.id} — ${o.name} (${o.group})` : `${o.id} — ${o.name}`;
}

/**
 * Поиск оффера Keitaro по названию или ID и выбор из найденного.
 * Общий для формы создаватора и добавления оффера в редакторе.
 */
export default function OfferSearch({ value, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<OfferShort[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setFound(null);
      return;
    }
    let stale = false;
    const timer = setTimeout(() => {
      api
        .searchOffers(q)
        .then((offers) => {
          if (stale) return;
          setError(null);
          setFound(offers);
          onChangeRef.current(offers.length ? String(offers[0].id) : '');
        })
        .catch((e) => {
          if (!stale) setError(toApiError(e));
        });
    }, DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="offer-search">
      <ErrorBanner error={error} onClose={() => setError(null)} />
      <input
        type="search"
        aria-label="Поиск оффера"
        placeholder="Название или ID оффера"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {found && found.length === 0 && <span className="hint">Ничего не найдено</span>}
      {found && found.length > 0 && (
        <select aria-label="Найденные офферы" value={value} onChange={(e) => onChange(e.target.value)}>
          {found.map((o) => (
            <option key={o.id} value={o.id}>
              {label(o)}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
