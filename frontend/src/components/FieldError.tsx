/** Красный текст ошибки под полем формы (из `fields` конверта). */
export default function FieldError({ text }: { text?: string }) {
  return text ? <span className="field-error">{text}</span> : null;
}
