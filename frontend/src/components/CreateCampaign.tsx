import { useEffect, useState, type FormEvent } from 'react';

import { api, toApiError, type ApiError, type OfferShort } from '../api';
import ErrorBanner from './ErrorBanner';
import FieldError from './FieldError';
import OfferSelect from './OfferSelect';

export default function CreateCampaign({ offers }: { offers: OfferShort[] }) {
  const [name, setName] = useState('');
  const [geo, setGeo] = useState('');
  const [offerId, setOfferId] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (!offerId && offers.length) setOfferId(String(offers[0].id));
  }, [offers, offerId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult('');
    try {
      const campaign = await api.createCampaign({ name, geo: geo.toUpperCase(), offer_id: Number(offerId) });
      setResult(JSON.stringify(campaign, null, 2));
    } catch (err) {
      setError(toApiError(err));
    }
  };

  const fields = error?.fields ?? {};

  return (
    <section>
      <ErrorBanner error={error} onClose={() => setError(null)} />
      <form onSubmit={submit}>
        <label>
          Название <input value={name} onChange={(e) => setName(e.target.value)} required />
          <FieldError text={fields.name} />
        </label>
        <label>
          Гео (ISO-код)
          <input value={geo} onChange={(e) => setGeo(e.target.value)} maxLength={2} placeholder="RU" required />
          <FieldError text={fields.geo} />
        </label>
        <label>
          Оффер <OfferSelect offers={offers} value={offerId} onChange={setOfferId} />
          <FieldError text={fields.offer_id} />
        </label>
        <button type="submit">Создать</button>
      </form>
      {result && <pre>{result}</pre>}
    </section>
  );
}
