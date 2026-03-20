// const config = require('../config');
const logger = require('./logger');
// const eventEmitter = require('./eventEmitter');

// Модули
const dexMonitor = require('../dex/monitor');
const cexMonitor = require('../cex/monitor');
const telegram = require('../notifier/telegram');
const cache = require('../cache/cache');

class Orchestrator {
    constructor() {
        this.isRunning = false;
        this.tokens = require('../config/tokens');
        
        // Настройки
        this.config = {
            delayBetweenTokens: 250,      // 250ms между запуском токенов
            cycleInterval: 5000,          // 5 секунд между циклами
            timeouts: {
                dex: 2000,
                cex: 2000,
            }
        };
        
        this.stats = {
            cyclesCompleted: 0,
            tokensProcessed: 0,
            startTime: null,
            cycleStartTime: null
        };
    }

    async start() {
        if (this.isRunning) {
            logger.warn('Оркестратор уже запущен');
            return;
        }

        logger.info('🚀 Запуск Trading Bot MVP (последовательный запуск токенов с паузой 250ms)');
        logger.info(`📊 Настройки: задержка между токенами ${this.config.delayBetweenTokens}ms, интервал между циклами ${this.config.cycleInterval/1000}с`);
        
        if (telegram && telegram.sendStartupMessage) {
            telegram.sendStartupMessage();
        }

        this.isRunning = true;
        this.stats.startTime = Date.now();

        // Запускаем бесконечные циклы
        this.runCycles();

        logger.info(`✅ Оркестратор запущен, токенов в списке: ${this.tokens.length}`);
    }

    async runCycles() {
        while (this.isRunning) {
            await this.runSingleCycle();
            
            if (this.isRunning) {
                logger.info(`⏳ Ожидание ${this.config.cycleInterval/1000}с до следующего цикла...`);
                await this.delay(this.config.cycleInterval);
            }
        }
    }

