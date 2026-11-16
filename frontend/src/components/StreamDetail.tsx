import { useState } from 'react';

import type { EditorStream } from '../api';
import { hasSumProblem, offerLabel, shareSum, streamTypeLabel } from '../editor';
import OfferTags from './OfferTags';
import ShareBar from './ShareBar';
import Tag from './Tag';

/** Выбранный оффер-поток: полоса долей, таблица офферов и свёрнутый архив. Только просмотр. */
export default function StreamDetail({ stream }: { stream: EditorStream }) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const { offers, archive } = stream;

  return (
    <div className="stream-detail">
      <h2>
        {stream.name} {stream.state === 'disabled' && <Tag tone="warn">поток выключен</Tag>}
      </h2>
      <div className="muted">
        stream_id {stream.id} · {streamTypeLabel(stream.type)} · позиция {stream.position ?? '—'}
      </div>

      {hasSumProblem(stream) && (
        <div className="alert alert--warn" role="alert">
          Сумма долей в Keitaro — {shareSum(offers)}, а не 100
        </div>
      )}

      {offers.length === 0 ? (
        <p className="muted">В потоке пока нет офферов. Первый добавленный получит 100%</p>
      ) : (
        <>
          <ShareBar offers={offers} />
          <table className="offers-table">
            <thead>
              <tr>
                <th>Оффер</th>
                <th className="num">В Keitaro</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((o) => (
                <tr key={o.offer_id}>
                  <td>
                    <span>{offerLabel(o)}</span> <OfferTags offer={o} />
                  </td>
                  <td className="num">{o.share}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {archive.length > 0 && (
        <div className="archive">
          <button
            type="button"
            className="link"
            aria-expanded={archiveOpen}
            onClick={() => setArchiveOpen((v) => !v)}
          >
            {archiveOpen ? '▾' : '▸'} Архив ({archive.length})
          </button>
          {archiveOpen && (
            <ul className="archive__list">
              {archive.map((o) => (
                <li key={o.offer_id}>
                  <span>{offerLabel(o)}</span> <OfferTags offer={o} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
