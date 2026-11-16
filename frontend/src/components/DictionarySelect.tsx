import type { DictionaryItem } from '../api';
import FieldError from './FieldError';

interface Props {
  label: string;
  items: DictionaryItem[];
  /** ID выбранного пункта строкой; `''` — ничего не выбрано. */
  value: string;
  onChange: (value: string) => void;
  /** Обязательный селект: вместо «не выбрано» — приглашение выбрать. */
  required?: boolean;
  /** Подсказка под необязательным селектом, если справочник пуст. */
  emptyHint?: string;
  error?: string;
}

/** Селект справочника Keitaro (группа, домен, источник). */
export default function DictionarySelect({ label, items, value, onChange, required, emptyHint, error }: Props) {
  return (
    <label>
      {label}
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} required={required}>
        <option value="">{required ? '— выберите —' : 'не выбрано'}</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      {!required && emptyHint && items.length === 0 && <span className="hint">{emptyHint}</span>}
      <FieldError text={error} />
    </label>
  );
}
