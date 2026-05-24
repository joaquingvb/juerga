const axios = require('axios');

// Eventbrite API v3 — requiere token en .env: EVENTBRITE_TOKEN
// Docs: https://www.eventbrite.com/platform/api
const BASE = 'https://www.eventbriteapi.com/v3';
const MUSIC_CATEGORY_ID = '103'; // Music

const CITY_COORDS = {
  Barcelona: { lat: 41.3874, lon: 2.1686, radius: '10km' },
  Madrid:    { lat: 40.4168, lon: -3.7038, radius: '10km' },
  Valencia:  { lat: 39.4699, lon: -0.3763, radius: '10km' },
};

async function scrapeEventbrite(city) {
  const token = process.env.EVENTBRITE_TOKEN;
  if (!token) {
    console.warn('[Eventbrite] EVENTBRITE_TOKEN no configurado — saltando');
    return [];
  }

  const coords = CITY_COORDS[city];
  if (!coords) return [];

  const now = new Date().toISOString();

  const { data } = await axios.get(`${BASE}/events/search/`, {
    params: {
      'location.latitude': coords.lat,
      'location.longitude': coords.lon,
      'location.within': coords.radius,
      'categories': MUSIC_CATEGORY_ID,
      'is_free': true,
      'start_date.range_start': now,
      'expand': 'venue,ticket_availability',
      'page_size': 50,
    },
    headers: {
      Authorization: `Bearer ${token}`,
    },
    timeout: 10_000,
  });

  const events = data?.events || [];
  return events.map((e) => normalise(e, city));
}

function normalise(e, city) {
  return {
    source: 'Eventbrite',
    city,
    title: e.name?.text || '',
    venue: e.venue?.name || '',
    date: e.start?.utc ? new Date(e.start.utc) : null,
    url: e.url,
    genres: [],
    isFree: true,
  };
}

module.exports = scrapeEventbrite;
