interface Props {
  /** Σ долей черновика, %. */
  sum: number;
  busy: boolean;
  /** Черновик валиден (сумма 100 и т. п.) — окно публикации можно открыть. */
  canPublish: boolean;
  onCancel: () => void;
  onReview: () => void;
}

/** Закреплённая внизу панель черновика потока: «Отменить» и «Проверить и опубликовать». */
export default function DraftBar({ sum, busy, canPublish, onCancel, onReview }: Props) {
  return (
    <section className="draft-bar" aria-label="Неопубликованные изменения">
      <span>
        <i className="dot dot--draft" /> Неопубликованные изменения · Σ {sum}%
      </span>
      <span className="draft-bar__actions">
        <button type="button" disabled={busy} onClick={onCancel}>
          Отменить
        </button>
        <button type="button" className="primary" disabled={busy || !canPublish} onClick={onReview}>
          Проверить и опубликовать
        </button>
      </span>
    </section>
  );
}
