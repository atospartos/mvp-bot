const logger = require('./logger');

class RateLimiter {
    constructor(maxRequestsPerSecond = 5) {
        this.maxRequestsPerSecond = maxRequestsPerSecond;
        this.queue = [];
        this.requestsThisSecond = 0;
        this.lastResetTime = Date.now();
        this.totalRequests = 0;
        this.delayedRequests = 0;
        this.processingTimer = null;
    }

    /**
     * Добавление запроса в очередь
     */
    async schedule(requestFn, requestName = 'unknown') {
        return new Promise((resolve, reject) => {
            this.queue.push({
                requestFn,
                requestName,
                resolve,
                reject,
                queuedAt: Date.now()
            });
            
            // Запускаем обработку очереди
            this.processQueue();
        });
    }

    /**
     * Обработка очереди запросов
     */
    async processQueue() {
        // Если уже есть активный таймер, не создаем новый
        if (this.processingTimer) return;

        const processNext = async () => {
            if (this.queue.length === 0) {
                this.processingTimer = null;
                return;
            }

            // Проверяем и сбрасываем счетчик каждую секунду
            const now = Date.now();
            if (now - this.lastResetTime >= 1000) {
                this.requestsThisSecond = 0;
                this.lastResetTime = now;
            }

            // Если превышен лимит, ждем до следующей секунды
            if (this.requestsThisSecond >= this.maxRequestsPerSecond) {
                const waitTime = 1000 - (now - this.lastResetTime);
                this.processingTimer = setTimeout(processNext, waitTime);
                return;
            }

            // Берем следующий запрос из очереди
            const request = this.queue.shift();
            if (!request) {
                this.processingTimer = null;
                return;
            }

            this.requestsThisSecond++;
            this.totalRequests++;

            const waitTime = Date.now() - request.queuedAt;
            if (waitTime > 100) {
                this.delayedRequests++;
                logger.debug(`⏳ Запрос "${request.requestName}" ожидал ${waitTime}ms`);
            }

            try {
                const result = await request.requestFn();
                request.resolve(result);
            } catch (error) {
                request.reject(error);
            }

            // Планируем следующий запрос (микро-задержка для предотвращения стека)
            this.processingTimer = setTimeout(processNext, 10);
        };

        // Запускаем обработку
        this.processingTimer = setTimeout(processNext, 0);
    }

    /**
     * Получение статистики
     */
    getStats() {
        const now = Date.now();
        const timeInSecond = now - this.lastResetTime;
        
        return {
            queueLength: this.queue.length,
            requestsThisSecond: this.requestsThisSecond,
            maxRequestsPerSecond: this.maxRequestsPerSecond,
            totalRequests: this.totalRequests,
            delayedRequests: this.delayedRequests,
            timeInSecond: `${timeInSecond}ms`,
            delayRate: this.totalRequests > 0 
                ? ((this.delayedRequests / this.totalRequests) * 100).toFixed(1) + '%'
                : '0%'
        };
    }

    /**
     * Очистка очереди
     */
    clearQueue() {
        if (this.processingTimer) {
            clearTimeout(this.processingTimer);
            this.processingTimer = null;
        }
        
        const remaining = this.queue.length;
        this.queue = [];
        logger.debug(`🧹 Очередь очищена, удалено ${remaining} запросов`);
    }
}

module.exports = new RateLimiter(5);