import type { ApiError } from '../api';

interface Props {
  error: ApiError | null;
  onClose: () => void;
  /** Если задан — кнопка «Повторить» (повтор той же операции). */
  onRetry?: () => void;
}

/**
 * Постоянная красная плашка ошибки операции: текст, ссылка «Открыть в Keitaro» (если бэк её дал),
 * «Повторить» (если передан `onRetry`), свёрнутые «Подробности» от Keitaro и крестик.
 */
export default function ErrorBanner({ error, onClose, onRetry }: Props) {
  if (!error) return null;
  const { keitaro, keitaroUrl } = error;

  return (
    <div className="error-banner" role="alert">
      <div className="error-banner__head">
        <span>{error.message}</span>
        <button type="button" className="error-banner__close" aria-label="Закрыть" onClick={onClose}>
          ×
        </button>
      </div>
      {keitaroUrl && (
        <a href={keitaroUrl} target="_blank" rel="noreferrer">
          Открыть в Keitaro
        </a>
      )}
      {onRetry && (
        <div>
          <button type="button" onClick={onRetry}>
            Повторить
          </button>
        </div>
      )}
      {keitaro && (
        <details>
          <summary>Подробности</summary>
          <dl>
            <dt>Запрос</dt>
            <dd>
              {keitaro.method} {keitaro.path}
            </dd>
            <dt>Статус</dt>
            <dd>{keitaro.status ?? 'нет ответа'}</dd>
            {keitaro.body && (
              <>
                <dt>Ответ</dt>
                <dd>
                  <pre>{keitaro.body}</pre>
                </dd>
              </>
            )}
          </dl>
        </details>
      )}
    </div>
  );
}
