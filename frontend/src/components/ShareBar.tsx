import type { EditorOffer } from '../api';
import { offerLabel, shareSum } from '../editor';

const COLORS = ['#2b6cb0', '#38a169', '#d69e2e', '#805ad5', '#dd6b20', '#319795', '#e53e3e'];

/** Полоса распределения трафика по офферам; недостающая до 100 часть заштрихована. */
export default function ShareBar({ offers }: { offers: EditorOffer[] }) {
  const gap = 100 - shareSum(offers);
  return (
    <div className="share-bar" aria-label="Распределение трафика">
      {offers.map((o, i) => (
        <div
          key={o.offer_id}
          style={{ flexGrow: o.share ?? 0, background: COLORS[i % COLORS.length] }}
          title={`${offerLabel(o)}: ${o.share}%`}
        >
          {(o.share ?? 0) >= 8 ? `${o.share}%` : ''}
        </div>
      ))}
      {gap > 0 && (
        <div className="share-bar__gap" style={{ flexGrow: gap }} title={`Не распределено: ${gap}%`}>
          {gap >= 8 ? `${gap}%` : ''}
        </div>
      )}
    </div>
  );
}
