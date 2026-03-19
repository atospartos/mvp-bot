const client = require('./client');
const logger = require('../core/logger');
const eventEmitter = require('../core/eventEmitter');

class CexMonitor {
    async fetchPrice(tokenSymbol, exchangeName, symbol) {
        try {
            logger.debug(`📥 CEX запрос для ${tokenSymbol} на ${exchangeName}`);
            
            const ticker = await client.getTicker(exchangeName, symbol);
            
            if (ticker) {
                logger.debug(`✅ ${exchangeName}: ${tokenSymbol} цена $${ticker.price}`);
                
                // Отправляем событие для обратной совместимости
                eventEmitter.emit('cex:price', {
                    symbol: tokenSymbol,
                    exchange: exchangeName,
                    price: ticker.price,
                    volume: ticker.volume,
                    timestamp: Date.now()
                });
                
                return {
                    exchange: exchangeName,
                    price: ticker.price,
                    volume: ticker.volume
                };
            }
            
            return null;
            
        } catch (error) {
            logger.error(`❌ Ошибка CEX для ${tokenSymbol} на ${exchangeName}:`, { error: error.message });
            throw error;
        }
    }
}

module.exports = new CexMonitor();