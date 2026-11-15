export interface OfferShort {
  id: number;
  name: string;
}

export interface StreamOffer {
  offer_id: number;
  name: string | null;
  share: number;
}

export interface Campaign {
  id: number;
  keitaro_id: number;
  name: string;
  alias: string | null;
  geo: string;
  initial_offer_id: number;
  created_at: string;
}

export interface CampaignCreate {
  name: string;
  geo: string;
  offer_id: number;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = res.status === 204 ? null : await res.json();
  if (!res.ok) {
    throw new Error(body?.detail ? JSON.stringify(body) : res.statusText);
  }
  return body as T;
}

export const api = {
  listOffers: () => request<OfferShort[]>('/keitaro/offers'),
  createCampaign: (data: CampaignCreate) =>
    request<Campaign>('/campaigns', { method: 'POST', body: JSON.stringify(data) }),
  campaignOffers: (campaignId: number) => request<StreamOffer[]>(`/campaigns/${campaignId}/offers`),
  addOffer: (campaignId: number, offerId: number) =>
    request<StreamOffer[]>(`/campaigns/${campaignId}/offers`, {
      method: 'POST',
      body: JSON.stringify({ offer_id: offerId }),
    }),
  removeOffer: (campaignId: number, offerId: number) =>
    request<StreamOffer[]>(`/campaigns/${campaignId}/offers/${offerId}`, { method: 'DELETE' }),
};
