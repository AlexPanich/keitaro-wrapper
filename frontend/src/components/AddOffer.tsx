import { useState } from 'react';

import type { ApiError } from '../api';
import FieldError from './FieldError';
import OfferSearch from './OfferSearch';

interface Props {
  busy: boolean;
  /** Добавляет оффер; возвращает ошибку, если бэк отказал (её `fields.offer_id` — под поиском). */
  onAdd: (offerId: number) => Promise<ApiError | null>;
}

/** Add: общий поиск оффера и кнопка «Добавить». */
export default function AddOffer({ busy, onAdd }: Props) {
  const [offerId, setOfferId] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();

  const add = async () => {
    setFieldError(undefined);
    const err = await onAdd(Number(offerId));
    setFieldError(err?.fields.offer_id);
  };

  return (
    <div className="add-offer">
      <div className="row">
        <OfferSearch
          value={offerId}
          onChange={(v) => {
            setOfferId(v);
            setFieldError(undefined);
          }}
        />
        <button type="button" disabled={busy || !offerId} onClick={() => void add()}>
          Добавить
        </button>
      </div>
      <FieldError text={fieldError} />
    </div>
  );
}