    async runSingleCycle() {
        this.stats.cycleStartTime = Date.now();
        
        logger.info(`\n🔄 === НАЧАЛО ЦИКЛА ${this.stats.cyclesCompleted + 1} ===`);
        logger.info(`📊 Запускаем ${this.tokens.length} токенов с интервалом ${this.config.delayBetweenTokens}ms...`);
        
        // Создаем промисы для всех токенов с задержкой между запусками
        const tokenPromises = [];
        
        for (let i = 0; i < this.tokens.length; i++) {
            const token = this.tokens[i];
            
            // Задержка перед запуском каждого токена (кроме первого)
            if (i > 0) {
                await this.delay(this.config.delayBetweenTokens);
            }
            
            // Запускаем обработку токена
            const promise = this.processToken(token).catch(error => {
                logger.error(`❌ [${token.symbol}] Ошибка: ${error.message}`);
                return null;
            });
            
            tokenPromises.push(promise);
        }
        
        // Ждем завершения всех токенов
        const results = await Promise.allSettled(tokenPromises);
        
        // Подсчитываем успешные
        let successCount = 0;
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
                successCount++;
            }
        }
        
        const cycleDuration = Date.now() - this.stats.cycleStartTime;
        this.stats.cyclesCompleted++;
        this.stats.tokensProcessed += successCount;
        
        logger.info(`\n✅ === ЦИКЛ ${this.stats.cyclesCompleted} ЗАВЕРШЕН ===`);
        logger.info(`📊 Успешно: ${successCount}/${this.tokens.length} токенов`);
        logger.info(`⏱️  Длительность: ${cycleDuration}ms (${(cycleDuration/1000).toFixed(1)}с)`);
        this.logStats();
    }

    async processToken(token) {
        const tokenStartTime = Date.now();
        
        logger.info(`📊 [${token.symbol}] Запуск...`);
        
        try {
            // Получаем DEX данные
            const dexPromise = this.getDexData(token);
            
            // Получаем CEX данные с разных бирж (все параллельно)
            const cexPromises = [];
            
            if (token.cex?.mexc) {
                cexPromises.push(this.getCexData(token, 'mexc'));
            }
            if (token.cex?.gateio) {
                cexPromises.push(this.getCexData(token, 'gateio'));
            }
            if (token.cex?.binance) {
                cexPromises.push(this.getCexData(token, 'binance'));
            }
            
            // Ждем все запросы параллельно
            const [dexResult, ...cexResults] = await Promise.allSettled([
                dexPromise,
                ...cexPromises
            ]);
            
            const dexData = dexResult.status === 'fulfilled' ? dexResult.value : null;
            const cexData = cexResults
                .filter(r => r.status === 'fulfilled' && r.value)
                .map(r => r.value);
            
            // Анализируем если есть данные
            if (dexData && cexData.length > 0) {
                this.analyzeTokenData(token.symbol, dexData, cexData);
                
                const duration = Date.now() - tokenStartTime;
                logger.info(`✅ [${token.symbol}] Обработан за ${duration}ms`);
                return true;
            } else {
                logger.info(`⏩ [${token.symbol}] Недостаточно данных (DEX: ${!!dexData}, CEX: ${cexData.length})`);
                return false;
            }
            
        } catch (error) {
            logger.error(`❌ [${token.symbol}] Ошибка: ${error.message}`);
            throw error;
        }
    }

    async getDexData(token) {
        const [dexChain, dexAddress] = Object.entries(token.dex || {})[0] || [];
        if (!dexChain || !dexAddress) return null;
        
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`DEX timeout after ${this.config.timeouts.dex}ms`)), this.config.timeouts.dex)
        );
        
        const dexPromise = dexMonitor.fetchTokenData(token.symbol, dexChain, dexAddress);
        
        const data = await Promise.race([dexPromise, timeoutPromise]);
        return data?.[0] || null;
    }

    async getCexData(token, exchange) {
        const symbol = token.cex?.[exchange];
        if (!symbol) return null;
        
        const timeout = this.config.timeouts.cex;
        
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`${exchange} timeout after ${timeout}ms`)), timeout)
        );
        
        const cexPromise = cexMonitor.fetchPrice(token.symbol, exchange, symbol);
        
        return await Promise.race([cexPromise, timeoutPromise]);
    }

    analyzeTokenData(symbol, dexData, cexData) {
        try {
            cache.updateDexPrice(symbol, dexData.chainId, dexData.priceUsd, dexData);
            
            const divergences = [];
            
            for (const cex of cexData) {
                cache.updateCexPrice(symbol, cex.exchange, cex.price);
                
                const diffPercent = ((dexData.priceUsd - cex.price) / cex.price) * 100;
                const absDiff = Math.abs(diffPercent);
                const netProfit = absDiff - 0.4; // минус комиссии 0.4%
                
                divergences.push({
                    dexPrice: dexData.priceUsd,
                    cexPrice: cex.price,
                    exchange: cex.exchange,
                    diffPercent,
                    absDiff,
                    netProfit
                });
            }
            
            // Сортируем по абсолютной разнице
            divergences.sort((a, b) => b.absDiff - a.absDiff);
            
            // Формируем строку вывода
            const divergenceStrings = divergences
                .map(d => {
                    const emoji = d.diffPercent > 0 ? '📈' : '📉';
                    const profitEmoji = d.netProfit > 0 ? '🟢' : '🔴';
                    const profitStr = d.netProfit > 0 ? `+${d.netProfit.toFixed(2)}` : d.netProfit.toFixed(2);
                    return `dex: ${d.dexPrice}, cex: ${d.cexPrice}, ${d.exchange}: ${emoji} ${d.diffPercent > 0 ? '+' : ''}${d.diffPercent.toFixed(2)}% (${profitEmoji} net ${profitStr}%)`;
                })
                .join(' | ');
            
            logger.info(`💹 ${symbol}: ${divergenceStrings}`);
            
            // Если есть сигнал >1.5%, дополнительно логируем
            const significantSignals = divergences.filter(d => d.absDiff >= 1.5);
            if (significantSignals.length > 0) {
                logger.signal(`🔥 СИГНАЛ ${symbol}:`, significantSignals.map(s => ({
                    exchange: s.exchange,
                    diffPercent: s.diffPercent.toFixed(2) + '%',
                    netProfit: s.netProfit.toFixed(2) + '%'
                })));
            }
            
        } catch (error) {
            logger.error(`❌ Ошибка анализа ${symbol}:`, { error: error.message });
        }
    }

    logStats() {
        const now = Date.now();
        const uptime = ((now - this.stats.startTime) / 1000 / 60).toFixed(1);
        
        logger.info(`\n📊 === СТАТИСТИКА ===`);
        logger.info(`⏱️  Uptime: ${uptime} минут`);
        logger.info(`🔄 Циклов выполнено: ${this.stats.cyclesCompleted}`);
        logger.info(`📈 Токенов обработано: ${this.stats.tokensProcessed}`);
        logger.info(`========================\n`);
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    stop() {
        this.isRunning = false;
        this.logStats();
        logger.info('🛑 Оркестратор остановлен');
    }
}

module.exports = new Orchestrator();