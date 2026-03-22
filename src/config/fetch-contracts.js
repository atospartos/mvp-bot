const ContractResolver = require('./contract-resolver');

async function main() {
    const resolver = new ContractResolver({
        delayMs: 1000,        // базовая задержка между запросами
        timeout: 15000,       // таймаут запроса
        maxRetries: 3,        // количество повторных попыток
        retryDelayMs: 1000    // задержка между повторами
    });
    
    // Читаем токены из файла и генерируем tokens.js
    await resolver.updateFromFile('/home/user/mvp-trading-bot/src/config/tokens.txt', '/home/user/mvp-trading-bot/src/config/tokens.js', 'gateio');
}

main().catch(console.error);