import { useEffect, useId, useRef, useState } from 'react';

import { api, toApiError, type ApiError, type CampaignShort } from '../api';
import CampaignState from './CampaignState';

const DEBOUNCE_MS = 250;

interface Props {
  onSelect: (campaign: CampaignShort) => void;
  onError: (error: ApiError) => void;
}

/** Поиск кампании Keitaro по названию или ID; фильтрует бэк (`?q=`). */
export default function CampaignSearch({ onSelect, onError }: Props) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<CampaignShort[]>([]);
  const [open, setOpen] = useState(false);
  const latest = useRef('');
  const listId = useId();

  useEffect(() => {
    const query = q.trim();
    latest.current = query;
    if (!query) {
      setFound([]);
      return;
    }
    const timer = window.setTimeout(() => {
      api
        .searchCampaigns(query)
        // Ответ на устаревший запрос не показываем.
        .then((list) => latest.current === query && setFound(list))
        .catch((e) => onError(toApiError(e)));
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [q, onError]);

  const pick = (campaign: CampaignShort) => {
    setQ('');
    setOpen(false);
    onSelect(campaign);
  };

  const showList = open && q.trim() !== '';

  return (
    <div className="search">
      <input
        role="combobox"
        aria-label="Кампания"
        aria-expanded={showList}
        aria-controls={listId}
        placeholder="Кампания: название или ID"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // Задержка, чтобы клик по варианту успел сработать до закрытия списка.
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      />
      {showList && (
        <ul id={listId} role="listbox" className="search__list">
          {found.length === 0 && <li className="muted">Ничего не найдено</li>}
          {found.map((c) => (
            <li key={c.id} role="option" aria-selected={false} onMouseDown={() => pick(c)}>
              <b>#{c.id}</b> {c.name} <CampaignState state={c.state} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
