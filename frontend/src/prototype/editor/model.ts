// ПРОТОТИП, выбросить. Модель редактора в памяти: моки Keitaro + правила долей (#8) и черновика (#11).
// Вопрос прототипа — «как выглядит интерфейс редактора» (#13), а не корректность бэка.
import { useState } from 'react';

export type OfferState = 'active' | 'disabled';
export interface CatalogOffer {
  id: number;
  name: string;
  state: OfferState;
}

// Справочник `GET /offers`. Оффера 3011 в нём нет: он удалён в Keitaro.
export const CATALOG: CatalogOffer[] = [
  { id: 3749, name: 'Keto Burn RU', state: 'active' },
  { id: 3750, name: 'Keto Burn RU v2', state: 'active' },
  { id: 3812, name: 'Hondrox UA', state: 'disabled' },
  { id: 3901, name: 'Diabex PL', state: 'active' },
  { id: 3902, name: 'Diabex DE', state: 'active' },
  { id: 4010, name: 'Prostamid IT', state: 'active' },
  { id: 4011, name: 'Prostamid ES', state: 'active' },
  { id: 4120, name: 'Cardio NRJ FR', state: 'active' },
];
export const catalogById = new Map(CATALOG.map((o) => [o.id, o]));

export interface Row {
  offer_id: number;
  share: number;
  pinned: boolean;
  archived: boolean;
  /** Добавлен в черновике и ещё не публиковался (stream_offers.published = false). */
  isNew?: boolean;
}

export type StreamType = 'forced' | 'regular' | 'default';
export interface Stream {
  id: number;
  name: string;
  type: StreamType;
  position: number;
  schema: 'landings' | 'redirect';
  state: 'active' | 'disabled';
  filter?: string;
  redirectUrl?: string;
  /** Опубликованное состояние = то, что сейчас в Keitaro. */
  published: { offer_id: number; share: number }[];
  /** Строки редактора: активные в порядке потока, затем архивные. */
  rows: Row[];
  /** Симуляция «Keitaro изменился после начала правок» (base_offers ≠ Keitaro). */
  keitaroChanged: boolean;
}

export interface Campaign {
  id: number;
  name: string;
  alias: string;
  state: 'active' | 'paused';
  streams: Stream[];
  notices: string[];
}

const row = (offer_id: number, share: number, extra: Partial<Row> = {}): Row => ({
  offer_id,
  share,
  pinned: false,
  archived: false,
  ...extra,
});

function makeCampaigns(): Campaign[] {
  return [
    {
      id: 209801,
      name: 'wayfinder-test-keto-ru',
      alias: 'wf-keto-ru',
      state: 'active',
      notices: ['Поток «Офферы старые» удалён в Keitaro, неопубликованные правки потеряны'],
      streams: [
        {
          id: 1305001, name: 'Боты', type: 'forced', position: 1, schema: 'redirect', state: 'active',
          filter: 'bot = yes', redirectUrl: 'https://google.com', published: [], rows: [], keitaroChanged: false,
        },
        {
          id: 1305002, name: 'Гео → Google', type: 'regular', position: 1, schema: 'redirect', state: 'active',
          filter: 'country ∈ RU, UA, BY', redirectUrl: 'https://google.com', published: [], rows: [], keitaroChanged: false,
        },
        {
          id: 1305003, name: 'Офферы', type: 'regular', position: 2, schema: 'landings', state: 'active',
          published: [
            { offer_id: 3749, share: 33 },
            { offer_id: 3812, share: 33 },
            { offer_id: 3901, share: 34 },
          ],
          rows: [
            row(3749, 33),
            row(3812, 33),
            row(3901, 34),
            row(3750, 0, { archived: true }),
            row(3011, 0, { archived: true }),
          ],
          keitaroChanged: false,
        },
        {
          id: 1305004, name: 'Офферы EU', type: 'regular', position: 3, schema: 'landings', state: 'disabled',
          published: [
            { offer_id: 4010, share: 25 },
            { offer_id: 4011, share: 25 },
          ],
          rows: [row(4010, 25, { pinned: true }), row(4011, 25)],
          keitaroChanged: false,
        },
        {
          id: 1305005, name: 'Остальное', type: 'default', position: 4, schema: 'landings', state: 'active',
          published: [
            { offer_id: 3902, share: 50 },
            { offer_id: 4120, share: 50 },
          ],
          // Черновик уже есть (пережил перезагрузку), а Keitaro под ним поменяли руками.
          rows: [row(3902, 34), row(4120, 33), row(3749, 33, { isNew: true })],
          keitaroChanged: true,
        },
      ],
    },
    {
      id: 209769,
      name: 'wayfinder-test-empty',
      alias: 'wf-empty',
      state: 'paused',
      notices: [],
      streams: [
        {
          id: 1299001, name: 'Гео → Google', type: 'regular', position: 1, schema: 'redirect', state: 'active',
          filter: 'country ∈ PL', redirectUrl: 'https://google.com', published: [], rows: [], keitaroChanged: false,
        },
        {
          id: 1299002, name: 'Офферы', type: 'regular', position: 2, schema: 'landings', state: 'active',
          published: [], rows: [], keitaroChanged: false,
        },
      ],
    },
    {
      id: 205512,
      name: 'Старая кампания без офферов',
      alias: 'old-redirect',
      state: 'active',
      notices: [],
      streams: [
        {
          id: 1290001, name: 'Всё → лендинг', type: 'default', position: 1, schema: 'redirect', state: 'active',
          redirectUrl: 'https://example.com', published: [], rows: [], keitaroChanged: false,
        },
      ],
    },
    { id: 207733, name: 'Diabex PL февраль', alias: 'diabex-pl', state: 'active', notices: [], streams: [] },
    { id: 207734, name: 'Diabex DE февраль', alias: 'diabex-de', state: 'paused', notices: [], streams: [] },
  ];
}

