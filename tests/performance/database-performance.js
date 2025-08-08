class DatabasePerformance {
  constructor() {
    this.database = require('../../modules/database');
  }

  async run() {
    const results = {
      queryPerformance: await this.testQueryPerformance(),
      concurrentQueries: await this.testConcurrentQueries(),
      largeDatasets: await this.testLargeDatasets(),
      connectionPool: await this.testConnectionPool()
    };

    results.averageResponseTime = this.calculateAverageResponseTime(results);
    return results;
  }

  async testQueryPerformance() {
    console.log('  Testing basic query performance...');
    const iterations = 100;
    const times = [];

    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      await this.database.query('SELECT 1 as test');
      times.push(Date.now() - start);
    }

    return {
      iterations,
      averageTime: times.reduce((a, b) => a + b, 0) / times.length,
      minTime: Math.min(...times),
      maxTime: Math.max(...times)
    };
  }

  async testConcurrentQueries() {
    console.log('  Testing concurrent query handling...');
    const concurrency = 50;
    const start = Date.now();

    const promises = Array(concurrency).fill().map(async (_, i) => {
      const userId = `perf_test_${i}`;
      return this.database.query(
        'SELECT balance FROM user_currency WHERE user_id = ?',
        [userId]
      );
    });

    await Promise.all(promises);
    const totalTime = Date.now() - start;

    return {
      concurrency,
      totalTime,
      queriesPerSecond: (concurrency / totalTime) * 1000
    };
  }

  async testLargeDatasets() {
    console.log('  Testing large dataset queries...');
    
    // Create test data
    const testUsers = 1000;
    const insertPromises = [];
    
    for (let i = 0; i < testUsers; i++) {
      insertPromises.push(
        this.database.query(
          'INSERT IGNORE INTO user_currency (user_id, balance) VALUES (?, ?)',
          [`perf_user_${i}`, Math.floor(Math.random() * 10000)]
        )
      );
    }
    
    await Promise.all(insertPromises);

    // Test leaderboard query performance
    const start = Date.now();
    await this.database.query(
      'SELECT user_id, balance FROM user_currency ORDER BY balance DESC LIMIT 100'
    );
    const leaderboardTime = Date.now() - start;

    // Test transaction history query
    const historyStart = Date.now();
    await this.database.query(
      'SELECT * FROM coin_transactions ORDER BY created_at DESC LIMIT 100'
    );
    const historyTime = Date.now() - historyStart;

    return {
      testDataSize: testUsers,
      leaderboardQueryTime: leaderboardTime,
      historyQueryTime: historyTime
    };
  }

  async testConnectionPool() {
    console.log('  Testing connection pool efficiency...');
    const poolSize = 20;
    const start = Date.now();

    const promises = Array(poolSize).fill().map(async () => {
      // Simulate holding connection for work
      const result = await this.database.query('SELECT SLEEP(0.1)');
      return result;
    });

    await Promise.all(promises);
    const totalTime = Date.now() - start;

    return {
      poolSize,
      totalTime,
      efficiency: poolSize / (totalTime / 1000) // connections per second
    };
  }

  calculateAverageResponseTime(results) {
    const times = [
      results.queryPerformance.averageTime,
      results.largeDatasets.leaderboardQueryTime,
      results.largeDatasets.historyQueryTime
    ];
    
    return times.reduce((a, b) => a + b, 0) / times.length;
  }
}

module.exports = DatabasePerformance;