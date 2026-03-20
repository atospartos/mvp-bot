const axios = require('axios');
const logger = require('../core/logger');

class GateClient {
    constructor() {
        this.baseUrl = 'https://api.gateio.ws/api/v4';
    }

    async getTicker(symbol) {
        try {
            // Простой rate limiting
            // await this._checkRateLimit();
            
            const gateSymbol = symbol.replace('/', '_');
            const response = await axios.get(
                `${this.baseUrl}/spot/tickers`,
                { params: { currency_pair: gateSymbol }, timeout: 2000 }
            );
            
            if (response.data && response.data[0]) {
                const ticker = response.data[0];
                return {
                    exchange: 'gateio',
                    symbol,
                    price: parseFloat(ticker.last),
                    bid: parseFloat(ticker.highest_bid),
                    ask: parseFloat(ticker.lowest_ask),
                    volume: parseFloat(ticker.quote_volume),
                    timestamp: Date.now()
                };
            }
            return null;
        } catch (error) {
            //logger.error(`Gate.io ticker error for ${symbol}:`, error.message);
            return null;
        }
    }

    async getOrderBook(symbol, limit = 100) {
        try {
            // await this._checkRateLimit();
            const gateSymbol = symbol.replace('/', '_');
            const response = await axios.get(
                `${this.baseUrl}/spot/order_book`,
                { params: { currency_pair: gateSymbol, limit }, timeout: 5000 }
            );
            return response.data;
        } catch (error) {
            //logger.error(`Gate.io orderbook error for ${symbol}:`, error.message);
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

module.exports = new GateClient();