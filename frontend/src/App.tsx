import { useState } from 'react';

import CreateCampaign from './components/CreateCampaign';
import OfferEditor from './components/OfferEditor';

type Tab = 'create' | 'edit';

export default function App() {
  const [tab, setTab] = useState<Tab>('create');

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
      <main>{tab === 'create' ? <CreateCampaign /> : <OfferEditor />}</main>
    </>
  );
}
