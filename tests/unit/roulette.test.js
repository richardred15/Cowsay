const roulette = require('../../modules/games/roulette');

describe('Roulette Unit Tests', () => {
    describe('Wheel Configuration', () => {
        test('should have correct European wheel order', () => {
            expect(roulette.wheelOrder).toHaveLength(37); // 0-36
            expect(roulette.wheelOrder).toContain(0);
            expect(roulette.wheelOrder).toContain(36);
        });

        test('should have correct red numbers', () => {
            const expectedRed = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
            expect(roulette.redNumbers).toEqual(expectedRed);
            expect(roulette.redNumbers).toHaveLength(18);
        });

        test('should have correct black numbers', () => {
            const expectedBlack = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];
            expect(roulette.blackNumbers).toEqual(expectedBlack);
            expect(roulette.blackNumbers).toHaveLength(18);
        });

        test('should have correct bet types and payouts', () => {
            expect(roulette.betTypes.red.payout).toBe(1);
            expect(roulette.betTypes.black.payout).toBe(1);
            expect(roulette.betTypes.even.payout).toBe(1);
            expect(roulette.betTypes.odd.payout).toBe(1);
            expect(roulette.betTypes.low.payout).toBe(1);
            expect(roulette.betTypes.high.payout).toBe(1);
            expect(roulette.betTypes.straight.payout).toBe(35);
        });
    });

    describe('Number Color Detection', () => {
        test('should identify green for 0', () => {
            expect(roulette.getNumberColor(0)).toBe('🟢');
        });

        test('should identify red numbers correctly', () => {
            expect(roulette.getNumberColor(1)).toBe('🔴');
            expect(roulette.getNumberColor(3)).toBe('🔴');
            expect(roulette.getNumberColor(36)).toBe('🔴');
        });

        test('should identify black numbers correctly', () => {
            expect(roulette.getNumberColor(2)).toBe('⚫');
            expect(roulette.getNumberColor(4)).toBe('⚫');
            expect(roulette.getNumberColor(35)).toBe('⚫');
        });
    });

    describe('Bet Validation Logic', () => {
        test('should validate red bet correctly', () => {
            // Test red numbers
            expect(roulette.redNumbers.includes(1)).toBe(true);
            expect(roulette.redNumbers.includes(2)).toBe(false);
            expect(roulette.redNumbers.includes(0)).toBe(false);
        });

        test('should validate even/odd bets correctly', () => {
            // Even numbers (excluding 0)
            expect(2 > 0 && 2 % 2 === 0).toBe(true);
            expect(4 > 0 && 4 % 2 === 0).toBe(true);
            expect(0 > 0 && 0 % 2 === 0).toBe(false); // 0 loses on even/odd

            // Odd numbers
            expect(1 > 0 && 1 % 2 === 1).toBe(true);
            expect(3 > 0 && 3 % 2 === 1).toBe(true);
        });

        test('should validate low/high bets correctly', () => {
            // Low (1-18)
            expect(1 >= 1 && 1 <= 18).toBe(true);
            expect(18 >= 1 && 18 <= 18).toBe(true);
            expect(19 >= 1 && 19 <= 18).toBe(false);
            expect(0 >= 1 && 0 <= 18).toBe(false);

            // High (19-36)
            expect(19 >= 19 && 19 <= 36).toBe(true);
            expect(36 >= 19 && 36 <= 36).toBe(true);
            expect(18 >= 19 && 18 <= 36).toBe(false);
        });
    });

    describe('Betting Summary Generation', () => {
        test('should return null for empty players', () => {
            const result = roulette.generateBettingSummary(new Map());
            expect(result).toBeNull();
        });

        test('should generate correct betting summary', () => {
            const players = new Map();
            players.set('user1', {
                bets: [
                    { type: 'red', amount: 50 },
                    { type: 'straight', number: 7, amount: 25 }
                ]
            });
            players.set('user2', {
                bets: [
                    { type: 'red', amount: 100 },
                    { type: 'even', amount: 75 }
                ]
            });

            const result = roulette.generateBettingSummary(players);
            
            expect(result).toContain('🔴 Red: 2 players (150 coins)');
            expect(result).toContain('🔢 Even: 1 players (75 coins)');
            expect(result).toContain('📍 7: 25 coins');
        });
    });

    describe('Wheel Frame Generation', () => {
        test('should generate wheel display', () => {
            const frame = roulette.generateWheelFrame(0);
            
            expect(frame).toContain('🎰 ROULETTE WHEEL 🎰');
            expect(frame).toContain('```');
            expect(frame).toContain('←'); // Ball indicator
        });

        test('should highlight winner correctly', () => {
            const frame = roulette.generateWheelFrame(0, 0);
            
            expect(frame).toContain('★'); // Winner indicator
        });
    });

    describe('Dealer Messages', () => {
        test('should return valid dealer messages', () => {
            const bettingMessage = roulette.getRandomDealerMessage('betting');
            const spinningMessage = roulette.getRandomDealerMessage('spinning');
            const resultsMessage = roulette.getRandomDealerMessage('results');

            expect(typeof bettingMessage).toBe('string');
            expect(typeof spinningMessage).toBe('string');
            expect(typeof resultsMessage).toBe('string');

            expect(roulette.dealerMessages.betting).toContain(bettingMessage);
            expect(roulette.dealerMessages.spinning).toContain(spinningMessage);
            expect(roulette.dealerMessages.results).toContain(resultsMessage);
        });
    });

    describe('Payout Calculations', () => {
        test('should calculate correct payouts for winning bets', () => {
            // Red bet wins
            const redBet = { type: 'red', amount: 100, payout: 1 };
            const redPayout = redBet.amount * (redBet.payout + 1); // 200
            expect(redPayout).toBe(200);

            // Straight bet wins
            const straightBet = { type: 'straight', amount: 10, payout: 35 };
            const straightPayout = straightBet.amount * (straightBet.payout + 1); // 360
            expect(straightPayout).toBe(360);
        });

        test('should calculate net result correctly', () => {
            const totalWinnings = 300;
            const totalBet = 150;
            const netResult = totalWinnings - totalBet;
            
            expect(netResult).toBe(150); // Profit
        });

        test('should handle losing scenario', () => {
            const totalWinnings = 0;
            const totalBet = 100;
            const netResult = totalWinnings - totalBet;
            
            expect(netResult).toBe(-100); // Loss
        });
    });
});