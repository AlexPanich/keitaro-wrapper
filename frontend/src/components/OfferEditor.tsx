import { useEffect, useState } from 'react';

import { api, type OfferShort, type StreamOffer } from '../api';
import OfferSelect from './OfferSelect';

export default function OfferEditor({ offers }: { offers: OfferShort[] }) {
  const [campaignId, setCampaignId] = useState('');
  const [streamOffers, setStreamOffers] = useState<StreamOffer[]>([]);
  const [addOfferId, setAddOfferId] = useState('');

  useEffect(() => {
    if (!addOfferId && offers.length) setAddOfferId(String(offers[0].id));
  }, [offers, addOfferId]);

  const run = async (action: () => Promise<StreamOffer[]>) => {
    try {
      setStreamOffers(await action());
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const id = Number(campaignId);

  return (
    <section>
      <label>
        ID кампании в Keitaro
        <input type="number" value={campaignId} onChange={(e) => setCampaignId(e.target.value)} />
      </label>
      <button onClick={() => run(() => api.campaignOffers(id))}>Загрузить</button>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Оффер</th>
            <th>Доля, %</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {streamOffers.map((o) => (
            <tr key={o.offer_id}>
              <td>{o.offer_id}</td>
              <td>{o.name ?? ''}</td>
              <td>{o.share}</td>
              <td>
                <button onClick={() => run(() => api.removeOffer(id, o.offer_id))}>Удалить</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <OfferSelect offers={offers} value={addOfferId} onChange={setAddOfferId} aria-label="Оффер для добавления" />
        <button onClick={() => run(() => api.addOffer(id, Number(addOfferId)))}>Добавить оффер</button>
      </div>
    </section>
  );
}
