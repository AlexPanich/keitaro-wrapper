// ПРОТОТИП, выбросить. Тикет «Как выглядит интерфейс редактора» (#13).
// Три варианта редактора на вкладке «Редактор офферов», переключаются `?variant=A|B|C`.
// Данные — заглушка в памяти (model.ts), бэк не нужен. Перезагрузка страницы сбрасывает состояние.
import { useEffect } from 'react';

import { useEditorModel } from './model';
import { Toast } from './parts';
import PrototypeSwitcher, { useVariant } from './PrototypeSwitcher';
import VariantA, { name as nameA } from './VariantA';
import VariantB, { name as nameB } from './VariantB';
import VariantC, { name as nameC } from './VariantC';
import './prototype.css';

const VARIANTS = [
  { key: 'A', name: nameA },
  { key: 'B', name: nameB },
  { key: 'C', name: nameC },
];

export default function EditorPrototype() {
  const m = useEditorModel();
  const [variant, setVariant] = useVariant(VARIANTS);

  useEffect(() => {
    document.body.classList.add('pe-wide');
    return () => document.body.classList.remove('pe-wide');
  }, []);

  return (
    <>
      <div className="pe-banner">ПРОТОТИП: данные выдуманы, в Keitaro ничего не уходит</div>
      {variant === 'A' && <VariantA m={m} />}
      {variant === 'B' && <VariantB m={m} />}
      {variant === 'C' && <VariantC m={m} />}
      <Toast m={m} />
      <PrototypeSwitcher
        variants={VARIANTS}
        current={variant}
        onChange={setVariant}
        state={{ campaign: m.campaign, log: m.log }}
      />
    </>
  );
}
