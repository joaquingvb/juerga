require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Telegraf, Markup } = require('telegraf');
const cron = require('node-cron');
const fetchFreeEvents = require('./scrapers');

const bot = new Telegraf(process.env.BOT_TOKEN);

const users = {}; // chatId -> { city }
const notified = new Set();

const CITIES = ['Barcelona', 'Madrid', 'Valencia'];

function getUser(ctx) {
  const id = ctx.chat.id;
  if (!users[id]) users[id] = { city: null };
  return users[id];
}

// --- /start ---
bot.start((ctx) => {
  const name = ctx.from.first_name || 'crack';
  ctx.reply(
    `👋 ¡Hola, ${name}! Soy *Juerga*, tu detector de entradas gratis en fiestas 🎉\n\n` +
    `Te aviso en cuanto aparezca algo gratis en tu ciudad.\n\n` +
    `¿Dónde estás?`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(
        CITIES.map((c) => Markup.button.callback(c, `city:${c}`))
      ),
    }
  );
});

// --- Selección de ciudad ---
bot.action(/^city:(.+)$/, (ctx) => {
  const city = ctx.match[1];
  getUser(ctx).city = city;
  ctx.answerCbQuery();
  ctx.editMessageText(
    `✅ ¡Listo!\n\n📍 Ciudad: *${city}*\n\nTe avisaré en cuanto encuentre entradas gratis. ¡A guardar el traje! 🕺\n\nUsa /eventos para buscar ahora mismo.`,
    { parse_mode: 'Markdown' }
  );
});

// --- /perfil ---
bot.command('perfil', (ctx) => {
  const user = getUser(ctx);
  if (!user.city) return ctx.reply('Aún no has configurado tu ciudad. Usa /start.');
  ctx.reply(`📍 Ciudad: *${user.city}*`, { parse_mode: 'Markdown' });
});

// --- /cambiar ---
bot.command('cambiar', (ctx) => {
  delete users[ctx.chat.id];
  ctx.reply('Perfil borrado. Usa /start para configurarlo de nuevo.');
});

// --- /eventos ---
bot.command('eventos', async (ctx) => {
  const user = getUser(ctx);
  if (!user.city) return ctx.reply('Primero configura tu ciudad con /start.');

  await ctx.reply(`🔍 Buscando entradas gratis en *${user.city}*...`, { parse_mode: 'Markdown' });
  try {
    const events = await fetchFreeEvents(user.city);
    if (events.length === 0) {
      return ctx.reply('No he encontrado entradas gratis ahora mismo. Vuelve a intentarlo más tarde.');
    }
    await ctx.reply(`Encontré *${events.length}* evento${events.length > 1 ? 's' : ''} gratis:`, { parse_mode: 'Markdown' });
    for (const e of events) {
      await ctx.reply(formatEvent(e), { parse_mode: 'Markdown' })
        .catch(err => console.error('[/eventos reply]', err.message));
    }
  } catch (err) {
    ctx.reply('Error al buscar eventos. Inténtalo de nuevo.');
    console.error('[/eventos]', err.message);
  }
});

// --- Cron ---
const INTERVAL = parseInt(process.env.SCRAPE_INTERVAL_MINUTES || '30', 10);

async function runScrape() {
  const cities = [...new Set(Object.values(users).map((u) => u.city).filter(Boolean))];
  if (cities.length === 0) return;

  for (const city of cities) {
    let events;
    try {
      events = await fetchFreeEvents(city);
    } catch (err) {
      console.error(`[cron] Error scraping ${city}:`, err.message);
      continue;
    }

    for (const event of events) {
      const key = `${event.source}:${event.title}:${event.date?.toDateString()}`;
      if (notified.has(key)) continue;
      notified.add(key);

      const targets = Object.entries(users).filter(([, u]) => u.city === city);
      for (const [chatId] of targets) {
        await bot.telegram.sendMessage(chatId, formatEvent(event), { parse_mode: 'Markdown' })
          .catch((e) => console.error(`[notify] chatId ${chatId}:`, e.message));
      }
    }
  }
}

function esc(text) {
  return String(text || '').replace(/[_*`[]/g, '\\$&');
}

function formatEvent(e) {
  const dateStr = e.date
    ? e.date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
    : 'Fecha por confirmar';
  return (
    `🎉 *Entrada gratis detectada*\n\n` +
    `🎵 *${esc(e.title)}*\n` +
    `📍 ${esc(e.venue)} — ${esc(e.city)}\n` +
    `📅 ${dateStr}\n` +
    `🔗 [Ver evento](${e.url})\n` +
    `_Fuente: ${esc(e.source)}_`
  );
}

cron.schedule(`*/${INTERVAL} * * * *`, () => {
  console.log(`[cron] Escaneando eventos (cada ${INTERVAL} min)...`);
  runScrape();
});

bot.launch();
console.log(`🎉 Juerga bot arrancado — escaneando cada ${INTERVAL} min`);

const http = require('http');
const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url === '/api/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ count: notified.size }));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Juerga bot OK');
  }
}).listen(PORT, () => console.log(`[http] Servidor en puerto ${PORT}`));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
