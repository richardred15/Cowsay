class GamePerformance {
  constructor() {
    this.gameManager = require('../../modules/gameManager');
    this.currencyManager = require('../../modules/currencyManager');
  }

  async run() {
    const results = {
      gameStateManagement: await this.testGameStateManagement(),
      concurrentGames: await this.testConcurrentGames(),
      memoryUsage: await this.testMemoryUsage(),
      rewardProcessing: await this.testRewardProcessing(),
      cleanup: await this.testCleanup()
    };

    results.memoryUsage = this.getMemoryUsage();
    return results;
  }

  async testGameStateManagement() {
    console.log('  Testing game state management...');
    const iterations = 100;
    const times = [];

    // Mock game sessions
    const games = new Map();

    for (let i = 0; i < iterations; i++) {
      const gameId = `game_${i}`;
      const start = Date.now();
      
      // Simulate game creation and state updates
      games.set(gameId, {
        id: gameId,
        players: [`player_${i}_1`, `player_${i}_2`],
        state: 'waiting',
        created: Date.now()
      });
      
      // Simulate state transitions
      games.get(gameId).state = 'active';
      games.get(gameId).state = 'completed';
      
      times.push(Date.now() - start);
    }

    return {
      iterations,
      averageTime: times.reduce((a, b) => a + b, 0) / times.length,
      gamesCreated: games.size
    };
  }

  async testConcurrentGames() {
    console.log('  Testing concurrent game handling...');
    const concurrency = 25;
    const start = Date.now();

    const promises = Array(concurrency).fill().map(async (_, i) => {
      const gameId = `concurrent_game_${i}`;
      
      // Simulate game lifecycle
      const gameData = {
        id: gameId,
        players: [`player_${i}_1`, `player_${i}_2`],
        state: 'active',
        moves: []
      };
      
      // Simulate game moves
      for (let move = 0; move < 10; move++) {
        gameData.moves.push({
          player: `player_${i}_${move % 2 + 1}`,
          action: `move_${move}`,
          timestamp: Date.now()
        });
        
        // Small delay to simulate processing
        await new Promise(resolve => setTimeout(resolve, 1));
      }
      
      return gameData;
    });

    const results = await Promise.all(promises);
    const totalTime = Date.now() - start;

    return {
      concurrency,
      totalTime,
      gamesPerSecond: (concurrency / totalTime) * 1000,
      totalMoves: results.reduce((sum, game) => sum + game.moves.length, 0)
    };
  }

  async testMemoryUsage() {
    console.log('  Testing memory usage under load...');
    const initialMemory = process.memoryUsage();
    
    // Create many game objects to test memory handling
    const games = [];
    const gameCount = 1000;
    
    for (let i = 0; i < gameCount; i++) {
      games.push({
        id: `memory_test_${i}`,
        players: [`player_${i}_1`, `player_${i}_2`],
        state: 'active',
        board: Array(64).fill(null), // Simulate game board
        history: Array(50).fill({ move: 'test', timestamp: Date.now() })
      });
    }
    
    const peakMemory = process.memoryUsage();
    
    // Cleanup
    games.length = 0;
    
    if (global.gc) {
      global.gc();
    }
    
    const finalMemory = process.memoryUsage();
    
    return {
      gameCount,
      initialMemoryMB: Math.round(initialMemory.heapUsed / 1024 / 1024),
      peakMemoryMB: Math.round(peakMemory.heapUsed / 1024 / 1024),
      finalMemoryMB: Math.round(finalMemory.heapUsed / 1024 / 1024),
      memoryIncreaseMB: Math.round((peakMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024)
    };
  }

  async testRewardProcessing() {
    console.log('  Testing game reward processing...');
    const iterations = 50;
    const times = [];

    for (let i = 0; i < iterations; i++) {
      const userId = `reward_test_${i}`;
      const start = Date.now();
      
      // Simulate game completion with rewards
      await this.currencyManager.awardCoins(userId, 50, 'Game win');
      
      // Simulate streak calculation
      const balance = await this.currencyManager.getBalance(userId);
      
      times.push(Date.now() - start);
    }

    return {
      iterations,
      averageTime: times.reduce((a, b) => a + b, 0) / times.length,
      totalRewardsProcessed: iterations
    };
  }

  async testCleanup() {
    console.log('  Testing cleanup efficiency...');
    const gameCount = 100;
    const games = new Map();
    
    // Create games
    const createStart = Date.now();
    for (let i = 0; i < gameCount; i++) {
      games.set(`cleanup_test_${i}`, {
        id: `cleanup_test_${i}`,
        players: [`player_${i}`],
        created: Date.now()
      });
    }
    const createTime = Date.now() - createStart;
    
    // Cleanup games
    const cleanupStart = Date.now();
    games.clear();
    const cleanupTime = Date.now() - cleanupStart;
    
    return {
      gameCount,
      createTime,
      cleanupTime,
      cleanupEfficiency: gameCount / cleanupTime // games cleaned per ms
    };
  }

  getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024),
      externalMB: Math.round(usage.external / 1024 / 1024),
      rssMB: Math.round(usage.rss / 1024 / 1024)
    };
  }
}

module.exports = GamePerformance;