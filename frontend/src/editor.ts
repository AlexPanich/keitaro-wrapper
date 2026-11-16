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

/** Сумма долей в Keitaro. */
export function shareSum(offers: EditorOffer[]): number {
  return offers.reduce((acc, o) => acc + (o.share ?? 0), 0);
}

/** Сумма долей «Станет» (черновика). */
export function newShareSum(offers: EditorOffer[]): number {
  return offers.reduce((acc, o) => acc + (o.new_share ?? 0), 0);
}

/** Офферы, которые сейчас в потоке Keitaro, но убраны в черновике (в Keitaro доля есть, в архиве черновика). */
export function removedInDraft(stream: EditorStream): EditorOffer[] {
  return stream.archive.filter((o) => o.share !== null);
}

/** Доля оффера в черновике отличается от Keitaro (новый, убранный или пересчитанный). */
export function isChanged(offer: EditorOffer): boolean {
  return offer.share !== offer.new_share;
}

/**
 * Сумма долей в Keitaro не 100 — показываем как есть, с предупреждением. Пустой поток — не проблема.
 * При черновике не показываем: доли черновика пересчитаны и в сумме дают 100.
 */
export function hasSumProblem(stream: EditorStream): boolean {
  return !stream.draft && stream.offers.length > 0 && shareSum(stream.offers) !== 100;
}

/**
 * Точка у потока в списке: серый — не оффер-поток, жёлтый — черновик,
 * красный — требует внимания, зелёный — опубликован.
 */
export type StreamStatus = 'readonly' | 'draft' | 'attention' | 'published';

export function streamStatus(stream: EditorStream): StreamStatus {
  if (!stream.is_offer_stream) return 'readonly';
  if (stream.draft) return 'draft';
  if (hasSumProblem(stream)) return 'attention';
  return 'published';
}
