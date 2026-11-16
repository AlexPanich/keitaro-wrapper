import { useState } from 'react';

import CreateCampaign from './components/CreateCampaign';
import Editor from './components/Editor';

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
      <main className={tab === 'edit' ? 'main--wide' : undefined}>
        {tab === 'create' ? <CreateCampaign /> : <Editor />}
      </main>
    </>
  );
}
