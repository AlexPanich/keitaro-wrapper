import type { EditorStream } from '../api';
import { streamStatus, streamTypeLabel, type StreamStatus } from '../editor';

const STATUS_TITLE: Record<StreamStatus, string> = {
  readonly: 'не оффер-поток, только просмотр',
  draft: 'черновик',
  attention: 'требует внимания',
  published: 'опубликован',
};

interface Props {
  streams: EditorStream[];
  selectedId: number | null;
  onSelect: (streamId: number) => void;
}

/** Все потоки кампании в порядке проверки Keitaro; выбрать можно только оффер-поток. */
export default function StreamList({ streams, selectedId, onSelect }: Props) {
  return (
    <>
      <div className="caption">Потоки в порядке проверки Keitaro</div>
      <ul className="streams" aria-label="Потоки">
        {streams.map((s) => {
          const status = streamStatus(s);
          return (
            <li key={s.id}>
              <button
                type="button"
                className={'streams__item' + (s.id === selectedId ? ' streams__item--on' : '')}
                disabled={!s.is_offer_stream}
                aria-pressed={s.is_offer_stream ? s.id === selectedId : undefined}
                title={s.is_offer_stream ? undefined : STATUS_TITLE.readonly}
                onClick={() => onSelect(s.id)}
              >
                <span className={`dot dot--${status}`} title={STATUS_TITLE[status]} />
                <span>
                  {s.name}
                  <small>
                    {streamTypeLabel(s.type)} · #{s.position ?? '—'} ·{' '}
                    {s.is_offer_stream ? `${s.offers.length} офф.` : s.schema}
                  </small>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="legend">
        <span>
          <i className="dot dot--published" /> опубликован
        </span>
        <span>
          <i className="dot dot--draft" /> черновик
        </span>
        <span>
          <i className="dot dot--attention" /> требует внимания
        </span>
      </div>
    </>
  );
}
