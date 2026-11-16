import { useCallback, useState } from 'react';

import { api, toApiError, type ApiError, type CampaignShort, type EditorView } from '../api';
import CampaignSearch from './CampaignSearch';
import CampaignState from './CampaignState';
import ErrorBanner from './ErrorBanner';
import StreamDetail from './StreamDetail';
import StreamList from './StreamList';

/** Редактор офферов: слева кампания и её потоки, справа выбранный оффер-поток. */
export default function Editor() {
  const [view, setView] = useState<EditorView | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (campaignId: number) => {
    setLoading(true);
    setError(null);
    try {
      setView(await api.loadEditorCampaign(campaignId));
    } catch (e) {
      const err = toApiError(e);
      // Кампания удалена в Keitaro — показывать её прежнее состояние бессмысленно.
      if (err.code === 'not_found') setView(null);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const open = (campaign: CampaignShort) => {
    setSelectedId(null);
    void load(campaign.id);
  };

  const streams = view?.streams ?? [];
  const offerStreams = streams.filter((s) => s.is_offer_stream);
  // По умолчанию — первый оффер-поток; после Fetch выбор сохраняется, если поток ещё есть.
  const current = offerStreams.find((s) => s.id === selectedId) ?? offerStreams[0] ?? null;

  return (
    <div className="editor">
      <aside className="editor__side">
        <CampaignSearch onSelect={open} onError={setError} />
        {view && (
          <>
            <section className="campaign-card" aria-label="Открытая кампания">
              <div>
                <b>#{view.campaign.id}</b> {view.campaign.name}
              </div>
              <CampaignState state={view.campaign.state} />
              <div className="campaign-card__links">
                <button type="button" disabled={loading} onClick={() => void load(view.campaign.id)}>
                  ⟳ Fetch
                </button>
                <a href={view.campaign.keitaro_url} target="_blank" rel="noreferrer">
                  Открыть в Keitaro ↗
                </a>
              </div>
            </section>
            <StreamList streams={streams} selectedId={current?.id ?? null} onSelect={setSelectedId} />
          </>
        )}
      </aside>
      <section className="editor__main">
        <ErrorBanner error={error} onClose={() => setError(null)} />
        {loading && !view && <p className="muted">Загрузка…</p>}
        {view && offerStreams.length === 0 && <div className="alert">В кампании нет оффер-потоков</div>}
        {current && <StreamDetail key={current.id} stream={current} />}
      </section>
    </div>
  );
}
