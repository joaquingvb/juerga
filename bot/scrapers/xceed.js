const axios = require('axios');

const BASE = 'https://events.xceed.me/v2/events';

const CITY_SLUG = {
  Barcelona: 'barcelona',
  Madrid: 'madrid',
  Valencia: 'valencia',
};

async function scrapeXceed(city) {
  const slug = CITY_SLUG[city];
  if (!slug) return [];

  const { data } = await axios.get(BASE, {
    params: {
      'cities[0]': slug,
      limit: 100,
    },
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Referer: `https://xceed.me/en/${slug}/events`,
    },
    timeout: 10_000,
  });

  const items = data?.data?.items || [];

  return items
    .filter(isFreeEvent)
    .map((e) => normalise(e, city));
}

function isFreeEvent(e) {
  // La API no expone precio; en Xceed los eventos gratis lo indican en el nombre/slug
  const name = (e.name || '').toLowerCase();
  const slug = (e.slug || '').toLowerCase();
  return /free|gratis/.test(name) || /free|gratis/.test(slug);
}

function normalise(e, city) {
  const slug = CITY_SLUG[city];
  return {
    source: 'Xceed',
    city,
    title: e.name || '',
    venue: e.venue?.name || '',
    date: e.startingTime?.date ? new Date(e.startingTime.date) : null,
    url: `https://xceed.me/en/${slug}/events/${e.slug}`,
    genres: (e.lineup || []).map((a) => a.name),
    isFree: true,
  };
}

module.exports = scrapeXceed;
