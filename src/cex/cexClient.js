// src/cex/mexcClient.js
const axios = require('axios');
const crypto = require('crypto');
const logger = require('../core/logger');

class MexcClient {
    constructor(options = {}) {
        this.baseURL = options.baseURL || 'https://api.mexc.com';
        this.timeout = options.timeout || 3000;
        this.apiKey = process.env.MEXC_API_KEY;
        this.apiSecret = process.env.MEXC_API_SECRET;
        this.maxRequestsPerClient = 6;
        this.requestCount = 0;
        this.client = null;
        
        this.createClient();
    }

    createClient() {
        this.client = axios.create({
            baseURL: this.baseURL,
            timeout: this.timeout,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
        
        // Интерсептор для аутентификации
        this.client.interceptors.request.use((config) => {
            if (this.apiKey && this.apiSecret && this.requiresAuth(config.url)) {
                const timestamp = Date.now();
                const params = config.params || {};
                params.timestamp = timestamp;
                
                // Создание подписи HMAC SHA256
                const queryString = this.buildQueryString(params);
                const signature = crypto
                    .createHmac('sha256', this.apiSecret)
                    .update(queryString)
                    .digest('hex');
                
                params.signature = signature;
                config.params = params;
                config.headers['x-mexc-apikey'] = this.apiKey;
            }
            return config;
        });
        
        this.requestCount = 0;
        logger.debug(`🔄 Создан новый MEXC клиент`);
    }

    requiresAuth(url) {
        const authEndpoints = ['/api/v3/order', '/api/v3/account', '/api/v3/myTrades'];
        return authEndpoints.some(endpoint => url.includes(endpoint));
    }

    buildQueryString(params) {
        return Object.keys(params)
            .sort()
            .map(key => `${key}=${params[key]}`)
            .join('&');
    }

    checkAndRotateClient() {
        if (this.requestCount >= this.maxRequestsPerClient) {
            logger.debug(`🔄 Пересоздание MEXC клиента (${this.requestCount} запросов)`);
            this.createClient();
        }
    }

    async getTicker(symbol) {
        if (!symbol) {
            logger.warn('MexcClient: символ не указан');
            return null;
        }

        this.checkAndRotateClient();
        
        const mexcSymbol = symbol.replace('/', '');

        try {
            const response = await this.client.get(`/api/v3/ticker/price`, {
                params: { symbol: mexcSymbol }
            });
            
            this.requestCount++;

            if (response.data && response.data.price) {
                return {
                    exchange: 'mexc',
                    symbol: symbol,
                    price: parseFloat(response.data.price),
                    timestamp: Date.now()
                };
            }
            return null;

        } catch (error) {
            if (error.response?.status === 429) {
                logger.warn(`⚠️ Rate limit, пересоздание клиента`);
                this.createClient();
            } else {
                logger.debug(`MEXC ticker error: ${error.response?.status} - ${error.response?.data?.msg || error.message}`);
            }
            return null;
        }
    }

    async getOrderBook(symbol, limit = 100) {
        this.checkAndRotateClient();
        
        const mexcSymbol = symbol.replace('/', '');
        
        try {
            const response = await this.client.get(`/api/v3/depth`, {
                params: { symbol: mexcSymbol, limit }
            });
            this.requestCount++;
            return response.data;
        } catch (error) {
            if (error.response?.status === 429) {
                logger.warn(`⚠️ Rate limit, пересоздание клиента`);
                this.createClient();
            }
            return null;
        }
    }

    async placeOrder(symbol, side, type, quantity, price = null) {
        this.checkAndRotateClient();
        
        const mexcSymbol = symbol.replace('/', '');
        const orderData = {
            symbol: mexcSymbol,
            side: side.toUpperCase(),
            type: type.toUpperCase(),
            quantity: quantity.toString()
        };
        
        if (price && type.toUpperCase() === 'LIMIT') {
            orderData.price = price.toString();
            orderData.timeInForce = 'GTC';
        }
        
        try {
            const response = await this.client.post(`/api/v3/order`, null, {
                params: orderData
            });
            this.requestCount++;
            
            logger.info(`✅ Ордер выставлен: ${side} ${quantity} ${symbol}`);
            return response.data;
            
        } catch (error) {
            logger.error(`Ошибка ордера: ${error.response?.data?.msg || error.message}`);
            return null;
        }
    }
}

module.exports = new MexcClient();