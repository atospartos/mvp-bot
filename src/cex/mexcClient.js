const ccxt = require('ccxt');
const logger = require('../core/logger');

class MexcClient {
    constructor() {
        this.exchange = null;
        this.initialize();
    }

    initialize() {
        try {
            this.exchange = new ccxt.mexc({
                enableRateLimit: true,
                timeout: 10000,
                options: { defaultType: 'spot' }
            });
            logger.info('MEXC клиент инициализирован');
        } catch (error) {
            logger.error('Ошибка инициализации MEXC:', error.message);
        }
    }

    async getTicker(symbol) {
        if (!this.exchange) return null;
        try {
            // await this._checkRateLimit();
            const ticker = await this.exchange.fetchTicker(symbol);
            return {
                exchange: 'mexc',
                symbol,
                price: ticker.last,
                bid: ticker.bid,
                ask: ticker.ask,
                volume: ticker.quoteVolume,
                timestamp: ticker.timestamp
            };
        } catch (error) {
            //logger.error(`MEXC ticker error for ${symbol}:`, error.message);
            return null;
        }
    }

    async getOrderBook(symbol, limit = 100) {
        if (!this.exchange) return null;
        try {
            // await this._checkRateLimit();
            return await this.exchange.fetchOrderBook(symbol, limit);
        } catch (error) {
            //logger.error(`MEXC orderbook error for ${symbol}:`, error.message);
            return null;
        }
    }
    
        // async _checkRateLimit() {
        //     // Простой rate limiter - 20 запросов в секунду
        //     const now = Date.now();
        //     if (now - this.lastReset > 1000) {
        //         this.requestCount = 0;
        //         this.lastReset = now;
        //     }
            
        //     if (this.requestCount >= 18) { // Оставляем запас
        //         const waitTime = 1000 - (now - this.lastReset);
        //         logger.warn(`Rate limit approaching, waiting ${waitTime}ms`);
        //         await new Promise(resolve => setTimeout(resolve, waitTime));
        //         this.requestCount = 0;
        //         this.lastReset = Date.now();
        //     }
            
        //     this.requestCount++;
        // }
}

module.exports = new MexcClient();