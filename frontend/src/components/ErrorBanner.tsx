import type { ApiError } from '../api';

interface Props {
  error: ApiError | null;
  onClose: () => void;
}

/** Постоянная красная плашка ошибки операции: текст, свёрнутые «Подробности» от Keitaro и крестик. */
export default function ErrorBanner({ error, onClose }: Props) {
  if (!error) return null;
  const { keitaro } = error;

  return (
    <div className="error-banner" role="alert">
      <div className="error-banner__head">
        <span>{error.message}</span>
        <button type="button" className="error-banner__close" aria-label="Закрыть" onClick={onClose}>
          ×
        </button>
      </div>
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
