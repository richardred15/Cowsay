const { performance } = require('perf_hooks');
const fs = require('fs').promises;
const path = require('path');

class RoulettePerformanceTest {
    constructor() {
        this.results = {
            testName: 'Roulette Performance Tests',
            timestamp: new Date().toISOString(),
            tests: []
        };
    }

    async runTests() {
        console.log('🎰 Starting Roulette Performance Tests...');
        
        await this.testGameInitialization();
        await this.testBettingPerformance();
        await this.testPayoutCalculations();
        await this.testWheelAnimation();
        await this.testMemoryUsage();
        await this.testConcurrentGames();
        
        await this.saveResults();
        this.printSummary();
    }

    async testGameInitialization() {
        console.log('Testing game initialization performance...');
        
        const iterations = 1000;
        const times = [];
        
        // Mock message for testing
        const mockMessage = {
            reply: async () => ({ id: 'mock-message-id' }),
            channel: { id: 'mock-channel-id' },
            guild: { id: 'mock-guild-id' }
        };
        
        for (let i = 0; i < iterations; i++) {
            const start = performance.now();
            
            // Simulate game initialization
            const gameData = {
                type: 'roulette',
                phase: 'betting',
                channelId: mockMessage.channel.id,
                players: new Map(),
                startTime: Date.now(),
                bettingDuration: 60000,
                serverId: mockMessage.guild?.id,
                messageId: 'mock-message-id'
            };
            
            const gameKey = `roulette_${mockMessage.channel.id}_${Date.now()}`;
            
            const end = performance.now();
            times.push(end - start);
        }
        
        this.results.tests.push({
            name: 'Game Initialization',
            iterations,
            avgTime: this.average(times),
            minTime: Math.min(...times),
            maxTime: Math.max(...times),
            unit: 'ms'
        });
    }

    async testBettingPerformance() {
        console.log('Testing betting system performance...');
        
        const iterations = 5000;
        const times = [];
        
        for (let i = 0; i < iterations; i++) {
            const start = performance.now();
            
            // Simulate bet placement logic
            const gameData = {
                players: new Map()
            };
            
            const userId = `user_${i}`;
            const bet = {
                type: 'red',
                amount: 50,
                payout: 1
            };
            
            if (!gameData.players.has(userId)) {
                gameData.players.set(userId, {
                    name: `User${i}`,
                    bets: [],
                    totalBet: 0
                });
            }
            
            const player = gameData.players.get(userId);
            player.bets.push(bet);
            player.totalBet += bet.amount;
            
            const end = performance.now();
            times.push(end - start);
        }
        
        this.results.tests.push({
            name: 'Bet Placement',
            iterations,
            avgTime: this.average(times),
            minTime: Math.min(...times),
            maxTime: Math.max(...times),
            unit: 'ms'
        });
    }

    async testPayoutCalculations() {
        console.log('Testing payout calculation performance...');
        
        const iterations = 1000;
        const times = [];
        
        // Create test game data with multiple players and bets
        const gameData = {
            players: new Map()
        };
        
        // Add 100 players with various bets
        for (let i = 0; i < 100; i++) {
            const userId = `player_${i}`;
            gameData.players.set(userId, {
                name: `Player${i}`,
                bets: [
                    { type: 'red', amount: 50, payout: 1 },
                    { type: 'even', amount: 25, payout: 1 },
                    { type: 'straight', number: i % 37, amount: 10, payout: 35 }
                ],
                totalBet: 85
            });
        }
        
        for (let i = 0; i < iterations; i++) {
            const start = performance.now();
            
            const winningNumber = i % 37; // Cycle through all numbers
            
            // Simulate payout calculation
            const results = {
                winners: [],
                losers: [],
                totalPayout: 0
            };
            
            for (const [userId, player] of gameData.players) {
                let playerWinnings = 0;
                let winningBets = [];
                let losingBets = [];
                
                for (const bet of player.bets) {
                    let isWin = false;
                    
                    switch (bet.type) {
                        case 'red':
                            const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
                            isWin = redNumbers.includes(winningNumber);
                            break;
                        case 'even':
                            isWin = winningNumber > 0 && winningNumber % 2 === 0;
                            break;
                        case 'straight':
                            isWin = winningNumber === bet.number;
                            break;
                    }
                    
                    if (isWin) {
                        const payout = bet.amount * (bet.payout + 1);
                        playerWinnings += payout;
                        winningBets.push({ ...bet, payout });
                    } else {
                        losingBets.push(bet);
                    }
                }
                
                const netResult = playerWinnings - player.totalBet;
                
                if (netResult > 0) {
                    results.winners.push({
                        userId,
                        name: player.name,
                        winnings: playerWinnings,
                        totalBet: player.totalBet,
                        profit: netResult,
                        winningBets
                    });
                } else {
                    results.losers.push({
                        userId,
                        name: player.name,
                        totalBet: player.totalBet,
                        losingBets
                    });
                }
                
                results.totalPayout += playerWinnings;
            }
            
            const end = performance.now();
            times.push(end - start);
        }
        
        this.results.tests.push({
            name: 'Payout Calculations (100 players)',
            iterations,
            avgTime: this.average(times),
            minTime: Math.min(...times),
            maxTime: Math.max(...times),
            unit: 'ms'
        });
    }

