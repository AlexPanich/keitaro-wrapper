import { useEffect, useState, type FormEvent } from 'react';

import { api, type OfferShort } from '../api';
import OfferSelect from './OfferSelect';

export default function CreateCampaign({ offers }: { offers: OfferShort[] }) {
  const [name, setName] = useState('');
  const [geo, setGeo] = useState('');
  const [offerId, setOfferId] = useState('');
  const [result, setResult] = useState('');

  useEffect(() => {
    if (!offerId && offers.length) setOfferId(String(offers[0].id));
  }, [offers, offerId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const campaign = await api.createCampaign({ name, geo: geo.toUpperCase(), offer_id: Number(offerId) });
      setResult(JSON.stringify(campaign, null, 2));
    } catch (err) {
      setResult((err as Error).message);
    }
  };

  return (
    <section>
      <form onSubmit={submit}>
        <label>
          Название <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Гео (ISO-код)
          <input value={geo} onChange={(e) => setGeo(e.target.value)} maxLength={2} placeholder="RU" required />
        </label>
        <label>
          Оффер <OfferSelect offers={offers} value={offerId} onChange={setOfferId} />
        </label>
        <button type="submit">Создать</button>
      </form>
      {result && <pre>{result}</pre>}
    </section>
  );
}
