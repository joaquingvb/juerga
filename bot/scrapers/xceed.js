const axios = require('axios');

// Xceed carga sus eventos vía API interna REST (sin auth pública).
// Endpoint observado en Network tab: GET /api/v1/events con query params.
const BASE = 'https://xceed.me/api/v1';

const CITY_SLUG = {
  Barcelona: 'barcelona',
  Madrid: 'madrid',
  Valencia: 'valencia',
};

async function scrapeXceed(city) {
  const slug = CITY_SLUG[city];
  if (!slug) return [];

  const { data } = await axios.get(`${BASE}/events`, {
    params: {
      city: slug,
      page: 1,
      per_page: 50,
    },
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'application/json',
      Referer: `https://xceed.me/en/${slug}/events`,
    },
    timeout: 10_000,
  });

  // La respuesta tiene shape { data: [ { id, name, start_date, venue, tickets, ... } ] }
  const events = Array.isArray(data?.data) ? data.data : [];

  return events
    .filter(isFreeEvent)
    .map((e) => normalise(e, city));
}

function isFreeEvent(e) {
  // Considerar gratis si el precio mínimo es 0 o si aparece "free" en la etiqueta
  const tickets = e.tickets || [];
  return tickets.some((t) => t.price === 0 || t.type === 'free') ||
    String(e.price_label).toLowerCase().includes('free') ||
    String(e.price_label).toLowerCase().includes('gratis');
}

function normalise(e, city) {
  return {
    source: 'Xceed',
    city,
    title: e.name || e.title,
    venue: e.venue?.name || '',
    date: e.start_date ? new Date(e.start_date) : null,
    url: `https://xceed.me/en/${CITY_SLUG[city]}/events/${e.id}`,
    genres: (e.genres || []).map((g) => g.name),
    isFree: true,
  };
}

module.exports = scrapeXceed;
