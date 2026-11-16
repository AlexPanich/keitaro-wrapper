// Чистые правила отображения редактора: подписи, суммы, статус потока.
import type { EditorOffer, EditorStream } from './api';

export const STREAM_TYPE_LABEL: Record<string, string> = {
  forced: 'перехватывающий',
  regular: 'обычный',
  default: 'по умолчанию',
};

export function streamTypeLabel(type: string): string {
  return STREAM_TYPE_LABEL[type] ?? type;
}

/** «#id name» или «Оффер #ID (удалён)», если оффера нет в Keitaro. */
export function offerLabel(offer: EditorOffer): string {
  return offer.deleted || offer.name === null ? `Оффер #${offer.offer_id} (удалён)` : `#${offer.offer_id} ${offer.name}`;
}

export function shareSum(offers: EditorOffer[]): number {
  return offers.reduce((acc, o) => acc + (o.share ?? 0), 0);
}

/** Сумма долей в Keitaro не 100 — показываем как есть, с предупреждением. Пустой поток — не проблема. */
export function hasSumProblem(stream: EditorStream): boolean {
  return stream.offers.length > 0 && shareSum(stream.offers) !== 100;
}

/** Точка у потока в списке: серый — не оффер-поток, красный — требует внимания, зелёный — опубликован. */
export type StreamStatus = 'readonly' | 'attention' | 'published';

export function streamStatus(stream: EditorStream): StreamStatus {
  if (!stream.is_offer_stream) return 'readonly';
  if (hasSumProblem(stream)) return 'attention';
  return 'published';
}
