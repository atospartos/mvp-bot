const logger = require('./logger');
// Модули
const dexMonitor = require('../dex/monitor');
const cexMonitor = require('../cex/monitor');
const telegram = require('../notifier/telegram');
const cache = require('../cache/cache');

class Orchestrator {
    constructor() {
        this.isRunning = false;
        this.tokens = require('../config/tokens');
        this.currentTokenIndex = 0;
        
        this.config = {
            cycleInterval: 3000,         // 3 секунды между циклами
            minCycleDuration: 2000,
            maxCycleDuration: 45000
        };
        
        this.stats = {
            cyclesCompleted: 0,
            tokensProcessed: 0,
            startTime: null,
            errors: {},
            cycleTimes: []
        };
        
        this.timeouts = {
            dex: 2000,
            mexc: 2000,
            gateio: 2000
        };
    }

    async start() {
        if (this.isRunning) {
            logger.warn('Оркестратор уже запущен');
            return;
        }

        logger.info('🚀 Запуск Trading Bot MVP (чистая версия)');
        
        if (telegram && telegram.sendStartupMessage) {
            telegram.sendStartupMessage();
        }

        this.isRunning = true;
        this.stats.startTime = Date.now();

        await this.runCycle();

        logger.info(`✅ Оркестратор запущен, интервал между циклами: ${this.config.cycleInterval/1000}с`);
    }

    async runCycle() {
        const cycleStartTime = Date.now();
        
        logger.info(`\n🔄 === НАЧАЛО ЦИКЛА ${this.stats.cyclesCompleted + 1} ===`);
        
        // Обрабатываем все токены
        while (this.currentTokenIndex < this.tokens.length && this.isRunning) {
            const token = this.tokens[this.currentTokenIndex];
            
            logger.info(`\n📊 [${this.currentTokenIndex + 1}/${this.tokens.length}] Обработка ${token.symbol}...`);
            
            const tokenStartTime = Date.now();
            
            try {
                const data = await this.getTokenDataWithTimeout(token);
                
                if (data && data.dex && data.cex.length > 0) {
                    await this.analyzeTokenData(token.symbol, data.dex, data.cex);
                } else {
                    logger.info(`⏩ ${token.symbol}: недостаточно данных (DEX: ${!!data?.dex}, CEX: ${data?.cex?.length || 0})`);
                }
                
                const duration = Date.now() - tokenStartTime;
                this.stats.tokensProcessed++;
                logger.info(`✅ ${token.symbol} обработан за ${duration}ms`);

            } catch (error) {
                logger.error(`❌ Ошибка обработки ${token.symbol}:`, { error: error.message });
                
                if (!this.stats.errors[token.symbol]) {
                    this.stats.errors[token.symbol] = 0;
                }
                this.stats.errors[token.symbol]++;
            }
            
            this.currentTokenIndex++;
        }

        // Цикл завершен
        const cycleDuration = Date.now() - cycleStartTime;
        this.stats.cycleTimes.push(cycleDuration);
        this.stats.cyclesCompleted++;
        
        logger.info(`\n✅ === ЦИКЛ ${this.stats.cyclesCompleted} ЗАВЕРШЕН за ${cycleDuration}ms ===`);
        this.logCycleStats();
        
        await this.scheduleNextCycle();
    }

    async getTokenDataWithTimeout(token) {
        const [dexChain, dexAddress] = Object.entries(token.dex || {})[0] || [];
        
        const dexPromise = dexChain && dexAddress ? 
            this.createPromiseWithTimeout(
                dexMonitor.fetchTokenData(token.symbol, dexChain, dexAddress),
                this.timeouts.dex,
                `DEX ${token.symbol}`
            ) : Promise.resolve(null);
        
        const cexPromises = [];
        for (const [exchange, symbol] of Object.entries(token.cex || {})) {
            const timeout = exchange === 'mexc' ? this.timeouts.mexc : this.timeouts.gateio;
            
            cexPromises.push(
                this.createPromiseWithTimeout(
                    cexMonitor.fetchPrice(token.symbol, exchange, symbol),
                    timeout,
                    `${exchange} ${token.symbol}`
                ).catch(error => {
                    logger.debug(`${exchange} ошибка для ${token.symbol}: ${error.message}`);
                    return null;
                })
            );
        }
        
        const [dexResult, ...cexResults] = await Promise.all([
            dexPromise.catch(() => null),
            ...cexPromises
        ]);
        
        const dexData = dexResult?.[0] || null;
        const cexData = cexResults.filter(r => r !== null);
        
        return { dex: dexData, cex: cexData };
    }

