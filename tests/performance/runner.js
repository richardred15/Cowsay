const fs = require('fs').promises;
const path = require('path');
const { setupTestDatabase } = require('../fixtures/db-setup');

class PerformanceRunner {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        memory: process.memoryUsage()
      },
      tests: {}
    };
  }

  async run() {
    console.log('🚀 Starting Performance Tests...');
    
    try {
      // Setup test environment
      await this.setupEnvironment();
      
      // Run performance test suites
      await this.runDatabasePerformance();
      await this.runCurrencyPerformance();
      await this.runGamePerformance();
      
      // Generate report
      await this.generateReport();
      
      console.log('✅ Performance tests completed successfully');
      process.exit(0);
    } catch (error) {
      console.error('❌ Performance tests failed:', error.message);
      process.exit(1);
    }
  }

  async setupEnvironment() {
    console.log('Setting up test environment...');
    
    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
    process.env.DB_PORT = process.env.DB_PORT || '3306';
    process.env.DB_USER = process.env.DB_USER || 'root';
    process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'test_password';
    process.env.DB_NAME = process.env.DB_NAME || 'cowsay_test';
    
    // Initialize database
    await setupTestDatabase();
    const database = require('../../modules/database');
    await database.init();
    
    console.log('Environment setup complete');
  }

  async runDatabasePerformance() {
    console.log('Running database performance tests...');
    const DatabasePerformance = require('./database-performance');
    const dbTests = new DatabasePerformance();
    this.results.tests.database = await dbTests.run();
  }

  async runCurrencyPerformance() {
    console.log('Running currency performance tests...');
    const CurrencyPerformance = require('./currency-performance');
    const currencyTests = new CurrencyPerformance();
    this.results.tests.currency = await currencyTests.run();
  }

  async runGamePerformance() {
    console.log('Running game performance tests...');
    const GamePerformance = require('./game-performance');
    const gameTests = new GamePerformance();
    this.results.tests.games = await gameTests.run();
  }

  async generateReport() {
    const reportsDir = path.join(__dirname, 'reports');
    const reportPath = path.join(reportsDir, 'performance.json');
    
    // Ensure reports directory exists
    try {
      await fs.mkdir(reportsDir, { recursive: true });
    } catch (error) {
      // Directory might already exist, ignore error
    }
    
    await fs.writeFile(reportPath, JSON.stringify(this.results, null, 2));
    
    console.log('\n📊 Performance Summary:');
    console.log(`Database avg response: ${this.results.tests.database?.averageResponseTime || 'N/A'}ms`);
    console.log(`Currency throughput: ${this.results.tests.currency?.throughput || 'N/A'} ops/sec`);
    console.log(`Game memory usage: ${this.results.tests.games?.memoryUsage?.heapUsedMB || 'N/A'}MB`);
    console.log(`Report saved to: ${reportPath}`);
  }
}

// Run if called directly
if (require.main === module) {
  const runner = new PerformanceRunner();
  runner.run();
}

module.exports = PerformanceRunner;