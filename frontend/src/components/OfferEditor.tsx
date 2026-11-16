import { useState } from 'react';

import { api, toApiError, type ApiError, type StreamOffer } from '../api';
import ErrorBanner from './ErrorBanner';
import OfferSearch from './OfferSearch';

export default function OfferEditor() {
  const [campaignId, setCampaignId] = useState('');
  const [streamOffers, setStreamOffers] = useState<StreamOffer[]>([]);
  const [addOfferId, setAddOfferId] = useState('');
  const [error, setError] = useState<ApiError | null>(null);

  const run = async (action: () => Promise<StreamOffer[]>) => {
    setError(null);
    try {
      setStreamOffers(await action());
    } catch (e) {
      setError(toApiError(e));
    }
  };

  const id = Number(campaignId);

  return (
    <section>
      <ErrorBanner error={error} onClose={() => setError(null)} />
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
        <OfferSearch value={addOfferId} onChange={setAddOfferId} />
        <button disabled={!addOfferId} onClick={() => run(() => api.addOffer(id, Number(addOfferId)))}>
          Добавить оффер
        </button>
      </div>
    </section>
  );
}
