import { useEffect, useState } from 'react';

import { api, type OfferShort } from './api';
import CreateCampaign from './components/CreateCampaign';
import OfferEditor from './components/OfferEditor';
import EditorPrototype from './prototype/editor/EditorPrototype';

type Tab = 'create' | 'edit';

export default function App() {
  const [tab, setTab] = useState<Tab>(new URLSearchParams(location.search).has('variant') ? 'edit' : 'create');
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
      <main>{tab === 'create' ? <CreateCampaign offers={offers} /> : import.meta.env.DEV && import.meta.env.MODE !== 'test' ? <EditorPrototype /> : <OfferEditor offers={offers} />}</main>
    </>
  );
}