// ---------- правила ----------

export const active = (s: Stream) => s.rows.filter((r) => !r.archived);
export const archived = (s: Stream) => s.rows.filter((r) => r.archived);
export const sum = (rows: { share: number }[]) => rows.reduce((a, r) => a + r.share, 0);
export const isOfferStream = (s: Stream) => s.schema === 'landings';

/** #8: R = 100 − Σ закреплённых поровну, остаток по +1 последним незакреплённым по порядку потока. */
function recompute(rows: Row[]): Row[] {
  const act = rows.filter((r) => !r.archived);
  const free = act.filter((r) => !r.pinned);
  const R = 100 - sum(act.filter((r) => r.pinned));
  if (!free.length) return rows;
  const base = Math.floor(R / free.length);
  const rest = R - base * free.length;
  const extra = new Set(free.slice(free.length - rest).map((r) => r.offer_id));
  return rows.map((r) =>
    r.archived ? { ...r, share: 0 } : r.pinned ? r : { ...r, share: base + (extra.has(r.offer_id) ? 1 : 0) },
  );
}

const order = (rows: Row[]) => [...rows.filter((r) => !r.archived), ...rows.filter((r) => r.archived)];

/** #8: поток — черновик, когда состав активных или их доли отличаются от опубликованных. */
export function isDraft(s: Stream): boolean {
  const a = active(s);
  return (
    a.length !== s.published.length ||
    a.some((r, i) => r.offer_id !== s.published[i].offer_id || r.share !== s.published[i].share)
  );
}

export function streamOrder(streams: Stream[]): Stream[] {
  const rank = { forced: 0, regular: 1, default: 2 } as const;
  return [...streams].sort((a, b) => rank[a.type] - rank[b.type] || a.position - b.position || a.id - b.id);
}

export type Problem = { kind: 'sum' | 'changed' | 'pinned-sum'; text: string };
export function problems(s: Stream): Problem[] {
  const out: Problem[] = [];
  const a = active(s);
  if (s.keitaroChanged) out.push({ kind: 'changed', text: 'Поток в Keitaro изменился после начала правок' });
  if (!isDraft(s) && a.length && sum(a) !== 100)
    out.push({ kind: 'sum', text: `Сумма долей в Keitaro — ${sum(a)}, а не 100` });
  if (isDraft(s) && a.length && a.every((r) => r.pinned) && sum(a) !== 100)
    out.push({ kind: 'pinned-sum', text: `Все офферы закреплены, сумма ${sum(a)} ≠ 100 — публикация заблокирована` });
  return out;
}

export const canPush = (s: Stream) => isDraft(s) && !problems(s).some((p) => p.kind === 'pinned-sum');

// ---------- хук-заглушка ----------

