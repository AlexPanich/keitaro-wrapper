import type { EditorStream } from '../api';
import { isChanged, newShareSum, offerLabel, removedInDraft, shareSum } from '../editor';
import OfferTags from './OfferTags';
import Tag from './Tag';

interface Props {
  stream: EditorStream;
  busy: boolean;
  onRemove: (offerId: number) => void;
  onBringBack: (offerId: number) => void;
}

function percent(share: number | null): string {
  return share === null ? '—' : `${share}%`;
}

/**
 * Таблица «Оффер | В Keitaro | → | Станет | убрать»: активные офферы черновика (или Keitaro)
 * и убранные в черновике, зачёркнутые. Изменённые строки подсвечены.
 */
export default function OffersTable({ stream, busy, onRemove, onBringBack }: Props) {
  const { offers } = stream;
  const removed = removedInDraft(stream);

  return (
    <table className="offers-table">
      <thead>
        <tr>
          <th>Оффер</th>
          <th className="num">В Keitaro</th>
          <th className="arrow">→</th>
          <th className="num">Станет</th>
          <th>убрать</th>
        </tr>
      </thead>
      <tbody>
        {offers.map((o) => {
          const changed = isChanged(o);
          return (
            <tr key={o.offer_id} className={changed ? 'changed' : undefined}>
              <td>
                <span>{offerLabel(o)}</span> <OfferTags offer={o} />
                {!o.published && <Tag tone="draft">новый</Tag>}
              </td>
              <td className="num">{percent(o.share)}</td>
              <td className="arrow">{changed ? '→' : ''}</td>
              <td className="num">{percent(o.new_share)}</td>
              <td>
                <button
                  type="button"
                  className="link"
                  disabled={busy || offers.length <= 1}
                  title={offers.length <= 1 ? 'Нельзя убрать последний оффер потока' : undefined}
                  onClick={() => onRemove(o.offer_id)}
                >
                  убрать
                </button>
              </td>
            </tr>
          );
        })}
        {removed.map((o) => (
          <tr key={o.offer_id} className="changed archived">
            <td>
              <s>{offerLabel(o)}</s> <OfferTags offer={o} /> <Tag>архив</Tag>
            </td>
            <td className="num">{percent(o.share)}</td>
            <td className="arrow">→</td>
            <td className="num">0%</td>
            <td>
              <button
                type="button"
                className="link"
                disabled={busy || o.deleted}
                title={o.deleted ? 'Оффер удалён в Keitaro, вернуть нельзя' : undefined}
                onClick={() => onBringBack(o.offer_id)}
              >
                вернуть
              </button>
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Итого</td>
          <td className="num">{shareSum([...offers, ...removed])}%</td>
          <td className="arrow" />
          <td className="num">{newShareSum(offers)}%</td>
          <td />
        </tr>
      </tfoot>
    </table>
  );
}
