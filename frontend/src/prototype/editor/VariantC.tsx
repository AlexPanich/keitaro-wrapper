// ПРОТОТИП, выбросить. Вариант C — «ревью правок»: таблица «в Keitaro → станет», общая панель черновиков
// сверху, публикация через диалог с диффом, потоки без офферов свёрнуты.
import { useState } from 'react';

import {
  active, archived, canPush, catalogById, isDraft, isOfferStream, ktCampaignUrl, offerLabel, problems, streamOrder,
  streamTypeLabel, sum, type EditorModel, type Stream,
} from './model';
import { CampaignSearch, CampaignState, OfferSearch, OfferTags, PinButton, ShareInput, StreamState, Tag } from './parts';

export const name = 'Ревью правок';

export default function VariantC({ m }: { m: EditorModel }) {
  const c = m.campaign;
  const [review, setReview] = useState<number | null>(null);
  const [showOther, setShowOther] = useState(false);
  if (!c) return <CampaignSearch m={m} />;
  const streams = streamOrder(c.streams);
  const offerStreams = streams.filter(isOfferStream);
  const other = streams.filter((s) => !isOfferStream(s));
  const drafts = offerStreams.filter(isDraft);
  const reviewing = offerStreams.find((s) => s.id === review);

  return (
    <div className="pc">
      <div className="pc-top">
        <div className="pc-title">
          <span className="pe-muted">Кампания</span>
          <h2>#{c.id} {c.name}</h2>
          <CampaignState c={c} /> <a href={ktCampaignUrl(c.id)} target="_blank" rel="noreferrer">в Keitaro ↗</a>
        </div>
        <div className="pc-top-right">
          <CampaignSearch m={m} />
          <button onClick={m.actions.fetch}>Обновить из Keitaro</button>
        </div>
      </div>

      {c.notices.map((n) => <div key={n} className="pe-alert pe-alert-bad">{n}</div>)}

      <div className={'pc-drafts' + (drafts.length ? ' has' : '')}>
        {drafts.length === 0 ? (
          <span>✓ Всё совпадает с Keitaro</span>
        ) : (
          <>
            <b>Неопубликовано: {drafts.length}</b>
            {drafts.map((s) => (
              <span key={s.id} className="pc-chip">
                {s.name}
                {s.keitaroChanged && <Tag tone="bad">конфликт</Tag>}
                <button className="pe-primary" disabled={!canPush(s)} onClick={() => setReview(s.id)}>Проверить и опубликовать</button>
                <button onClick={() => m.actions.cancel(s.id)}>Отменить</button>
              </span>
            ))}
          </>
        )}
      </div>

      {offerStreams.length === 0 && <div className="pe-alert">В кампании нет оффер-потоков</div>}
      {offerStreams.map((s) => <StreamTable key={s.id} s={s} m={m} />)}

      {other.length > 0 && (
        <div className="pc-other">
          <button className="pb-link" onClick={() => setShowOther((x) => !x)}>
            {showOther ? '▾' : '▸'} Другие потоки кампании ({other.length}) — не оффер-потоки, только просмотр
          </button>
          {showOther && (
            <ul>
              {other.map((s) => (
                <li key={s.id}>
                  {streamTypeLabel[s.type]} #{s.position} <b>{s.name}</b> {s.filter && `· ${s.filter}`} → {s.redirectUrl}
                  <StreamState s={s} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {reviewing && <ReviewDialog s={reviewing} m={m} onClose={() => setReview(null)} />}
    </div>
  );
}

function StreamTable({ s, m }: { s: Stream; m: EditorModel }) {
  const a = active(s);
  const pub = new Map(s.published.map((p) => [p.offer_id, p.share]));
  const draft = isDraft(s);
  return (
    <div className={'pc-stream' + (draft ? ' pc-stream-draft' : '')}>
      <div className="pc-stream-head">
        <b>{s.name}</b> <span className="pe-muted">{streamTypeLabel[s.type]} #{s.position} · id {s.id}</span>
        <StreamState s={s} />
        {draft && <Tag tone="draft">черновик</Tag>}
      </div>
      {problems(s).map((p) => (
        <div key={p.kind} className={'pe-alert ' + (p.kind === 'changed' ? 'pe-alert-bad' : 'pe-alert-warn')}>
          {p.text}
          {p.kind === 'sum' && <button onClick={() => m.actions.recalc(s.id)}>Пересчитать</button>}
        </div>
      ))}
      <table className="pc-table">
        <thead>
          <tr><th>Оффер</th><th>В Keitaro</th><th></th><th>Станет</th><th></th><th></th></tr>
        </thead>
        <tbody>
          {a.map((r) => {
            const was = pub.get(r.offer_id);
            const changed = was !== r.share;
            return (
              <tr key={r.offer_id} className={changed ? 'pc-changed' : ''}>
                <td>{offerLabel(r.offer_id)} <OfferTags r={r} /></td>
                <td className="pc-num">{was === undefined ? '—' : `${was}%`}</td>
                <td className="pc-arrow">{changed ? '→' : ''}</td>
                <td className="pc-num"><ShareInput value={r.share} onCommit={(v) => m.actions.setShare(s.id, r.offer_id, v)} /></td>
                <td><PinButton pinned={r.pinned} onClick={() => m.actions.togglePin(s.id, r.offer_id)} /></td>
                <td><button className="pb-link" disabled={a.length <= 1} onClick={() => m.actions.remove(s.id, r.offer_id)}>убрать</button></td>
              </tr>
            );
          })}
          {archived(s).map((r) => {
            const was = pub.get(r.offer_id);
            return (
              <tr key={r.offer_id} className={'pc-archived' + (was !== undefined ? ' pc-changed' : '')}>
                <td><s>{offerLabel(r.offer_id)}</s> <OfferTags r={r} /> <Tag>архив</Tag></td>
                <td className="pc-num">{was === undefined ? '—' : `${was}%`}</td>
                <td className="pc-arrow">{was !== undefined ? '→' : ''}</td>
                <td className="pc-num">—</td>
                <td></td>
                <td><button className="pb-link" disabled={!catalogById.has(r.offer_id)} onClick={() => m.actions.bringBack(s.id, r.offer_id)}>вернуть</button></td>
              </tr>
            );
          })}
          {a.length === 0 && <tr><td colSpan={6} className="pe-muted">Пустой поток — первый оффер получит 100%</td></tr>}
        </tbody>
        <tfoot>
          <tr><td>Итого</td><td className="pc-num">{sum(s.published)}%</td><td></td><td className="pc-num">{sum(a)}%</td><td colSpan={2}></td></tr>
        </tfoot>
      </table>
      <OfferSearch m={m} onAdd={(id) => m.actions.add(s.id, id)} label="Добавить" />
    </div>
  );
}

function ReviewDialog({ s, m, onClose }: { s: Stream; m: EditorModel; onClose: () => void }) {
  const a = active(s);
  const pub = new Map(s.published.map((p) => [p.offer_id, p.share]));
  const removed = s.published.filter((p) => !a.some((r) => r.offer_id === p.offer_id));
  return (
    <div className="pc-modal-bg" onClick={onClose}>
      <div className="pc-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Опубликовать «{s.name}» в Keitaro</h3>
        {s.keitaroChanged && (
          <div className="pe-alert pe-alert-bad">
            Поток в Keitaro изменился после начала правок. Публикация перезапишет его версией ниже.
          </div>
        )}
        <ul className="pc-diff">
          {a.map((r) => {
            const was = pub.get(r.offer_id);
            return (
              <li key={r.offer_id}>
                {was === undefined ? <Tag tone="ok">+ добавится</Tag> : was !== r.share ? <Tag tone="draft">изменится</Tag> : <Tag>без изменений</Tag>}{' '}
                {offerLabel(r.offer_id)}: {was === undefined ? '' : `${was}% → `}<b>{r.share}%</b>
              </li>
            );
          })}
          {removed.map((p) => (
            <li key={p.offer_id}><Tag tone="bad">− уберётся</Tag> {offerLabel(p.offer_id)}: {p.share}% → архив</li>
          ))}
        </ul>
        <div className="pc-modal-actions">
          <button onClick={onClose}>Назад</button>
          <button
            className={s.keitaroChanged ? 'pe-danger' : 'pe-primary'}
            onClick={() => { m.actions.push(s.id, s.keitaroChanged); onClose(); }}
          >
            {s.keitaroChanged ? 'Перезаписать Keitaro' : 'Опубликовать'}
          </button>
        </div>
      </div>
    </div>
  );
}
