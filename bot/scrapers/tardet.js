const axios = require('axios');
const cheerio = require('cheerio');

// El Tardet es una promotora barcelonesa. Publica su agenda en eltardet.com.
// La web es HTML estático, así que usamos cheerio.
const BASE_URL = 'https://www.eltardet.com/agenda';

async function scrapeTardet() {
  const { data: html } = await axios.get(BASE_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 10_000,
  });

  const $ = cheerio.load(html);
  const events = [];

  // Cada evento está en un article o div con clase .event-item (ajustar tras inspeccionar)
  $('article.event-item, .event-card, .agenda-item').each((_, el) => {
    const title = $(el).find('.event-title, h2, h3').first().text().trim();
    const dateText = $(el).find('.event-date, .date, time').first().text().trim();
    const venue = $(el).find('.event-venue, .venue, .location').first().text().trim();
    const priceText = $(el).find('.event-price, .price, .ticket-price').first().text().trim();
    const href = $(el).find('a[href]').first().attr('href');

    if (!title) return;

    const isFree = isFreeText(priceText);
    if (!isFree) return;

    events.push({
      source: 'El Tardet',
      city: 'Barcelona',
      title,
      venue: venue || 'El Tardet',
      date: parseDate(dateText),
      url: href ? toAbsolute(href) : BASE_URL,
      genres: [],
      isFree: true,
    });
  });

  return events;
}

function isFreeText(text) {
  const t = text.toLowerCase();
  return t === '' || t.includes('gratis') || t.includes('free') || t.includes('0€') || t.includes('0 €');
}

function parseDate(text) {
  // Intenta parsear fechas en formato DD/MM/YYYY o DD-MM-YYYY o texto como "Sábado 24 mayo"
  if (!text) return null;
  const isoMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (isoMatch) {
    const [, d, m, y] = isoMatch;
    return new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);
  }
  const parsed = new Date(text);
  return isNaN(parsed) ? null : parsed;
}

function toAbsolute(href) {
  if (href.startsWith('http')) return href;
  return `https://www.eltardet.com${href.startsWith('/') ? '' : '/'}${href}`;
}

module.exports = scrapeTardet;
