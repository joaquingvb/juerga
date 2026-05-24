require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Telegraf, Markup } = require('telegraf');
const cron = require('node-cron');
const fetchFreeEvents = require('./scrapers');

const bot = new Telegraf(process.env.BOT_TOKEN);

// --- Almacén en memoria (sustituir por DB en producción) ---
const users = {}; // chatId -> { city, genres }
// Guarda los IDs de eventos ya notificados para no repetir
const notified = new Set();

const CITIES = ['Barcelona', 'Madrid', 'Valencia'];
const GENRES = ['Techno', 'House', 'Reggaeton', 'Pop', 'Hip-Hop', 'R&B', 'Latino', 'Electro'];

function getUser(ctx) {
  const id = ctx.chat.id;
  if (!users[id]) users[id] = { city: null, genres: [] };
  return users[id];
}

// --- /start — bienvenida + elección de ciudad ---
bot.start((ctx) => {
  const name = ctx.from.first_name || 'crack';
  ctx.reply(
    `👋 ¡Hola, ${name}! Soy *Juerga*, tu detector de entradas gratis en fiestas 🎉\n\n` +
    `Monitorizo *Xceed, Resident Advisor, Fever y Eventbrite* y te aviso cuando aparezca algo gratis.\n\n` +
    `Primero dime: ¿en qué ciudad estás?`,
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
    `📍 Ciudad: *${city}*\n\nAhora elige tus géneros favoritos (puedes elegir varios) y pulsa *Listo* cuando acabes.`,
    {
      parse_mode: 'Markdown',
      ...buildGenreKeyboard(ctx.chat.id),
    }
  );
});

// --- Selección de géneros (toggle) ---
bot.action(/^genre:(.+)$/, (ctx) => {
  const genre = ctx.match[1];
  const user = getUser(ctx);
  const idx = user.genres.indexOf(genre);
  if (idx === -1) user.genres.push(genre);
  else user.genres.splice(idx, 1);
  ctx.answerCbQuery(`${user.genres.includes(genre) ? '✅' : '❌'} ${genre}`);
  ctx.editMessageReplyMarkup(buildGenreKeyboard(ctx.chat.id).reply_markup);
});

// --- Confirmar géneros ---
bot.action('done_genres', (ctx) => {
  const user = getUser(ctx);
  if (user.genres.length === 0) {
    return ctx.answerCbQuery('Elige al menos un género 🎵', { show_alert: true });
  }
  ctx.answerCbQuery();
  ctx.editMessageText(
    `✅ ¡Perfecto!\n\n` +
    `📍 Ciudad: *${user.city}*\n` +
    `🎵 Géneros: ${user.genres.join(', ')}\n\n` +
    `Te avisaré en cuanto encuentre entradas gratis. ¡A guardar el traje! 🕺`,
    { parse_mode: 'Markdown' }
  );
});

// --- /perfil — ver configuración actual ---
bot.command('perfil', (ctx) => {
  const user = getUser(ctx);
  if (!user.city) {
    return ctx.reply('Aún no has configurado tu perfil. Usa /start para empezar.');
  }
  ctx.reply(
    `Tu perfil actual:\n📍 Ciudad: *${user.city}*\n🎵 Géneros: ${user.genres.join(', ') || 'ninguno'}`,
    { parse_mode: 'Markdown' }
  );
});

// --- /cambiar — reiniciar onboarding ---
bot.command('cambiar', (ctx) => {
  delete users[ctx.chat.id];
  ctx.reply('Perfil borrado. Usa /start para configurarlo de nuevo.');
});

// --- Helper: teclado de géneros con estado visual ---
function buildGenreKeyboard(chatId) {
  const selected = users[chatId]?.genres || [];
  const buttons = GENRES.map((g) =>
    Markup.button.callback(`${selected.includes(g) ? '✅ ' : ''}${g}`, `genre:${g}`)
  );
  // 2 columnas
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  rows.push([Markup.button.callback('Listo ✔️', 'done_genres')]);
  return Markup.inlineKeyboard(rows);
}

// --- Cron: escanea eventos gratis y notifica ---
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

      const targets = Object.entries(users).filter(([, u]) => u.city === city && u.genres.length > 0);
      for (const [chatId] of targets) {
        await bot.telegram.sendMessage(chatId, formatEvent(event), { parse_mode: 'Markdown' })
          .catch((e) => console.error(`[notify] chatId ${chatId}:`, e.message));
      }
    }
  }
}

function formatEvent(e) {
  const dateStr = e.date
    ? e.date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
    : 'Fecha por confirmar';
  return (
    `🎉 *Entrada gratis detectada*\n\n` +
    `🎵 *${e.title}*\n` +
    `📍 ${e.venue} — ${e.city}\n` +
    `📅 ${dateStr}\n` +
    `🔗 [Ver evento](${e.url})\n` +
    `_Fuente: ${e.source}_`
  );
}

// Arranca el cron — expresión: cada N minutos
cron.schedule(`*/${INTERVAL} * * * *`, () => {
  console.log(`[cron] Escaneando eventos (cada ${INTERVAL} min)...`);
  runScrape();
});

bot.launch();
console.log(`🎉 Juerga bot arrancado — escaneando cada ${INTERVAL} min`);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
