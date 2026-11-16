// ПРОТОТИП, выбросить. Мелкие общие детали вариантов (не раскладка).
import { useState } from 'react';

import { catalogById, type Campaign, type CatalogOffer, type EditorModel, type Row, type Stream } from './model';

export function CampaignSearch({ m, compact }: { m: EditorModel; compact?: boolean }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const found = m.searchCampaigns(q);
  return (
    <div className="pe-search">
      <input
        placeholder="Кампания: название или ID"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <ul className={'pe-dropdown' + (compact ? ' pe-dropdown-compact' : '')}>
          {found.length === 0 && <li className="pe-muted">Ничего не найдено</li>}
          {found.map((c) => (
            <li key={c.id} onMouseDown={() => { m.setCampaignId(c.id); setQ(''); }}>
              <b>#{c.id}</b> {c.name} <CampaignState c={c} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function OfferSearch({ m, onAdd, label = 'Add' }: { m: EditorModel; onAdd: (id: number) => void; label?: string }) {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<CatalogOffer | null>(null);
  const [open, setOpen] = useState(false);
  const found = m.searchOffers(q).slice(0, 8);
  return (
    <div className="pe-offer-search">
      <div className="pe-search">
        <input
          placeholder="Оффер: название или ID"
          value={picked ? `#${picked.id} ${picked.name}` : q}
          onChange={(e) => { setPicked(null); setQ(e.target.value); }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        />
        {open && !picked && (
          <ul className="pe-dropdown">
            {found.map((o) => (
              <li key={o.id} onMouseDown={() => setPicked(o)}>
                <b>#{o.id}</b> {o.name} {o.state === 'disabled' && <Tag tone="warn">выключен в Keitaro</Tag>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <button disabled={!picked} onClick={() => { if (picked) { onAdd(picked.id); setPicked(null); setQ(''); } }}>
        {label}
      </button>
    </div>
  );
}

export function Tag({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'warn' | 'bad' | 'ok' | 'draft' }) {
  return <span className={`pe-tag pe-tag-${tone}`}>{children}</span>;
}

export function CampaignState({ c }: { c: Campaign }) {
  return c.state === 'paused' ? <Tag tone="warn">кампания на паузе</Tag> : <Tag tone="ok">кампания активна</Tag>;
}

export function StreamState({ s }: { s: Stream }) {
  return s.state === 'disabled' ? <Tag tone="warn">поток выключен</Tag> : null;
}

export function OfferTags({ r }: { r: Row }) {
  const o = catalogById.get(r.offer_id);
  return (
    <>
      {!o && <Tag tone="bad">удалён в Keitaro</Tag>}
      {o?.state === 'disabled' && <Tag tone="warn">выключен в Keitaro</Tag>}
      {r.isNew && !r.archived && <Tag tone="draft">новый</Tag>}
    </>
  );
}

/** Поле доли: показывает число, ввод по Enter/blur закрепляет долю. */
export function ShareInput({ value, onCommit, disabled }: { value: number; onCommit: (v: number) => void; disabled?: boolean }) {
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text !== null && text !== String(value)) onCommit(Number(text));
    setText(null);
  };
  return (
    <input
      className="pe-share"
      type="number"
      min={0}
      max={100}
      disabled={disabled}
      value={text ?? value}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      aria-label="Доля, %"
    />
  );
}

export function PinButton({ pinned, onClick, disabled }: { pinned: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      className={'pe-pin' + (pinned ? ' on' : '')}
      onClick={onClick}
      disabled={disabled}
      title={pinned ? 'Снять закрепление' : 'Закрепить долю'}
      aria-pressed={pinned}
    >
      📌
    </button>
  );
}

export function Toast({ m }: { m: EditorModel }) {
  return m.toast ? <div className="pe-toast">{m.toast}</div> : null;
}