export function useEditorModel() {
  const [campaigns, setCampaigns] = useState(makeCampaigns);
  const [campaignId, setCampaignId] = useState<number | null>(209801);
  const [toast, setToast] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const say = (msg: string) => {
    setToast(msg);
    setLog((l) => [msg, ...l].slice(0, 20));
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3000);
  };

  const campaign = campaigns.find((c) => c.id === campaignId) ?? null;

  const editStream = (streamId: number, fn: (s: Stream) => Stream | string) => {
    setCampaigns((cs) =>
      cs.map((c) => ({
        ...c,
        streams: c.streams.map((s) => {
          if (s.id !== streamId) return s;
          const res = fn(s);
          if (typeof res === 'string') {
            say(res);
            return s;
          }
          return res;
        }),
      })),
    );
  };

  const searchCampaigns = (q: string) => {
    const t = q.trim().toLowerCase();
    return t ? campaigns.filter((c) => c.name.toLowerCase().includes(t) || String(c.id).includes(t)) : campaigns;
  };

  const searchOffers = (q: string) => {
    const t = q.trim().toLowerCase();
    return CATALOG.filter((o) => !t || o.name.toLowerCase().includes(t) || String(o.id).includes(t));
  };

  const actions = {
    add: (sid: number, offerId: number) =>
      editStream(sid, (s) => {
        const ex = s.rows.find((r) => r.offer_id === offerId);
        if (ex && !ex.archived) return `Оффер #${offerId} уже в потоке`;
        if (ex) return actions.bringBackPure(s, offerId);
        return { ...s, rows: order(recompute([...active(s), row(offerId, 0, { isNew: true }), ...archived(s)])) };
      }),
    bringBackPure: (s: Stream, offerId: number): Stream | string => {
      if (!catalogById.has(offerId)) return `Оффер #${offerId} удалён в Keitaro, вернуть нельзя`;
      const r = s.rows.find((x) => x.offer_id === offerId)!;
      const rows = [...active(s), { ...r, archived: false }, ...archived(s).filter((x) => x.offer_id !== offerId)];
      return { ...s, rows: order(recompute(rows)) };
    },
    bringBack: (sid: number, offerId: number) => editStream(sid, (s) => actions.bringBackPure(s, offerId)),
    remove: (sid: number, offerId: number) =>
      editStream(sid, (s) => {
        if (active(s).length <= 1) return 'Нельзя убрать последний оффер потока';
        const rows = s.rows.map((r) => (r.offer_id === offerId ? { ...r, archived: true, pinned: false, share: 0 } : r));
        return { ...s, rows: order(recompute(rows)) };
      }),
    setShare: (sid: number, offerId: number, share: number) =>
      editStream(sid, (s) => {
        if (!Number.isInteger(share) || share < 0 || share > 100) return 'Доля — целое от 0 до 100';
        const rows = s.rows.map((r) => (r.offer_id === offerId ? { ...r, share, pinned: true } : r));
        if (sum(rows.filter((r) => !r.archived && r.pinned)) > 100) return 'Сумма закреплённых долей больше 100';
        return { ...s, rows: recompute(rows) };
      }),
    togglePin: (sid: number, offerId: number) =>
      editStream(sid, (s) => {
        const r = s.rows.find((x) => x.offer_id === offerId)!;
        const rows = s.rows.map((x) => (x.offer_id === offerId ? { ...x, pinned: !x.pinned } : x));
        if (!r.pinned) {
          if (sum(rows.filter((x) => !x.archived && x.pinned)) > 100) return 'Сумма закреплённых долей больше 100';
          return { ...s, rows }; // закрепление само не пересчитывает
        }
        return { ...s, rows: recompute(rows) };
      }),
    recalc: (sid: number) => editStream(sid, (s) => ({ ...s, rows: recompute(s.rows) })),
    cancel: (sid: number) =>
      editStream(sid, (s) => {
        const pub = new Map(s.published.map((p) => [p.offer_id, p.share]));
        const kept = s.rows.filter((r) => !r.isNew);
        const restored = s.published.map((p) => ({ ...kept.find((r) => r.offer_id === p.offer_id)!, archived: false, share: p.share }));
        const rest = kept.filter((r) => !pub.has(r.offer_id)).map((r) => ({ ...r, archived: true, pinned: false, share: 0 }));
        say(`Поток «${s.name}»: правки отменены`);
        return { ...s, rows: [...restored, ...rest], keitaroChanged: false };
      }),
    push: (sid: number, overwrite = false) =>
      editStream(sid, (s) => {
        if (s.keitaroChanged && !overwrite) return 'Поток в Keitaro изменился — нужно подтвердить «Перезаписать»';
        if (!canPush(s)) return 'Публиковать нечего или черновик невалиден';
        say(`Поток «${s.name}» опубликован в Keitaro`);
        return {
          ...s,
          published: active(s).map((r) => ({ offer_id: r.offer_id, share: r.share })),
          rows: s.rows.map((r) => ({ ...r, isNew: false })),
          keitaroChanged: false,
        };
      }),
    fetch: () => say('Fetch: потоки перечитаны из Keitaro (в прототипе ничего не меняется)'),
    simulateKeitaroChange: (sid: number) => editStream(sid, (s) => ({ ...s, keitaroChanged: true })),
  };

  return { campaigns, campaign, campaignId, setCampaignId, searchCampaigns, searchOffers, actions, toast, log };
}

export type EditorModel = ReturnType<typeof useEditorModel>;

export const offerLabel = (id: number) => {
  const o = catalogById.get(id);
  return o ? `#${id} ${o.name}` : `Оффер #${id} (удалён)`;
};

export const streamTypeLabel = { forced: 'перехватывающий', regular: 'обычный', default: 'по умолчанию' } as const;

export const ktCampaignUrl = (id: number) => `https://tlgk.host/admin/#!/campaigns/${id}`;
