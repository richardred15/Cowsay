class CurrencyPerformance {
  constructor() {
    this.currencyManager = require('../../modules/currencyManager');
  }

  async run() {
    const results = {
      balanceQueries: await this.testBalanceQueries(),
      coinAwards: await this.testCoinAwards(),
      dailyBonuses: await this.testDailyBonuses(),
      transactionLogging: await this.testTransactionLogging(),
      concurrentOperations: await this.testConcurrentOperations()
    };

    results.throughput = this.calculateThroughput(results);
    return results;
  }

  async testBalanceQueries() {
    console.log('  Testing balance query performance...');
    const iterations = 200;
    const times = [];

    for (let i = 0; i < iterations; i++) {
      const userId = `balance_test_${i % 50}`; // Reuse some users
      const start = Date.now();
      await this.currencyManager.getBalance(userId);
      times.push(Date.now() - start);
    }

    return {
      iterations,
      averageTime: times.reduce((a, b) => a + b, 0) / times.length,
      minTime: Math.min(...times),
      maxTime: Math.max(...times)
    };
  }

  async testCoinAwards() {
    console.log('  Testing coin award performance...');
    const iterations = 100;
    const times = [];

    for (let i = 0; i < iterations; i++) {
      const userId = `award_test_${i}`;
      const start = Date.now();
      await this.currencyManager.awardCoins(userId, 50, 'Performance test');
      times.push(Date.now() - start);
    }

    return {
      iterations,
      averageTime: times.reduce((a, b) => a + b, 0) / times.length,
      totalCoinsAwarded: iterations * 50
    };
  }

  async testDailyBonuses() {
    console.log('  Testing daily bonus performance...');
    const iterations = 50;
    const times = [];

    for (let i = 0; i < iterations; i++) {
      const userId = `daily_test_${i}`;
      // Set balance low to qualify for bonus
      await this.currencyManager.adminAddCoins(userId, -500, 'Setup for daily test');
      
      const start = Date.now();
      await this.currencyManager.getDailyBonus(userId);
      times.push(Date.now() - start);
    }

    return {
      iterations,
      averageTime: times.reduce((a, b) => a + b, 0) / times.length
    };
  }

  async testTransactionLogging() {
    console.log('  Testing transaction logging performance...');
    const iterations = 100;
    const start = Date.now();

    const promises = Array(iterations).fill().map(async (_, i) => {
      const userId = `transaction_test_${i}`;
      return this.currencyManager.awardCoins(userId, 25, 'Logging test');
    });

    await Promise.all(promises);
    const totalTime = Date.now() - start;

    return {
      iterations,
      totalTime,
      transactionsPerSecond: (iterations / totalTime) * 1000
    };
  }

  async testConcurrentOperations() {
    console.log('  Testing concurrent currency operations...');
    const concurrency = 30;
    const start = Date.now();

    const promises = Array(concurrency).fill().map(async (_, i) => {
      const userId = `concurrent_test_${i}`;
      
      // Mix of operations
      await this.currencyManager.awardCoins(userId, 100, 'Concurrent test');
      await this.currencyManager.getBalance(userId);
      await this.currencyManager.spendCoins(userId, 50, 'Concurrent spend');
      return this.currencyManager.getTransactionHistory(userId, 5);
    });

    await Promise.all(promises);
    const totalTime = Date.now() - start;

    return {
      concurrency,
      operationsPerUser: 4,
      totalOperations: concurrency * 4,
      totalTime,
      operationsPerSecond: (concurrency * 4 / totalTime) * 1000
    };
  }

  calculateThroughput(results) {
    // Calculate overall operations per second
    const totalOps = 
      results.balanceQueries.iterations +
      results.coinAwards.iterations +
      results.dailyBonuses.iterations +
      results.transactionLogging.iterations +
      results.concurrentOperations.totalOperations;

    const totalTime = 
      (results.balanceQueries.averageTime * results.balanceQueries.iterations) +
      (results.coinAwards.averageTime * results.coinAwards.iterations) +
      (results.dailyBonuses.averageTime * results.dailyBonuses.iterations) +
      results.transactionLogging.totalTime +
      results.concurrentOperations.totalTime;

    return Math.round((totalOps / totalTime) * 1000);
  }
}

module.exports = CurrencyPerformance;