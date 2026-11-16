import { useState } from 'react';

interface Props {
  /** Текущая доля «Станет». */
  value: number;
  label: string;
  disabled: boolean;
  /** Новая доля; `false` — отказ, поле вернётся к `value`. */
  onCommit: (share: number) => Promise<boolean>;
  /** Ввод не целое 0..100. */
  onInvalid: () => void;
}

/**
 * Поле доли в колонке «Станет». Значение отправляется по blur или Enter, если изменилось.
 * Новое значение с бэка приходит через `value` — родитель пересоздаёт поле по `key`.
 */
export default function ShareInput({ value, label, disabled, onCommit, onInvalid }: Props) {
  const [text, setText] = useState(String(value));

  const commit = async () => {
    const trimmed = text.trim();
    const share = Number(trimmed);
    if (trimmed !== '' && share === value) return setText(String(value));
    if (trimmed === '' || !Number.isInteger(share) || share < 0 || share > 100) {
      setText(String(value));
      onInvalid();
      return;
    }
    if (!(await onCommit(share))) setText(String(value));
  };

  return (
    <input
      type="number"
      className="share-input"
      min={0}
      max={100}
      step={1}
      aria-label={label}
      disabled={disabled}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}
