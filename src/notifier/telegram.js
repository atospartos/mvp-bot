const TelegramBot = require('node-telegram-bot-api');
const config = require('../config');
const logger = require('../core/logger');
const eventEmitter = require('../core/eventEmitter');

class TelegramNotifier {
    constructor() {
        if (!config.telegram?.token) {
            logger.warn('Telegram токен не указан, уведомления отключены');
            return;
        }
        
        this.bot = new TelegramBot(config.telegram.token, { polling: false });
        this.chatId = config.telegram.chatId;
        
        // Подписываемся на события
        this.setupEventListeners();
        
        logger.info('Telegram нотификатор инициализирован');
    }

    setupEventListeners() {
        // Обработка отправки сообщений
        eventEmitter.on('telegram:send', this.sendMessage.bind(this));
        
        // Уведомления о запуске/остановке бота (будем вызывать из orchestrator)
    }

    sendMessage(data) {
        if (!this.bot || !this.chatId) {
            logger.debug('Telegram не инициализирован, сообщение не отправлено');
            return;
        }
        
        this.bot.sendMessage(this.chatId, data.message, { 
            parse_mode: 'HTML',
            disable_web_page_preview: true
        }).catch(err => {
            logger.error('Ошибка отправки Telegram', { error: err.message });
        });
    }

    sendStartupMessage() {
        const message = 
`🤖 <b>Trading Bot MVP ЗАПУЩЕН</b>

📊 <b>Настройки:</b>
• Интервал между токенами: 250ms
• Интервал между циклами: 5с
• Отслеживаемые токены: ${require('../config/tokens').length}

✅ Бот начал работу и отслеживает арбитражные возможности`;

        this.sendMessage({ message });
    }

    sendShutdownMessage() {
        const message = 
`🛑 <b>Trading Bot MVP ОСТАНОВЛЕН</b>

⏰ <b>Время остановки:</b> ${new Date().toLocaleTimeString()}

Бот завершил работу.`;

        this.sendMessage({ message });
    }

    sendStatusReport(stats) {
        const uptime = stats.uptime || 'N/A';
        const cycles = stats.cyclesCompleted || 0;
        const tokens = stats.tokensProcessed || 0;
        
        const message = 
`📊 <b>СТАТУС БОТА</b>

⏱️ <b>Время работы:</b> ${uptime}
🔄 <b>Циклов выполнено:</b> ${cycles}
📈 <b>Токенов обработано:</b> ${tokens}

✅ Бот работает стабильно`;

        this.sendMessage({ message });
    }
}

module.exports = new TelegramNotifier();