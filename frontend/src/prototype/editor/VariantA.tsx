// ПРОТОТИП, выбросить. Вариант A — «как в видео»: потоки стопкой, таблица на поток, черновик жёлтый.
import { useState } from 'react';

import {
  active, archived, canPush, CATALOG, catalogById, isDraft, isOfferStream, ktCampaignUrl, offerLabel, problems, streamOrder,
  streamTypeLabel, sum, type EditorModel, type Stream,
} from './model';
import { CampaignSearch, CampaignState, OfferSearch, OfferTags, PinButton, ShareInput, StreamState, Tag } from './parts';

export const name = 'Как в видео';

export default function VariantA({ m }: { m: EditorModel }) {
  const [showAll, setShowAll] = useState(false);
  const c = m.campaign;
  return (
    <div className="pa">
      <CampaignSearch m={m} />
      {c && (
        <>
          <div className="pa-toolbar">
            <h2>
              #{c.id} {c.name} <CampaignState c={c} />
            </h2>
            <button onClick={m.actions.fetch}>Fetch streams from KT</button>
            <a href={ktCampaignUrl(c.id)} target="_blank" rel="noreferrer">View in KT ↗</a>
            <span className="pa-spacer" />
            <button onClick={() => setShowAll((x) => !x)}>Show all offers</button>
          </div>
          {showAll && (
            <div className="pa-allbox">
              <b>Все офферы Keitaro ({CATALOG.length}):</b> {CATALOG.map((o) => `#${o.id} ${o.name}`).join(' · ')}
            </div>
          )}
          {c.notices.map((n) => <div key={n} className="pe-alert pe-alert-bad">{n}</div>)}
          {!c.streams.some(isOfferStream) && <div className="pe-alert">В кампании нет оффер-потоков</div>}
          {streamOrder(c.streams).map((s) => <StreamBlock key={s.id} s={s} m={m} />)}
        </>
      )}
    </div>
  );
}

function StreamBlock({ s, m }: { s: Stream; m: EditorModel }) {
  const head = (
    <div className="pa-head">
      Stream: <b>{s.name}</b> (#{s.position}) · {streamTypeLabel[s.type]} · {s.filter ? `filter by ${s.filter} · ` : ''}
      stream_id {s.id} <StreamState s={s} />
    </div>
  );
  if (!isOfferStream(s)) return <div className="pa-block pa-block-ro">{head}<div className="pe-muted">→ {s.redirectUrl ?? s.schema}</div></div>;
  const draft = isDraft(s);
  const a = active(s);
  return (
    <div className={'pa-block' + (draft ? ' pa-draft' : '')}>
      {head}
      {draft && (
        <div className="pa-pushrow">
          {s.keitaroChanged ? (
            <button className="pe-danger" onClick={() => confirm('Перезаписать изменения в Keitaro?') && m.actions.push(s.id, true)}>
              Перезаписать
            </button>
          ) : (
            <button className="pe-primary" disabled={!canPush(s)} onClick={() => m.actions.push(s.id)}>Push to KT</button>
          )}
          <button onClick={() => m.actions.cancel(s.id)}>Cancel</button>
        </div>
      )}
      {problems(s).map((p) => (
        <div key={p.kind} className={'pe-alert ' + (p.kind === 'changed' ? 'pe-alert-bad' : 'pe-alert-warn')}>
          {p.text}
          {p.kind === 'sum' && <button onClick={() => m.actions.recalc(s.id)}>Пересчитать</button>}
        </div>
      ))}
      <table className="pa-table">
        <thead>
          <tr><th>Оффер</th><th>Share</th><th className="pa-dim">Stats</th><th className="pa-dim">Trends</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {a.length === 0 && <tr><td colSpan={5} className="pe-muted">В потоке нет офферов — первый добавленный получит 100%</td></tr>}
          {a.map((r) => (
            <tr key={r.offer_id}>
              <td>{offerLabel(r.offer_id)} <OfferTags r={r} /></td>
              <td className="pa-share">
                <ShareInput value={r.share} onCommit={(v) => m.actions.setShare(s.id, r.offer_id, v)} />%
                <PinButton pinned={r.pinned} onClick={() => m.actions.togglePin(s.id, r.offer_id)} />
              </td>
              <td className="pa-dim">—</td>
              <td className="pa-dim">—</td>
              <td><button disabled={a.length <= 1} onClick={() => m.actions.remove(s.id, r.offer_id)}>Remove</button></td>
            </tr>
          ))}
          {archived(s).map((r) => (
            <tr key={r.offer_id} className="pa-removed">
              <td>{offerLabel(r.offer_id)} (removed) <OfferTags r={r} /></td>
              <td>0%</td>
              <td className="pa-dim">—</td>
              <td className="pa-dim">—</td>
              <td><button disabled={!catalogById.has(r.offer_id)} title={catalogById.has(r.offer_id) ? undefined : "Оффер удалён в Keitaro"} onClick={() => m.actions.bringBack(s.id, r.offer_id)}>Bring back</button></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td>Σ активных</td><td colSpan={4}>{sum(a)}% {sum(a) !== 100 && a.length > 0 && <Tag tone="warn">≠ 100</Tag>}</td></tr>
        </tfoot>
      </table>
      <OfferSearch m={m} onAdd={(id) => m.actions.add(s.id, id)} />
    </div>
  );
}
