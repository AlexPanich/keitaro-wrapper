import { useState } from 'react';

import type { ApiError, EditorStream } from '../api';
import { offerLabel, reviewDiff, type DiffLine } from '../editor';
import ErrorBanner from './ErrorBanner';

export const CONFLICT_MESSAGE = 'Поток в Keitaro изменился после начала правок';

interface Props {
  stream: EditorStream;
  busy: boolean;
  /** Публикация; `null` — успех (окно закрывает родитель), иначе ошибка бэка. */
  onPublish: (overwrite: boolean) => Promise<ApiError | null>;
  onBack: () => void;
}

function describe({ kind, offer }: DiffLine): string {
  switch (kind) {
    case 'added':
      return `+ добавится: ${offer.new_share}%`;
    case 'changed':
      return `изменится: ${offer.share}% → ${offer.new_share}%`;
    case 'unchanged':
      return `без изменений: ${offer.share}%`;
    case 'removed':
      return `− уберётся: ${offer.share}% → архив`;
  }
}

/**
 * Окно «Проверить и опубликовать»: список изменений черновика относительно Keitaro.
 * При расхождении с Keitaro — красное предупреждение и «Перезаписать Keitaro»;
 * при сбое Keitaro (502/504) — плашка с «Повторить», черновик остаётся.
 */
export default function ReviewDialog({ stream, busy, onPublish, onBack }: Props) {
  const [conflict, setConflict] = useState(stream.conflict);
  const [error, setError] = useState<ApiError | null>(null);

  const publish = async () => {
    setError(null);
    const err = await onPublish(conflict);
    if (!err) return;
    if (err.code === 'draft_conflict') setConflict(true);
    else setError(err);
  };
  const retryable = error !== null && (error.status === 502 || error.status === 504);

  return (
    <div className="modal-bg">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Проверка изменений">
        <h3>Проверка изменений · {stream.name}</h3>
        {conflict && (
          <div className="alert alert--bad" role="alert">
            {CONFLICT_MESSAGE}
          </div>
        )}
        <ErrorBanner
          error={error}
          onClose={() => setError(null)}
          onRetry={retryable ? () => void publish() : undefined}
        />
        <ul className="diff">
          {reviewDiff(stream).map((line) => (
            <li key={line.offer.offer_id} className={`diff__${line.kind}`}>
              {offerLabel(line.offer)} — {describe(line)}
            </li>
          ))}
        </ul>
        <div className="modal__actions">
          <button type="button" disabled={busy} onClick={onBack}>
            Назад
          </button>
          <button
            type="button"
            className={conflict ? 'danger' : 'primary'}
            disabled={busy}
            onClick={() => void publish()}
          >
            {conflict ? 'Перезаписать Keitaro' : 'Опубликовать'}
          </button>
        </div>
      </div>
    </div>
  );
}
