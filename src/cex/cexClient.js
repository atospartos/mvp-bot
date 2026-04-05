// src/cex/gateClient.js
const axios = require('axios');
const logger = require('../core/logger');

class GateClient {
    constructor(options = {}) {
        this.baseURL = options.baseURL || 'https://api.gateio.ws/api/v4';
        this.timeout = options.timeout || 2000;
        this.maxRequestsPerClient = 6;     // Пересоздаем после 6 запросов
        this.requestCount = 0;
        this.client = null;
        
        this.createClient();
    }

    // Создание нового клиента
    createClient() {
        this.client = axios.create({
            baseURL: this.baseURL,
            timeout: this.timeout,
            headers: {
                'Accept': '*/*',
                'Connection': 'close'
            },
            httpAgent: false,
            httpsAgent: false
        });
        this.requestCount = 0;
        logger.debug(`🔄 Создан новый Gate.io клиент`);
    }

    // Проверка и пересоздание клиента при необходимости
    checkAndRotateClient() {
        if (this.requestCount >= this.maxRequestsPerClient) {
            logger.debug(`🔄 Пересоздание Gate.io клиента (${this.requestCount} запросов)`);
            this.createClient();
        }
    }

    async getTicker(symbol) {
        if (!symbol) {
            logger.warn('GateClient: символ не указан');
            return null;
        }

        this.checkAndRotateClient();
        
        const gateSymbol = symbol.replace('/', '_');

        try {
            const response = await this.client.get(`/spot/tickers`, {
                params: { currency_pair: gateSymbol }
            });
            
            this.requestCount++;

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
            if (error.response?.status === 429) {
                logger.warn(`⚠️ Rate limit, принудительное пересоздание клиента`);
                this.createClient();
            }
            return null;
        }
    }

    async getOrderBook(symbol, limit = 100) {
        this.checkAndRotateClient();
        
        const gateSymbol = symbol.replace('/', '_');
        
        try {
            const response = await this.client.get(`/spot/order_book`, {
                params: { currency_pair: gateSymbol, limit }
            });
            this.requestCount++;
            return response.data;
        } catch (error) {
            if (error.response?.status === 429) {
                logger.warn(`⚠️ Rate limit, принудительное пересоздание клиента`);
                this.createClient();
            }
            return null;
        }
    }
}

module.exports = new GateClient();