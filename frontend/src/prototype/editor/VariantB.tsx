// ПРОТОТИП, выбросить. Вариант B — «мастер-деталь»: слева потоки со статусами, справа один поток,
// доли полосой, публикация в липкой нижней панели.
import { useState } from 'react';

import {
  active, archived, canPush, catalogById, isDraft, isOfferStream, ktCampaignUrl, offerLabel, problems, streamOrder,
  streamTypeLabel, sum, type EditorModel, type Stream,
} from './model';
import { CampaignSearch, CampaignState, OfferSearch, OfferTags, PinButton, ShareInput, StreamState, Tag } from './parts';

export const name = 'Мастер-деталь';

const COLORS = ['#2b6cb0', '#38a169', '#d69e2e', '#805ad5', '#dd6b20', '#319795', '#e53e3e'];

export default function VariantB({ m }: { m: EditorModel }) {
  const c = m.campaign;
  const streams = c ? streamOrder(c.streams) : [];
  const [sel, setSel] = useState<number | null>(null);
  const current = streams.find((s) => s.id === sel) ?? streams.find(isOfferStream) ?? null;

  return (
    <div className="pb">
      <aside className="pb-side">
        <CampaignSearch m={m} compact />
        {c && (
          <>
            <div className="pb-camp">
              <b>#{c.id}</b> {c.name}
              <div><CampaignState c={c} /></div>
              <div className="pb-links">
                <button onClick={m.actions.fetch}>⟳ Fetch</button>
                <a href={ktCampaignUrl(c.id)} target="_blank" rel="noreferrer">Открыть в Keitaro ↗</a>
              </div>
            </div>
            <div className="pb-caption">Потоки в порядке проверки Keitaro</div>
            <ul className="pb-streams">
              {streams.map((s) => {
                const offer = isOfferStream(s);
                const dot = !offer ? 'ro' : problems(s).length ? 'bad' : isDraft(s) ? 'draft' : 'ok';
                return (
                  <li
                    key={s.id}
                    className={(current?.id === s.id ? 'on ' : '') + (offer ? '' : 'ro')}
                    onClick={() => offer && setSel(s.id)}
                    title={offer ? undefined : 'Не оффер-поток, только просмотр'}
                  >
                    <span className={`pb-dot pb-dot-${dot}`} />
                    <span>
                      {s.name}
                      <small>{streamTypeLabel[s.type]} · #{s.position}{offer ? ` · ${active(s).length} офф.` : ` · ${s.schema}`}</small>
                    </span>
                    {isDraft(s) && offer && <Tag tone="draft">черновик</Tag>}
                  </li>
                );
              })}
            </ul>
            <div className="pb-legend">
              <span><i className="pb-dot pb-dot-ok" /> опубликован</span>
              <span><i className="pb-dot pb-dot-draft" /> черновик</span>
              <span><i className="pb-dot pb-dot-bad" /> требует внимания</span>
            </div>
          </>
        )}
      </aside>
      <section className="pb-main">
        {c?.notices.map((n) => <div key={n} className="pe-alert pe-alert-bad">{n}</div>)}
        {c && !c.streams.some(isOfferStream) && <div className="pe-alert">В кампании нет оффер-потоков — редактировать нечего</div>}
        {current && <Detail s={current} m={m} />}
      </section>
    </div>
  );
}

function Detail({ s, m }: { s: Stream; m: EditorModel }) {
  const [showArchive, setShowArchive] = useState(false);
  const a = active(s);
  const arch = archived(s);
  const draft = isDraft(s);
  return (
    <div className={'pb-detail' + (draft ? ' pb-detail-draft' : '')}>
      <h2>
        {s.name} <StreamState s={s} />
      </h2>
      <div className="pe-muted">stream_id {s.id} · {streamTypeLabel[s.type]} · позиция {s.position}</div>

      {problems(s).map((p) => (
        <div key={p.kind} className={'pe-alert ' + (p.kind === 'changed' ? 'pe-alert-bad' : 'pe-alert-warn')}>
          ⚠ {p.text}
          {p.kind === 'sum' && <button onClick={() => m.actions.recalc(s.id)}>Пересчитать до 100</button>}
        </div>
      ))}

      <div className="pb-bar" title="Распределение трафика">
        {a.map((r, i) => (
          <div key={r.offer_id} style={{ flexGrow: r.share, background: COLORS[i % COLORS.length] }}>
            {r.share >= 8 ? `${r.share}%` : ''}
          </div>
        ))}
        {sum(a) < 100 && <div className="pb-bar-gap" style={{ flexGrow: 100 - sum(a) }}>{100 - sum(a)}% никуда</div>}
      </div>

      <div className="pb-cards">
        {a.length === 0 && <div className="pe-muted">В потоке пока нет офферов. Первый добавленный получит 100%.</div>}
        {a.map((r, i) => (
          <div key={r.offer_id} className="pb-card">
            <span className="pb-swatch" style={{ background: COLORS[i % COLORS.length] }} />
            <div className="pb-card-name">
              {offerLabel(r.offer_id)}
              <div><OfferTags r={r} />{r.pinned && <Tag>закреплена</Tag>}</div>
            </div>
            <ShareInput value={r.share} onCommit={(v) => m.actions.setShare(s.id, r.offer_id, v)} />
            <span>%</span>
            <PinButton pinned={r.pinned} onClick={() => m.actions.togglePin(s.id, r.offer_id)} />
            <button className="pb-x" disabled={a.length <= 1} title={a.length <= 1 ? 'Последний оффер убрать нельзя' : 'Убрать в архив'}
              onClick={() => m.actions.remove(s.id, r.offer_id)}>✕</button>
          </div>
        ))}
      </div>

      <div className="pb-add">
        <OfferSearch m={m} onAdd={(id) => m.actions.add(s.id, id)} label="+ Добавить" />
      </div>

      {arch.length > 0 && (
        <div className="pb-archive">
          <button className="pb-link" onClick={() => setShowArchive((x) => !x)}>
            {showArchive ? '▾' : '▸'} Архив ({arch.length})
          </button>
          {showArchive && arch.map((r) => (
            <div key={r.offer_id} className="pb-arch-row">
              {offerLabel(r.offer_id)} <OfferTags r={r} />
              <button disabled={!catalogById.has(r.offer_id)} onClick={() => m.actions.bringBack(s.id, r.offer_id)}>Вернуть</button>
            </div>
          ))}
        </div>
      )}

      {draft && (
        <div className="pb-sticky">
          <span>Неопубликованные изменения · Σ {sum(a)}%</span>
          <button onClick={() => m.actions.cancel(s.id)}>Отменить</button>
          {s.keitaroChanged ? (
            <button className="pe-danger" onClick={() => confirm('В Keitaro поток изменился. Перезаписать его вашей версией?') && m.actions.push(s.id, true)}>
              Перезаписать Keitaro
            </button>
          ) : (
            <button className="pe-primary" disabled={!canPush(s)} onClick={() => m.actions.push(s.id)}>Опубликовать в Keitaro</button>
          )}
        </div>
      )}
    </div>
  );
}
