import { useState } from 'react';

import type { ApiError, EditorStream } from '../api';
import { hasSumProblem, newShareSum, offerLabel, shareSum, streamTypeLabel } from '../editor';
import AddOffer from './AddOffer';
import DraftBar from './DraftBar';
import OfferTags from './OfferTags';
import OffersTable from './OffersTable';
import ShareBar from './ShareBar';
import Tag from './Tag';

/** Действия с черновиком потока; каждое возвращает ошибку, если бэк отказал. */
export interface StreamActions {
  add: (offerId: number) => Promise<ApiError | null>;
  remove: (offerId: number) => void;
  bringBack: (offerId: number) => void;
  cancel: () => void;
}

interface Props {
  stream: EditorStream;
  busy: boolean;
  actions: StreamActions;
}

/** Выбранный оффер-поток: полоса долей, таблица «В Keitaro → Станет», Add, архив и панель черновика. */
export default function StreamDetail({ stream, busy, actions }: Props) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const { offers, archive } = stream;

  return (
    <div className="stream-detail">
      <h2>
        {stream.name} {stream.state === 'disabled' && <Tag tone="warn">поток выключен</Tag>}
        {stream.draft && <Tag tone="draft">черновик</Tag>}
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
          <OffersTable stream={stream} busy={busy} onRemove={actions.remove} onBringBack={actions.bringBack} />
        </>
      )}

      <AddOffer busy={busy} onAdd={actions.add} />

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
            <ul className="archive__list" aria-label="Архив">
              {archive.map((o) => (
                <li key={o.offer_id}>
                  <span>{offerLabel(o)}</span> <OfferTags offer={o} />{' '}
                  <button
                    type="button"
                    className="link"
                    disabled={busy || o.deleted}
                    title={o.deleted ? 'Оффер удалён в Keitaro, вернуть нельзя' : undefined}
                    onClick={() => actions.bringBack(o.offer_id)}
                  >
                    Вернуть
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {stream.draft && <DraftBar sum={newShareSum(offers)} busy={busy} onCancel={actions.cancel} />}
    </div>
  );
}
