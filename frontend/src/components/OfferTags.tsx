import type { EditorOffer } from '../api';
import Tag from './Tag';

/** Метки строки оффера: удалён / выключен в Keitaro, закреплён. */
export default function OfferTags({ offer }: { offer: EditorOffer }) {
  return (
    <>
      {offer.deleted && <Tag tone="bad">удалён в Keitaro</Tag>}
      {offer.disabled && <Tag tone="warn">выключен в Keitaro</Tag>}
      {offer.pinned && <Tag>закреплена</Tag>}
    </>
  );
}
