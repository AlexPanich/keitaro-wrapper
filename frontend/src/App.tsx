import { useEffect, useState } from 'react';

import { api, type OfferShort } from './api';
import CreateCampaign from './components/CreateCampaign';
import OfferEditor from './components/OfferEditor';

type Tab = 'create' | 'edit';

export default function App() {
  const [tab, setTab] = useState<Tab>('create');
  const [offers, setOffers] = useState<OfferShort[]>([]);

  useEffect(() => {
    api.listOffers().then(setOffers).catch((e) => console.error('Не удалось загрузить офферы', e));
  }, []);

  return (
    <>
      <header>
        <h1>Keitaro Wrapper</h1>
        <nav>
          <button className={tab === 'create' ? 'active' : ''} onClick={() => setTab('create')}>
            Создать кампанию
          </button>
          <button className={tab === 'edit' ? 'active' : ''} onClick={() => setTab('edit')}>
            Редактор офферов
          </button>
        </nav>
      </header>
      <main>{tab === 'create' ? <CreateCampaign offers={offers} /> : <OfferEditor offers={offers} />}</main>
    </>
  );
}