    async testWheelAnimation() {
        console.log('Testing wheel animation frame generation...');
        
        const iterations = 1000;
        const times = [];
        
        const wheelOrder = [
            0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23,
            10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
        ];
        
        for (let i = 0; i < iterations; i++) {
            const start = performance.now();
            
            // Simulate wheel frame generation
            const ballPosition = i % wheelOrder.length;
            const winningNumber = i % 37;
            
            const frame = this.generateMockWheelFrame(ballPosition, winningNumber, wheelOrder);
            
            const end = performance.now();
            times.push(end - start);
        }
        
        this.results.tests.push({
            name: 'Wheel Animation Frame',
            iterations,
            avgTime: this.average(times),
            minTime: Math.min(...times),
            maxTime: Math.max(...times),
            unit: 'ms'
        });
    }

    generateMockWheelFrame(ballPosition, highlightWinner, wheelOrder) {
        const wheelSize = wheelOrder.length;
        const currentIndex = ballPosition % wheelSize;
        
        let display = "```\\n";
        display += " 🎰 ROULETTE WHEEL 🎰\\n";
        display += "┌─────────────────────┐\\n";
        
        for (let i = -2; i <= 2; i++) {
            const index = (currentIndex + i + wheelSize) % wheelSize;
            const number = wheelOrder[index];
            const isBall = i === 0;
            const isWinner = number === highlightWinner;
            
            if (isBall && isWinner) {
                display += `       ${number.toString().padStart(7)} ← ★ \\n`;
            } else if (isBall) {
                display += `       ${number.toString().padStart(7)} ←   \\n`;
            } else if (isWinner) {
                display += `       ${number.toString().padStart(7)} ★  \\n`;
            } else {
                display += `       ${number.toString().padStart(7)}     \\n`;
            }
        }
        
        display += "└─────────────────────┘\\n```";
        return display;
    }

