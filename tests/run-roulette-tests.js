#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

console.log('🎰 Running Roulette Test Suite...\n');

async function runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: 'inherit',
            shell: true,
            ...options
        });

        child.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Command failed with exit code ${code}`));
            }
        });

        child.on('error', reject);
    });
}

async function runTests() {
    try {
        console.log('📋 1. Running Unit Tests...');
        await runCommand('npx', ['jest', 'unit/roulette.test.js', '--verbose'], {
            cwd: __dirname
        });
        console.log('✅ Unit tests passed!\n');

        console.log('🔗 2. Running Integration Tests...');
        await runCommand('npx', ['jest', 'integration/roulette.test.js', '--verbose'], {
            cwd: __dirname
        });
        console.log('✅ Integration tests passed!\n');

        console.log('⚡ 3. Running Performance Tests...');
        const RoulettePerformance = require('./performance/roulette-performance');
        const perfTests = new RoulettePerformance();
        await perfTests.runTests();
        console.log('✅ Performance tests completed!\n');

        console.log('🎊 All Roulette Tests Passed! 🎊');
        console.log('=====================================');
        console.log('✅ Unit Tests: PASSED');
        console.log('✅ Integration Tests: PASSED');
        console.log('✅ Performance Tests: PASSED');
        console.log('\n🎰 Roulette game is ready for production!');

    } catch (error) {
        console.error('❌ Test suite failed:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    runTests();
}

module.exports = { runTests };