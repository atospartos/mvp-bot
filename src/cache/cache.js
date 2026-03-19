const logger = require('../core/logger');

class DataCache {
    constructor() {
        this.dexPrices = {};      // symbol -> { chain -> price }
        this.bestDexPrice = {};   // symbol -> лучшая цена по ликвидности
        this.cexPrices = {};      // symbol -> { exchange -> price }
        this.pools = {};          // symbol -> { chain -> pools[] }
        this.cexStats = {};       // symbol -> { exchange -> stats }
        this.orderBooks = {};     // symbol -> { exchange -> orderbook }
    }

updateDexPrice(symbol, chain, price, poolData) {
    logger.debug(`💰 Сохраняем DEX цену для ${symbol}: $${price}, ликв. $${poolData?.liquidityUsd}`);
    
    if (!this.dexPrices[symbol]) {
        this.dexPrices[symbol] = [];
    }
    
    // Убедимся, что liquidity сохраняется
    const liquidity = poolData?.liquidityUsd || 0;
    
    this.dexPrices[symbol].push({
        price: parseFloat(price),
        chain,
        liquidity: liquidity,
        volume: poolData?.volume24h || 0,
        pair: `${poolData?.baseToken}/${poolData?.quoteToken}`,
        dex: poolData?.dexId,
        timestamp: Date.now()
    });
    
    // Сортируем по ликвидности
    this.dexPrices[symbol].sort((a, b) => b.liquidity - a.liquidity);
    
    // Обновляем bestDexPrice
    if (this.dexPrices[symbol].length > 0) {
        this.bestDexPrice[symbol] = this.dexPrices[symbol][0];
        logger.info(`✅ ${symbol} best DEX: ${this.bestDexPrice[symbol].pair} ликв. $${this.bestDexPrice[symbol].liquidity}`);
    }
}

    updateCexPrice(symbol, exchange, price, volume, bid, ask) {
        if (!this.cexPrices[symbol]) this.cexPrices[symbol] = {};
        this.cexPrices[symbol][exchange] = {
            price,
            volume,
            bid,
            ask,
            timestamp: Date.now()
        };

        // Сохраняем статистику
        if (!this.cexStats[symbol]) this.cexStats[symbol] = {};
        this.cexStats[symbol][exchange] = {
            price,
            volume,
            bid,
            ask,
            spread: ask && bid ? ((ask - bid) / bid) * 100 : null,
            timestamp: Date.now()
        };
    }

    updateOrderBook(symbol, exchange, orderbook) {
        if (!this.orderBooks[symbol]) this.orderBooks[symbol] = {};
        this.orderBooks[symbol][exchange] = {
            ...orderbook,
            timestamp: Date.now()
        };
    }

    getBestDexPrice(symbol) {
    const best = this.bestDexPrice[symbol];
    if (!best) {
        logger.debug(`ℹ️ Нет best DEX price для ${symbol}`);
        return null;
    }
    
    logger.debug(`📊 getBestDexPrice для ${symbol}: цена $${best.price}, ликв. $${best.liquidity}`);
    
    return {
        price: best.price,
        chain: best.chain,
        data: {
            pool: best,
            liquidity: best.liquidity,
            volume: best.volume,
            pair: best.pair
        }
    };
}

    getBestCexPrice(symbol) {
        const exchanges = this.cexPrices[symbol];
        if (!exchanges) return null;

        let best = { price: 0, exchange: null, data: null };
        for (const [exchange, data] of Object.entries(exchanges)) {
            if (data.price > best.price) {
                best = { price: data.price, exchange, data };
            }
        }
        return best.price > 0 ? best : null;
    }

    getCexStats(symbol) {
        const stats = this.cexStats[symbol];
        if (!stats) return null;

        // Усредняем или берем лучшие значения
        const exchanges = Object.keys(stats);
        if (exchanges.length === 0) return null;

        // Берем первую биржу для простоты
        const firstExchange = exchanges[0];
        return stats[firstExchange];
    }

    getDexStats(symbol) {
        const chains = this.pools[symbol];
        if (!chains) return null;

        // Суммируем ликвидность по всем пулам
        let totalLiquidity = 0;
        let totalVolume = 0;
        let bestPool = null;

        for (const [chain, pools] of Object.entries(chains)) {
            if (Array.isArray(pools)) {
                pools.forEach(pool => {
                    totalLiquidity += pool.liquidityUsd || 0;
                    totalVolume += pool.volume24h || 0;

                    if (!bestPool || (pool.liquidityUsd || 0) > (bestPool.liquidityUsd || 0)) {
                        bestPool = pool;
                    }
                });
            }
        }

        return {
            totalLiquidity,
            totalVolume,
            poolsCount: Object.keys(chains).length,
            bestPool
        };
    }
}

module.exports = new DataCache();