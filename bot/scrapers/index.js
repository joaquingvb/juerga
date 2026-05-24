const scrapeXceed = require('./xceed');
const scrapeTardet = require('./tardet');
const scrapeEventbrite = require('./eventbrite');

// Devuelve todos los eventos gratis de todas las fuentes para una ciudad dada.
// Falla de forma silenciosa por scraper para no bloquear el resto.
async function fetchFreeEvents(city) {
  const jobs = [
    scrapeXceed(city).catch(err => { console.error(`[Xceed] ${err.message}`); return []; }),
    scrapeEventbrite(city).catch(err => { console.error(`[Eventbrite] ${err.message}`); return []; }),
  ];

  // El Tardet solo tiene sentido para Barcelona
  if (city === 'Barcelona') {
    jobs.push(scrapeTardet().catch(err => { console.error(`[Tardet] ${err.message}`); return []; }));
  }

  const results = await Promise.all(jobs);
  return results.flat();
}

module.exports = fetchFreeEvents;
