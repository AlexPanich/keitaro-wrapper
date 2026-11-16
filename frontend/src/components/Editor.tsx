import { useCallback, useState } from 'react';

import { api, toApiError, type ApiError, type CampaignShort, type EditorView } from '../api';
import CampaignSearch from './CampaignSearch';
import CampaignState from './CampaignState';
import ErrorBanner from './ErrorBanner';
import StreamDetail, { type StreamActions } from './StreamDetail';
import StreamList from './StreamList';
import Toast from './Toast';

/** Редактор офферов: слева кампания и её потоки, справа выбранный оффер-поток. */
export default function Editor() {
  const [view, setView] = useState<EditorView | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Жёлтая плашка после публикации (PUT прошёл, но повторное чтение не удалось или не совпало).
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const closeToast = useCallback(() => setToast(null), []);

  const load = useCallback(async (campaignId: number) => {
    setLoading(true);
    setError(null);
    setWarning(null);
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

  /**
   * Действие с черновиком: ответ бэка — новое состояние кампании. Отказ без `fields` — всплывающим
   * сообщением, с `fields` — вызвавшему (покажет под полем), остальное — плашкой.
   */
  const run = async (action: () => Promise<EditorView>): Promise<ApiError | null> => {
    setLoading(true);
    setError(null);
    setWarning(null);
    try {
      setView(await action());
      return null;
    } catch (e) {
      const err = toApiError(e);
      if (err.code === 'validation_error') {
        if (Object.keys(err.fields).length === 0) setToast(err.message);
      } else {
        setError(err);
      }
      return err;
    } finally {
      setLoading(false);
    }
  };

  /** Публикация: ошибки показывает окно публикации, поэтому здесь их только возвращаем. */
  const publish = async (campaignId: number, streamId: number, overwrite: boolean): Promise<ApiError | null> => {
    setLoading(true);
    setError(null);
    setWarning(null);
    try {
      const result = await api.publishDraft(campaignId, streamId, overwrite);
      setView(result.view);
      setWarning(result.warning);
      return null;
    } catch (e) {
      return toApiError(e);
    } finally {
      setLoading(false);
    }
  };

  const open = (campaign: CampaignShort) => {
    setSelectedId(null);
    void load(campaign.id);
  };

  const streams = view?.streams ?? [];
  const offerStreams = streams.filter((s) => s.is_offer_stream);
  // По умолчанию — первый оффер-поток; после Fetch выбор сохраняется, если поток ещё есть.
  const current = offerStreams.find((s) => s.id === selectedId) ?? offerStreams[0] ?? null;

  const actions = (campaignId: number, streamId: number): StreamActions => ({
    add: (offerId) => run(() => api.addOffer(campaignId, streamId, offerId)),
    remove: (offerId) => void run(() => api.removeOffer(campaignId, streamId, offerId)),
    bringBack: (offerId) => void run(() => api.bringBackOffer(campaignId, streamId, offerId)),
    cancel: () => void run(() => api.cancelDraft(campaignId, streamId)),
    publish: (overwrite) => publish(campaignId, streamId, overwrite),
  });

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
        {view?.notices.map((notice) => (
          <div key={notice} className="alert alert--warn" role="alert">
            {notice}
          </div>
        ))}
        {warning && (
          <div className="alert alert--warn" role="alert">
            {warning}
          </div>
        )}
        {loading && !view && <p className="muted">Загрузка…</p>}
        {view && offerStreams.length === 0 && <div className="alert">В кампании нет оффер-потоков</div>}
        {view && current && (
          <StreamDetail
            key={current.id}
            stream={current}
            busy={loading}
            actions={actions(view.campaign.id, current.id)}
          />
        )}
      </section>
      <Toast message={toast} onClose={closeToast} />
    </div>
  );
}
