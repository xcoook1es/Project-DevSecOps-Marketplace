const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);

async function sendNotifikasi(chatId, pesan) {
  try {
    await bot.sendMessage(chatId, pesan);
    return true;
  } catch (err) {
    console.error('Telegram error:', err.message);
    return false;
  }
}
module.exports = { sendNotifikasi };