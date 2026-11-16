interface Props {
  /** Σ долей черновика, %. */
  sum: number;
  busy: boolean;
  onCancel: () => void;
}

/** Закреплённая внизу панель черновика потока. Кнопку публикации добавит отдельный тикет. */
export default function DraftBar({ sum, busy, onCancel }: Props) {
  return (
    <section className="draft-bar" aria-label="Неопубликованные изменения">
      <span>
        <i className="dot dot--draft" /> Неопубликованные изменения · Σ {sum}%
      </span>
      <button type="button" disabled={busy} onClick={onCancel}>
        Отменить
      </button>
    </section>
  );
}