    createPromiseWithTimeout(promise, timeoutMs, name) {
        return Promise.race([
            promise,
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error(`${name} timeout`)), timeoutMs)
            )
        ]);
    }

    async analyzeTokenData(symbol, dexData, cexData) {
        try {
            cache.updateDexPrice(symbol, dexData.chainId, dexData.priceUsd, dexData);
            
            const divergences = [];
            
            for (const cex of cexData) {
                cache.updateCexPrice(symbol, cex.exchange, cex.price);
                
                const diffPercent = ((dexData.priceUsd - cex.price) / cex.price) * 100;
                const absDiff = Math.abs(diffPercent);
                const netProfit = absDiff - 0.4;
                
                divergences.push({
                    exchange: cex.exchange,
                    diffPercent,
                    netProfit
                });
            }
            
            divergences.sort((a, b) => Math.abs(b.diffPercent) - Math.abs(a.diffPercent));
            
            const divergenceStrings = divergences
                .map(d => {
                    const emoji = d.diffPercent > 0 ? '📈' : '📉';
                    const profitEmoji = d.netProfit > 0 ? '🟢' : '🔴';
                    return `${d.exchange}: ${emoji} ${d.diffPercent > 0 ? '+' : ''}${d.diffPercent.toFixed(2)}% (${profitEmoji} net ${d.netProfit > 0 ? '+' : ''}${d.netProfit.toFixed(2)}%)`;
                })
                .join(' | ');
            
            logger.info(`💹 ${symbol}: ${divergenceStrings}`);
            
            const significantSignals = divergences.filter(d => Math.abs(d.diffPercent) >= 1.5);
            if (significantSignals.length > 0) {
                logger.signal(`🔥 СИГНАЛ ${symbol}:`, significantSignals);
            }
            
            // Убираем вызов comparator.analyzeSymbol, так как он дублирует логи
            // Весь анализ уже сделан выше
            
        } catch (error) {
            logger.error(`❌ Ошибка анализа ${symbol}:`, { error: error.message });
        }
    }

    async scheduleNextCycle() {
        if (!this.isRunning) return;
        
        this.currentTokenIndex = 0;
        
        const waitTime = this.config.cycleInterval;
        
        logger.info(`\n⏳ Ожидание ${waitTime/1000}с до следующего цикла (в ${new Date(Date.now() + waitTime).toLocaleTimeString()})`);
        
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        if (this.isRunning) {
            logger.info(`\n🔄 СТАРТ НОВОГО ЦИКЛА...`);
            await this.runCycle();
        }
    }

    logCycleStats() {
        const now = Date.now();
        const uptime = ((now - this.stats.startTime) / 1000 / 60).toFixed(1);
        const errorCount = Object.values(this.stats.errors).reduce((a, b) => a + b, 0);
        
        const avgCycleTime = this.stats.cycleTimes.length > 0 
            ? Math.round(this.stats.cycleTimes.reduce((a, b) => a + b, 0) / this.stats.cycleTimes.length)
            : 0;
        
        logger.info(`\n📊 === СТАТИСТИКА ===`);
        logger.info(`⏱️  Uptime: ${uptime} минут`);
        logger.info(`🔄 Циклов выполнено: ${this.stats.cyclesCompleted}`);
        logger.info(`📈 Токенов обработано: ${this.stats.tokensProcessed}`);
        logger.info(`⏱️  Среднее время цикла: ${avgCycleTime}ms`);
        if (errorCount > 0) {
            logger.info(`❌ Ошибок: ${errorCount}`);
        }
        logger.info(`⏳ Интервал между циклами: ${this.config.cycleInterval/1000}с`);
        logger.info(`========================\n`);
    }

    stop() {
        this.isRunning = false;
        this.logCycleStats();
        logger.info('🛑 Оркестратор остановлен');
    }
}

module.exports = new Orchestrator();