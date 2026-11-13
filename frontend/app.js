const api = async (path, options = {}) => {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error(body?.detail ? JSON.stringify(body) : res.statusText);
  return body;
};

// --- вкладки ---
document.querySelectorAll('nav button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('nav button, .tab').forEach((el) => el.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// --- справочник офферов ---
async function loadOfferOptions() {
  try {
    const offers = await api('/keitaro/offers');
    const html = offers.map((o) => `<option value="${o.id}">${o.id} — ${o.name}</option>`).join('');
    document.getElementById('offer-select').innerHTML = html;
    document.getElementById('add-offer-select').innerHTML = html;
  } catch (e) {
    console.error('Не удалось загрузить офферы', e);
  }
}

// --- создание кампании ---
document.getElementById('create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const out = document.getElementById('create-result');
  try {
    const campaign = await api('/campaigns', {
      method: 'POST',
      body: JSON.stringify({
        name: form.get('name'),
        geo: form.get('geo').toUpperCase(),
        offer_id: Number(form.get('offer_id')),
      }),
    });
    out.textContent = JSON.stringify(campaign, null, 2);
  } catch (err) {
    out.textContent = err.message;
  }
});

// --- редактор офферов ---
const campaignId = () => document.getElementById('edit-campaign-id').value;

function renderOffers(offers) {
  document.querySelector('#offers-table tbody').innerHTML = offers
    .map((o) => `<tr>
      <td>${o.offer_id}</td><td>${o.name ?? ''}</td><td>${o.share}</td>
      <td><button data-remove="${o.offer_id}">Удалить</button></td>
    </tr>`)
    .join('');
}

document.getElementById('load-offers').addEventListener('click', async () => {
  try { renderOffers(await api(`/campaigns/${campaignId()}/offers`)); } catch (e) { alert(e.message); }
});

document.getElementById('add-offer').addEventListener('click', async () => {
  const offerId = Number(document.getElementById('add-offer-select').value);
  try {
    renderOffers(await api(`/campaigns/${campaignId()}/offers`, {
      method: 'POST', body: JSON.stringify({ offer_id: offerId }),
    }));
  } catch (e) { alert(e.message); }
});

document.querySelector('#offers-table tbody').addEventListener('click', async (e) => {
  const id = e.target.dataset.remove;
  if (!id) return;
  try {
    renderOffers(await api(`/campaigns/${campaignId()}/offers/${id}`, { method: 'DELETE' }));
  } catch (err) { alert(err.message); }
});

loadOfferOptions();
