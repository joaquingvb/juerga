const axios = require('axios');
const cheerio = require('cheerio');

const BASE = 'https://www.barceloning.es/en/parties-barcelona';

async function scrapeBarceloning() {
  const { data } = await axios.get(BASE, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Cache-Control': 'max-age=0',
    },
    timeout: 10_000,
  });

  const $ = cheerio.load(data);
  const events = [];

  $('[class*="e-loop-item"]').each((_, card) => {
    const $card = $(card);

    const url = $card.find('a[href*="/en/parties-barcelona/"]').attr('href');
    if (!url) return;

    const title = $card.find('h3').text().trim();
    if (!title) return;

    // Los li contienen: venue (map icon), date (calendar icon), free entry info
    const listItems = $card.find('.elementor-icon-list-text').map((__, el) => $(el).text().trim()).get();
    const venue = listItems[0] || 'Barcelona';
    const dateText = listItems[1] || '';

    events.push({
      source: 'Barceloning',
      city: 'Barcelona',
      title,
      venue,
      date: parseDate(dateText),
      url,
      genres: [],
      isFree: true,
    });
  });

  return events;
}

function parseDate(text) {
  if (!text) return null;
  // "Monday, 25 May" o "Monday, 25 May 2026"
  const clean = text.replace(/^\w+,\s*/, ''); // quita "Monday, "
  const match = clean.match(/(\d{1,2})\s+(\w+)(?:\s+(\d{4}))?/);
  if (!match) return null;
  const year = match[3] ? parseInt(match[3]) : new Date().getFullYear();
  const parsed = new Date(`${match[2]} ${match[1]} ${year}`);
  return isNaN(parsed) ? null : parsed;
}

module.exports = scrapeBarceloning;
