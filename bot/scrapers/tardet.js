const BASE_URL = 'https://eltardet.es/';
const FOURVENUES_BASE = 'https://www.fourvenues.com/iframe/el-tardet/';

async function getBrowser() {
  // En producción (Render) usamos @sparticuz/chromium + puppeteer-core
  try {
    const chromium = require('@sparticuz/chromium');
    const puppeteerCore = require('puppeteer-core');
    const executablePath = await chromium.executablePath();
    return puppeteerCore.launch({
      args: chromium.args,
      executablePath,
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport,
    });
  } catch {
    // En local usamos puppeteer normal
    try {
      const puppeteer = require('puppeteer');
      return puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
    } catch {
      return null;
    }
  }
}

async function scrapeTardet() {
  const browser = await getBrowser();
  if (!browser) {
    console.warn('[Tardet] No hay navegador disponible, saltando');
    return [];
  }

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30_000 });
    await page.waitForSelector('article.event-card', { timeout: 10_000 }).catch(() => {});

    const listings = await page.evaluate(() => {
      const results = [];
      document.querySelectorAll('article.event-card').forEach(el => {
        const body = el.querySelector('.event-card__body');
        const title = body?.querySelector('h2, h3, h4, strong')?.innerText.trim() || '';
        const paras = [...(body?.querySelectorAll('p') || [])].map(p => p.innerText.trim()).filter(Boolean);
        const venue = paras.find(t => t !== title) || 'El Tardet';
        const href = el.querySelector('a')?.href || '';
        if (title && href) results.push({ title, venue, href });
      });
      return results;
    });

    const freeEvents = [];
    for (const item of listings) {
      try {
        await page.goto(item.href, { waitUntil: 'networkidle2', timeout: 20_000 });

        const eventInfo = await page.evaluate(() => {
          const dateText = document.querySelector('time, [class*="date"], [class*="fecha"]')?.innerText.trim() || '';

          let fourvId = null;
          const hashMatch = location.hash.match(/#events\/([^/?]+)/);
          if (hashMatch) {
            fourvId = hashMatch[1];
          } else {
            const iframeSrc = document.querySelector('iframe[src*="fourvenues"]')?.src || '';
            const srcMatch = iframeSrc.match(/fourvenues\.com\/iframe\/[^/]+\/([^/?]+)/);
            if (srcMatch) fourvId = srcMatch[1];
          }

          if (!fourvId) {
            const scriptSrc = document.querySelector('script[src*="fourvenues"]')?.src || '';
            const scriptMatch = scriptSrc.match(/fourvenues\.com\/assets\/iframe\/[^/]+\/([^/?]+)/);
            if (scriptMatch) fourvId = scriptMatch[1];
          }

          return { dateText, fourvId };
        });

        if (!eventInfo.fourvId) {
          console.warn(`[Tardet] No se encontró ID fourvenues en ${item.href}`);
          continue;
        }

        const iframeUrl = `${FOURVENUES_BASE}${eventInfo.fourvId}`;
        await page.goto(iframeUrl, { waitUntil: 'networkidle2', timeout: 20_000 });

        const hasFree = await page.evaluate(() => {
          const isFreePrice = (p) =>
            p === '0€' || p === '0 €' || p === 'gratis' || p === 'free' ||
            /^0[,.]?00\s*€$/.test(p);

          const isSoldOut = (el) => {
            const row = el.parentElement?.parentElement?.parentElement;
            if (row?.querySelector('button[disabled]')) return true;
            const card = row?.parentElement?.parentElement?.parentElement;
            return card?.querySelector('.bg-danger') != null;
          };

          return [...document.querySelectorAll('div.font-semibold.text-lg.whitespace-nowrap')]
            .some(el => isFreePrice(el.innerText.trim().toLowerCase()) && !isSoldOut(el));
        });

        if (hasFree) {
          freeEvents.push({
            source: 'El Tardet',
            city: 'Barcelona',
            title: item.title,
            venue: item.venue,
            date: parseDate(eventInfo.dateText),
            url: item.href,
            genres: [],
            isFree: true,
          });
        }
      } catch (err) {
        console.warn(`[Tardet] Error en ${item.href}: ${err.message}`);
      }
    }

    return freeEvents;

  } finally {
    await browser.close();
  }
}

function parseDate(text) {
  if (!text) return null;
  const meses = { ENERO:0, FEBRERO:1, MARZO:2, ABRIL:3, MAYO:4, JUNIO:5, JULIO:6, AGOSTO:7, SEPTIEMBRE:8, OCTUBRE:9, NOVIEMBRE:10, DICIEMBRE:11 };
  const match = text.match(/(\d{1,2})\s*[.,]?\s*([A-ZÁÉÍÓÚ]+)/i);
  if (match) {
    const day = parseInt(match[1]);
    const month = meses[match[2].toUpperCase()];
    if (month !== undefined) return new Date(new Date().getFullYear(), month, day);
  }
  const parsed = new Date(text);
  return isNaN(parsed) ? null : parsed;
}

module.exports = scrapeTardet;
