import { useEffect, useState, type FormEvent } from 'react';

import { api, toApiError, type ApiError, type CampaignCreated, type DictionaryItem } from '../api';
import DictionarySelect from './DictionarySelect';
import ErrorBanner from './ErrorBanner';
import FieldError from './FieldError';
import OfferSearch from './OfferSearch';

interface Dictionaries {
  groups: DictionaryItem[];
  domains: DictionaryItem[];
  trafficSources: DictionaryItem[];
}

const EMPTY: Dictionaries = { groups: [], domains: [], trafficSources: [] };

const toValue = (id: number | null) => (id === null ? '' : String(id));
const toId = (value: string) => (value === '' ? null : Number(value));

export default function CreateCampaign() {
  const [name, setName] = useState('');
  const [geo, setGeo] = useState('');
  const [offerId, setOfferId] = useState('');
  const [dicts, setDicts] = useState<Dictionaries>(EMPTY);
  const [groupId, setGroupId] = useState('');
  const [domainId, setDomainId] = useState('');
  const [trafficSourceId, setTrafficSourceId] = useState('');
  const [result, setResult] = useState<CampaignCreated | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    Promise.all([api.listGroups(), api.listDomains(), api.listTrafficSources(), api.getDefaults()])
      .then(([groups, domains, trafficSources, defaults]) => {
        setDicts({ groups, domains, trafficSources });
        setGroupId(toValue(defaults.group_id));
        setDomainId(toValue(defaults.domain_id));
        setTrafficSourceId(toValue(defaults.traffic_source_id));
      })
      .catch((e) => setError(toApiError(e)));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    try {
      setResult(
        await api.createCampaign({
          name,
          geo,
          offer_id: toId(offerId),
          group_id: Number(groupId),
          domain_id: toId(domainId),
          traffic_source_id: toId(trafficSourceId),
        }),
      );
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
          Гео (ISO-коды через запятую)
          <input value={geo} onChange={(e) => setGeo(e.target.value)} placeholder="DE, FR" required />
          <FieldError text={fields.geo} />
        </label>
        <div className="field">
          Оффер <OfferSearch value={offerId} onChange={setOfferId} />
          <FieldError text={fields.offer_id} />
        </div>
        <DictionarySelect
          label="Группа"
          items={dicts.groups}
          value={groupId}
          onChange={setGroupId}
          required
          error={fields.group_id}
        />
        <DictionarySelect
          label="Домен"
          items={dicts.domains}
          value={domainId}
          onChange={setDomainId}
          emptyHint="В Keitaro нет доменов"
          error={fields.domain_id}
        />
        <DictionarySelect
          label="Источник"
          items={dicts.trafficSources}
          value={trafficSourceId}
          onChange={setTrafficSourceId}
          emptyHint="В Keitaro нет источников"
          error={fields.traffic_source_id}
        />
        <button type="submit">Создать</button>
      </form>
      {result && (
        <div className="result" role="status">
          Кампания создана: alias <code>{result.alias}</code>
          {result.url && (
            <>
              {' · '}
              <a href={result.url} target="_blank" rel="noreferrer">
                {result.url}
              </a>
            </>
          )}
        </div>
      )}
    </section>
  );
}
