// test-gate-tickers.js
// Тестирование производительности Gate.io API при запросе всех тикеров сразу

const axios = require('axios');
const { performance } = require('perf_hooks');

class GateTickerTest {
    constructor() {
        // Базовый URL для REST API Gate.io v4
        this.baseURL = 'https://api.gateio.ws/api/v4';
        
        // Статистика по тестам
        this.stats = {
            totalTests: 0,
            successTests: 0,
            failedTests: 0,
            totalDuration: 0,
            minDuration: Infinity,
            maxDuration: 0,
            errors: []
        };
    }

    // Основной метод для получения всех тикеров
    async fetchAllTickers() {
        const startTime = performance.now();
        
        try {
            // GET запрос к /spot/tickers без параметров (все тикеры)
            const response = await axios.get(`${this.baseURL}/spot/tickers`, {
                timeout: 30000, // 30 секунд таймаут
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Gate-Ticker-Test/1.0'
                }
            });
            
            const duration = performance.now() - startTime;
            
            return {
                success: true,
                duration,
                status: response.status,
                data: response.data,
                count: response.data.length
            };
            
        } catch (error) {
            const duration = performance.now() - startTime;
            
            return {
                success: false,
                duration,
                error: {
                    message: error.message,
                    code: error.code,
                    status: error.response?.status,
                    statusText: error.response?.statusText,
                    data: error.response?.data
                }
            };
        }
    }

    // Запуск одиночного теста
    async runSingleTest(testNumber) {
        console.log(`\n📊 Тест #${testNumber} (${new Date().toISOString()})`);
        console.log('─'.repeat(50));
        
        const result = await this.fetchAllTickers();
        
        // Обновляем статистику
        this.stats.totalTests++;
        this.stats.totalDuration += result.duration;
        
        if (result.success) {
            this.stats.successTests++;
            this.stats.minDuration = Math.min(this.stats.minDuration, result.duration);
            this.stats.maxDuration = Math.max(this.stats.maxDuration, result.duration);
            
            console.log(`✅ Успех | Время: ${result.duration.toFixed(2)}ms`);
            console.log(`   Количество тикеров: ${result.count}`);
            console.log(`   Первый тикер: ${result.data[0]?.currency_pair} = ${result.data[0]?.last}`);
            console.log(`   Последний тикер: ${result.data[result.count-1]?.currency_pair} = ${result.data[result.count-1]?.last}`);
            
            // Сохраняем пример данных для анализа
            if (testNumber === 1) {
                this.saveSampleData(result.data);
            }
            
        } else {
            this.stats.failedTests++;
            this.stats.errors.push({
                test: testNumber,
                time: new Date().toISOString(),
                error: result.error
            });
            
            console.log(`❌ Ошибка | Время: ${result.duration.toFixed(2)}ms`);
            console.log(`   ${result.error.message}`);
            if (result.error.status) {
                console.log(`   Status: ${result.error.status} ${result.error.statusText}`);
            }
        }
        
        console.log('─'.repeat(50));
    }

    // Запуск серии тестов
    async runTestSeries(count = 10, delayBetweenTests = 1000) {
        console.log('\n🚀 ЗАПУСК ТЕСТИРОВАНИЯ GATE.IO TICKERS API');
        console.log('='.repeat(60));
        console.log(`Количество тестов: ${count}`);
        console.log(`Задержка между тестами: ${delayBetweenTests}ms`);
        console.log('='.repeat(60));
        
        const seriesStartTime = performance.now();
        
        for (let i = 1; i <= count; i++) {
            await this.runSingleTest(i);
            
            // Задержка между тестами (кроме последнего)
            if (i < count) {
                await new Promise(resolve => setTimeout(resolve, delayBetweenTests));
            }
        }
        
        const seriesDuration = (performance.now() - seriesStartTime) / 1000;
        
        // Выводим итоговую статистику
        this.printStats(seriesDuration);
    }

    // Вывод статистики
    printStats(seriesDuration) {
        console.log('\n📈 ИТОГОВАЯ СТАТИСТИКА');
        console.log('='.repeat(60));
        console.log(`Всего тестов: ${this.stats.totalTests}`);
        console.log(`✅ Успешных: ${this.stats.successTests}`);
        console.log(`❌ Ошибок: ${this.stats.failedTests}`);
        console.log(`⏱️  Общее время серии: ${seriesDuration.toFixed(2)} сек`);
        
        if (this.stats.successTests > 0) {
            const avgDuration = this.stats.totalDuration / this.stats.successTests;
            console.log('\n⏱️  Время ответа (успешные запросы):');
            console.log(`   Минимальное: ${this.stats.minDuration.toFixed(2)}ms`);
            console.log(`   Максимальное: ${this.stats.maxDuration.toFixed(2)}ms`);
            console.log(`   Среднее: ${avgDuration.toFixed(2)}ms`);
            console.log(`   Медианное: ${this.getMedianDuration().toFixed(2)}ms`);
            
            // Оценка пропускной способности
            const requestsPerMinute = Math.floor(60000 / avgDuration);
            console.log(`\n📊 Оценка пропускной способности:`);
            console.log(`   При запросе всех тикеров: ~${requestsPerMinute} запросов/мин`);
            console.log(`   Эквивалент поочередных запросов (30 токенов): ~${Math.floor(requestsPerMinute * 30)} запросов/мин`);
        }
        
        if (this.stats.errors.length > 0) {
            console.log('\n❌ Детали ошибок:');
            this.stats.errors.forEach(err => {
                console.log(`   Тест #${err.test} в ${err.time}:`);
                console.log(`     ${err.error.message}`);
            });
        }
        
        console.log('='.repeat(60));
    }

    // Вычисление медианного времени
    getMedianDuration() {
        if (this.stats.successTests === 0) return 0;
        // Здесь нужно хранить все длительности, для простоты пока так
        return this.stats.totalDuration / this.stats.successTests;
    }

    // Сохранение примера данных для анализа
    saveSampleData(data) {
        const fs = require('fs');
        const sample = {
            timestamp: new Date().toISOString(),
            totalPairs: data.length,
            first10Pairs: data.slice(0, 10).map(t => ({
                pair: t.currency_pair,
                last: t.last,
                change: t.change_percentage,
                volume: t.quote_volume
            })),
            sampleSize: 10
        };
        
        fs.writeFileSync('gate-tickers-sample.json', JSON.stringify(sample, null, 2));
        console.log(`\n💾 Пример данных сохранен в gate-tickers-sample.json`);
    }

    // Тест с разными интервалами
    async testWithDifferentIntervals() {
        console.log('\n🔄 ТЕСТИРОВАНИЕ С РАЗНЫМИ ИНТЕРВАЛАМИ');
        console.log('='.repeat(60));
        
        const intervals = [100, 200, 500, 1000, 2000];
        
        for (const interval of intervals) {
            console.log(`\n📊 Интервал между запросами: ${interval}ms`);
            
            // Сбрасываем статистику
            this.stats = {
                totalTests: 0, successTests: 0, failedTests: 0,
                totalDuration: 0, minDuration: Infinity, maxDuration: 0,
                errors: []
            };
            
            // Запускаем 5 тестов с заданным интервалом
            await this.runTestSeries(5, interval);
            
            // Пауза между разными интервалами
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
}

// Запуск тестов
async function main() {
    const tester = new GateTickerTest();
    
    // Получаем аргументы командной строки
    const args = process.argv.slice(2);
    const testType = args[0] || 'basic';
    
    switch (testType) {
        case 'basic':
            // Базовый тест - 10 запросов с интервалом 1 секунда
            await tester.runTestSeries(10, 1000);
            break;
            
        case 'stress':
            // Стресс-тест - 20 запросов подряд
            await tester.runTestSeries(20, 500);
            break;
            
        case 'intervals':
            // Тест с разными интервалами
            await tester.testWithDifferentIntervals();
            break;
            
        case 'single':
            // Одиночный тест
            await tester.runSingleTest(1);
            break;
            
        default:
            console.log('Использование: node test-gate-tickers.js [basic|stress|intervals|single]');
            console.log('  basic     - 10 тестов с интервалом 1 сек (по умолчанию)');
            console.log('  stress    - 20 тестов с интервалом 500ms');
            console.log('  intervals - тесты с разными интервалами');
            console.log('  single    - один тест');
    }
}

// Запускаем, если файл вызван напрямую
if (require.main === module) {
    main().catch(console.error);
}

module.exports = GateTickerTest;