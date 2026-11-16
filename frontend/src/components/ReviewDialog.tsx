import { useState } from 'react';

import type { ApiError, EditorStream } from '../api';
import { CONFLICT_MESSAGE, offerLabel, reviewDiff, type DiffLine } from '../editor';
import ErrorBanner from './ErrorBanner';

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
  // Текст конфликта: при отказе `draft_conflict` — сообщение бэка, иначе общий текст.
  const [conflictMessage, setConflictMessage] = useState<string | null>(stream.conflict ? CONFLICT_MESSAGE : null);
  const conflict = conflictMessage !== null;
  const [error, setError] = useState<ApiError | null>(null);

  const publish = async () => {
    setError(null);
    const err = await onPublish(conflict);
    if (!err) return;
    if (err.code === 'draft_conflict') setConflictMessage(err.message || CONFLICT_MESSAGE);
    else setError(err);
  };
  const retryable = error !== null && (error.status === 502 || error.status === 504);

  return (
    <div className="modal-bg">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Проверка изменений">
        <h3>Проверка изменений · {stream.name}</h3>
        {conflict && (
          <div className="alert alert--bad" role="alert">
            {conflictMessage}
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
