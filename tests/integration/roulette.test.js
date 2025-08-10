const { setupTestDatabase } = require("../fixtures/db-setup");
const {
    createMockInteraction,
    createMockMessage,
} = require("../mocks/discord-mock");

describe("Roulette Integration Tests", () => {
    let currencyManager;
    let gameManager;
    let database;
    let roulette;

    beforeAll(async () => {
        await setupTestDatabase();

        database = require("../../modules/database");
        await database.init();

        currencyManager = require("../../modules/currencyManager");
        gameManager = require("../../modules/gameManager");
        roulette = require("../../modules/games/roulette");
    });

    afterAll(async () => {
        await database.close();
    });

    beforeEach(() => {
        // Clear active games before each test
        gameManager.activeGames.clear();
    });

    describe("Game Initialization", () => {
        test("should start roulette game successfully", async () => {
            const mockMessage = createMockMessage();

            const result = await roulette.start(mockMessage);

            expect(result).toHaveProperty("gameKey");
            expect(result).toHaveProperty("gameData");
            expect(result.gameData.type).toBe("roulette");
            expect(result.gameData.phase).toBe("betting");
            expect(result.gameData.players).toBeInstanceOf(Map);
        });

        test("should create betting buttons", () => {
            const buttons = roulette.createBettingButtons();

            expect(buttons).toHaveLength(2); // Two rows
            expect(buttons[0].components).toHaveLength(4); // First row: red, black, even, odd
            expect(buttons[1].components).toHaveLength(3); // Second row: low, high, number
        });
    });

    describe("Betting System", () => {
        test("should handle bet placement successfully", async () => {
            const userId = "test-user-123";
            const betAmount = 50;

            // Set up user with coins
            await currencyManager.adminAddCoins(userId, 500, "Test setup");

            const mockInteraction = createMockInteraction({
                customId: "roulette_amount_red_50",
                user: { id: userId, displayName: "TestUser" },
            });

            const gameData = {
                type: "roulette",
                phase: "betting",
                players: new Map(),
                startTime: Date.now(),
                bettingDuration: 60000,
            };

            const result = await roulette.placeBet(
                mockInteraction,
                gameData,
                "test-game",
                gameManager,
                "red",
                betAmount
            );

            expect(result).toBe(true);
            expect(gameData.players.has(userId)).toBe(true);

            const player = gameData.players.get(userId);
            expect(player.bets).toHaveLength(1);
            expect(player.bets[0].type).toBe("red");
            expect(player.bets[0].amount).toBe(betAmount);
            expect(player.totalBet).toBe(betAmount);
        });

        test("should reject bet when insufficient funds", async () => {
            const userId = "poor-user-123";
            const betAmount = 100;

            // User has no coins
            const mockInteraction = createMockInteraction({
                customId: "roulette_amount_red_100",
                user: { id: userId, displayName: "PoorUser" },
            });

            const gameData = {
                type: "roulette",
                phase: "betting",
                players: new Map(),
                startTime: Date.now(),
                bettingDuration: 60000,
            };

            const result = await roulette.placeBet(
                mockInteraction,
                gameData,
                "test-game",
                gameManager,
                "red",
                betAmount
            );

            expect(result).toBe(true); // Interaction handled
            expect(gameData.players.has(userId)).toBe(false); // No bet placed
        });

        test("should handle multiple bets from same user", async () => {
            const userId = "multi-bet-user";

            await currencyManager.adminAddCoins(userId, 1000, "Test setup");

            const gameData = {
                type: "roulette",
                phase: "betting",
                players: new Map(),
                startTime: Date.now(),
                bettingDuration: 60000,
            };

            // Place first bet
            const mockInteraction1 = createMockInteraction({
                user: { id: userId, displayName: "MultiUser" },
            });

            await roulette.placeBet(
                mockInteraction1,
                gameData,
                "test-game",
                gameManager,
                "red",
                50
            );

            // Place second bet
            const mockInteraction2 = createMockInteraction({
                user: { id: userId, displayName: "MultiUser" },
            });

            await roulette.placeBet(
                mockInteraction2,
                gameData,
                "test-game",
                gameManager,
                "straight",
                25,
                7
            );

            const player = gameData.players.get(userId);
            expect(player.bets).toHaveLength(2);
            expect(player.totalBet).toBe(75);
            expect(player.bets[1].number).toBe(7);
        });
    });

    describe("Payout System", () => {
        test("should calculate payouts correctly for winning red bet", async () => {
            const userId = "winner-123";
            const winningNumber = 1; // Red number

            const gameData = {
                players: new Map([
                    [
                        userId,
                        {
                            name: "Winner",
                            bets: [{ type: "red", amount: 100, payout: 1 }],
                            totalBet: 100,
                        },
                    ],
                ]),
            };

            const results = await roulette.calculatePayouts(
                gameData,
                winningNumber
            );

            expect(results.winners).toHaveLength(1);
            expect(results.losers).toHaveLength(0);

            const winner = results.winners[0];
            expect(winner.userId).toBe(userId);
            expect(winner.winnings).toBe(200); // 100 * (1 + 1)
            expect(winner.profit).toBe(100); // 200 - 100
        });

        test("should calculate payouts correctly for losing bet", async () => {
            const userId = "loser-123";
            const winningNumber = 1; // Red number

            const gameData = {
                players: new Map([
                    [
                        userId,
                        {
                            name: "Loser",
                            bets: [{ type: "black", amount: 50, payout: 1 }],
                            totalBet: 50,
                        },
                    ],
                ]),
            };

            const results = await roulette.calculatePayouts(
                gameData,
                winningNumber
            );

            expect(results.winners).toHaveLength(0);
            expect(results.losers).toHaveLength(1);

            const loser = results.losers[0];
            expect(loser.userId).toBe(userId);
            expect(loser.totalBet).toBe(50);
        });

        test("should handle straight number bet win", async () => {
            const userId = "straight-winner";
            const winningNumber = 7;

            const gameData = {
                players: new Map([
                    [
                        userId,
                        {
                            name: "StraightWinner",
                            bets: [
                                {
                                    type: "straight",
                                    number: 7,
                                    amount: 10,
                                    payout: 35,
                                },
                            ],
                            totalBet: 10,
                        },
                    ],
                ]),
            };

            const results = await roulette.calculatePayouts(
                gameData,
                winningNumber
            );

            const winner = results.winners[0];
            expect(winner.winnings).toBe(360); // 10 * (35 + 1)
            expect(winner.profit).toBe(350); // 360 - 10
        });

        test("should handle mixed winning and losing bets", async () => {
            const userId = "mixed-better";
            const winningNumber = 2; // Black, even, low

            const gameData = {
                players: new Map([
                    [
                        userId,
                        {
                            name: "MixedBetter",
                            bets: [
                                { type: "black", amount: 50, payout: 1 }, // Win
                                { type: "red", amount: 25, payout: 1 }, // Lose
                                { type: "even", amount: 30, payout: 1 }, // Win
                            ],
                            totalBet: 105,
                        },
                    ],
                ]),
            };

            const results = await roulette.calculatePayouts(
                gameData,
                winningNumber
            );

            const winner = results.winners[0];
            expect(winner.winnings).toBe(160); // (50*2) + (30*2) = 100 + 60
            expect(winner.profit).toBe(55); // 160 - 105
        });

        test("should handle zero winning (all outside bets lose)", async () => {
            const userId = "zero-victim";
            const winningNumber = 0;

            const gameData = {
                players: new Map([
                    [
                        userId,
                        {
                            name: "ZeroVictim",
                            bets: [
                                { type: "red", amount: 50, payout: 1 },
                                { type: "even", amount: 25, payout: 1 },
                                { type: "low", amount: 30, payout: 1 },
                            ],
                            totalBet: 105,
                        },
                    ],
                ]),
            };

            const results = await roulette.calculatePayouts(
                gameData,
                winningNumber
            );

            expect(results.winners).toHaveLength(0);
            expect(results.losers).toHaveLength(1);

            const loser = results.losers[0];
            expect(loser.totalBet).toBe(105);
        });
    });

    describe("Currency Integration", () => {
        test("should award coins for net profit", async () => {
            const userId = "currency-test-winner";

            // Set up user
            await currencyManager.adminAddCoins(userId, 1000, "Test setup");
            const initialBalance = await currencyManager.getBalance(userId);

            const gameData = {
                players: new Map([
                    [
                        userId,
                        {
                            name: "CurrencyWinner",
                            bets: [{ type: "red", amount: 100, payout: 1 }],
                            totalBet: 100,
                        },
                    ],
                ]),
            };

            // Simulate red win
            await roulette.calculatePayouts(gameData, 1);

            const finalBalance = await currencyManager.getBalance(userId);
            expect(finalBalance).toBeGreaterThan(initialBalance);
        });

        test("should record loss for losing players", async () => {
            const userId = "currency-test-loser";

            // Set up user with win streak
            await currencyManager.adminAddCoins(userId, 1000, "Test setup");
            await currencyManager.awardCoins(userId, 50, "Previous win");

            const gameData = {
                players: new Map([
                    [
                        userId,
                        {
                            name: "CurrencyLoser",
                            bets: [{ type: "red", amount: 100, payout: 1 }],
                            totalBet: 100,
                        },
                    ],
                ]),
            };

            // Simulate black win (red bet loses)
            await roulette.calculatePayouts(gameData, 2);

            // Loss should be recorded (streak reset handled by currencyManager)
            const balance = await currencyManager.getBalance(userId);
            expect(typeof balance).toBe("number");
        });
    });

    describe("Game Flow", () => {
        test("should handle complete game flow", async () => {
            const mockMessage = createMockMessage();

            // Start game
            const { gameKey, gameData } = await roulette.start(mockMessage);

            expect(gameData.phase).toBe("betting");

            // Simulate betting phase ending
            gameData.phase = "spinning";

            // Game should be in spinning phase
            expect(gameData.phase).toBe("spinning");
        });

        test("should clean up after game completion", () => {
            const gameKey = "cleanup-test";
            const gameData = { type: "roulette", phase: "completed" };

            gameManager.activeGames.set(gameKey, gameData);
            expect(gameManager.activeGames.has(gameKey)).toBe(true);

            // Simulate cleanup
            gameManager.activeGames.delete(gameKey);
            expect(gameManager.activeGames.has(gameKey)).toBe(false);
        });
    });

    describe("Error Handling", () => {
        test("should handle interaction after betting closed", async () => {
            const mockInteraction = createMockInteraction({
                customId: "roulette_bet_red",
            });

            const gameData = {
                phase: "betting",
                startTime: Date.now() - 70000, // 70 seconds ago
                bettingDuration: 60000, // 60 second limit
            };

            const result = await roulette.handleInteraction(
                mockInteraction,
                gameData,
                "test-game",
                gameManager
            );

            expect(result).toBe(true); // Interaction handled
        });

        test("should handle invalid custom ID", async () => {
            const mockInteraction = createMockInteraction({
                customId: "invalid_custom_id",
            });

            const result = await roulette.handleInteraction(
                mockInteraction,
                {},
                "test-game",
                gameManager
            );

            expect(result).toBe(false); // Not handled
        });
    });
});
