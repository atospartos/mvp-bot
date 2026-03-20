const ccxt = require('ccxt');
const logger = require('../core/logger');

class BinanceClient {
    constructor() {
        this.exchange = null;
        this.lastReset = Date.now();
        this.initialize();
    }

    initialize() {
        try {
            this.exchange = new ccxt.binance({
                enableRateLimit: true,
                timeout: 10000,
                options: {
                    defaultType: 'spot'
                }
            });
            logger.info('Binance клиент инициализирован');
        } catch (error) {
            logger.error('Ошибка инициализации Binance:', error.message);
        }
    }

    async getTicker(symbol) {
        if (!this.exchange) return null;
        
        try {
            // Нормализуем символ (Binance использует USDT, а не USDT)
            const normalizedSymbol = symbol.replace('/', '');
            const ticker = await this.exchange.fetchTicker(normalizedSymbol);
            
            return {
                exchange: 'binance',
                symbol,
                price: ticker.last,
                bid: ticker.bid,
                ask: ticker.ask,
                volume: ticker.quoteVolume,
                timestamp: ticker.timestamp
            };
        } catch (error) {
            logger.error(`Binance ticker error for ${symbol}:`, error.message);
            return null;
        }
    }

    async getOrderBook(symbol, limit = 100) {
        if (!this.exchange) return null;
        
        try {
            const normalizedSymbol = symbol.replace('/', '');
            const orderbook = await this.exchange.fetchOrderBook(normalizedSymbol, limit);
            return {
                exchange: 'binance',
                symbol,
                bids: orderbook.bids,
                asks: orderbook.asks,
                timestamp: orderbook.timestamp
            };
        } catch (error) {
            logger.error(`Binance orderbook error for ${symbol}:`, error.message);
            return null;
        }
    }
}

module.exports = new BinanceClient();