    async testMemoryUsage() {
        console.log('Testing memory usage...');
        
        const initialMemory = process.memoryUsage();
        
        // Create multiple game instances
        const games = [];
        for (let i = 0; i < 100; i++) {
            const gameData = {
                type: 'roulette',
                phase: 'betting',
                players: new Map(),
                startTime: Date.now(),
                bettingDuration: 60000
            };
            
            // Add players with bets
            for (let j = 0; j < 50; j++) {
                gameData.players.set(`user_${i}_${j}`, {
                    name: `User${j}`,
                    bets: [
                        { type: 'red', amount: 50, payout: 1 },
                        { type: 'straight', number: j % 37, amount: 25, payout: 35 }
                    ],
                    totalBet: 75
                });
            }
            
            games.push(gameData);
        }
        
        const peakMemory = process.memoryUsage();
        
        // Clean up
        games.length = 0;
        
        const finalMemory = process.memoryUsage();
        
        this.results.tests.push({
            name: 'Memory Usage (100 games, 50 players each)',
            initialHeapUsed: Math.round(initialMemory.heapUsed / 1024 / 1024),
            peakHeapUsed: Math.round(peakMemory.heapUsed / 1024 / 1024),
            finalHeapUsed: Math.round(finalMemory.heapUsed / 1024 / 1024),
            memoryIncrease: Math.round((peakMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024),
            unit: 'MB'
        });
    }

    async testConcurrentGames() {
        console.log('Testing concurrent game performance...');
        
        const gameCount = 50;
        const playersPerGame = 20;
        const start = performance.now();
        
        // Simulate concurrent games
        const gamePromises = [];
        
        for (let i = 0; i < gameCount; i++) {
            const gamePromise = new Promise((resolve) => {
                const gameData = {
                    type: 'roulette',
                    phase: 'betting',
                    players: new Map(),
                    startTime: Date.now()
                };
                
                // Add players
                for (let j = 0; j < playersPerGame; j++) {
                    gameData.players.set(`game${i}_user${j}`, {
                        name: `User${j}`,
                        bets: [
                            { type: 'red', amount: 50, payout: 1 },
                            { type: 'even', amount: 25, payout: 1 }
                        ],
                        totalBet: 75
                    });
                }
                
                // Simulate payout calculation
                const winningNumber = Math.floor(Math.random() * 37);
                const results = { winners: [], losers: [], totalPayout: 0 };
                
                for (const [userId, player] of gameData.players) {
                    let playerWinnings = 0;
                    
                    for (const bet of player.bets) {
                        let isWin = false;
                        
                        if (bet.type === 'red') {
                            const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
                            isWin = redNumbers.includes(winningNumber);
                        } else if (bet.type === 'even') {
                            isWin = winningNumber > 0 && winningNumber % 2 === 0;
                        }
                        
                        if (isWin) {
                            playerWinnings += bet.amount * (bet.payout + 1);
                        }
                    }
                    
                    const netResult = playerWinnings - player.totalBet;
                    
                    if (netResult > 0) {
                        results.winners.push({ userId, profit: netResult });
                    } else {
                        results.losers.push({ userId, loss: player.totalBet });
                    }
                }
                
                resolve(results);
            });
            
            gamePromises.push(gamePromise);
        }
        
        await Promise.all(gamePromises);
        
        const end = performance.now();
        
        this.results.tests.push({
            name: 'Concurrent Games',
            gameCount,
            playersPerGame,
            totalPlayers: gameCount * playersPerGame,
            totalTime: end - start,
            avgTimePerGame: (end - start) / gameCount,
            unit: 'ms'
        });
    }

    average(arr) {
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    async saveResults() {
        const reportsDir = path.join(__dirname, 'reports');
        const filename = `roulette-performance-${Date.now()}.json`;
        const filepath = path.join(reportsDir, filename);
        
        try {
            await fs.mkdir(reportsDir, { recursive: true });
            await fs.writeFile(filepath, JSON.stringify(this.results, null, 2));
            console.log(`📊 Results saved to: ${filepath}`);
        } catch (error) {
            console.error('Failed to save results:', error);
        }
    }

    printSummary() {
        console.log('\\n🎰 Roulette Performance Test Summary:');
        console.log('=====================================');
        
        this.results.tests.forEach(test => {
            console.log(`\\n${test.name}:`);
            
            if (test.iterations) {
                console.log(`  Iterations: ${test.iterations.toLocaleString()}`);
                console.log(`  Average: ${test.avgTime.toFixed(3)} ${test.unit}`);
                console.log(`  Min: ${test.minTime.toFixed(3)} ${test.unit}`);
                console.log(`  Max: ${test.maxTime.toFixed(3)} ${test.unit}`);
            } else if (test.gameCount) {
                console.log(`  Games: ${test.gameCount}`);
                console.log(`  Players per game: ${test.playersPerGame}`);
                console.log(`  Total players: ${test.totalPlayers.toLocaleString()}`);
                console.log(`  Total time: ${test.totalTime.toFixed(2)} ${test.unit}`);
                console.log(`  Avg per game: ${test.avgTimePerGame.toFixed(2)} ${test.unit}`);
            } else if (test.initialHeapUsed) {
                console.log(`  Initial heap: ${test.initialHeapUsed} ${test.unit}`);
                console.log(`  Peak heap: ${test.peakHeapUsed} ${test.unit}`);
                console.log(`  Final heap: ${test.finalHeapUsed} ${test.unit}`);
                console.log(`  Memory increase: ${test.memoryIncrease} ${test.unit}`);
            }
        });
        
        console.log('\\n✅ Roulette performance tests completed!');
    }
}

module.exports = RoulettePerformanceTest;