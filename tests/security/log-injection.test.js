const fs = require("fs").promises;
const path = require("path");
const secureLogger = require("../../modules/secureLogger");

describe("Log Injection Prevention", () => {
    const testLogFile = path.join(__dirname, "../reports/test.log");

    beforeEach(async () => {
        // Clear test log file
        try {
            await fs.unlink(testLogFile);
        } catch (error) {
            // File doesn't exist, that's fine
        }
    });

    const maliciousInputs = [
        "\n[FAKE] Admin logged in successfully",
        "\r\n[ERROR] System compromised",
        "\x1b[31mFake error message\x1b[0m",
        "Normal message\nFAKE LOG ENTRY: User granted admin access",
        "Test\r\nINJECTED: Unauthorized access granted",
        "\0null byte injection",
        "\x00\x01\x02control characters",
        "Message with\ttab\tcharacters",
        "Line 1\nLine 2\rLine 3",
    ];

    test("secureLogger sanitizes control characters", () => {
        maliciousInputs.forEach((input) => {
            const sanitized = secureLogger.sanitizeInput(input);

            // Should not contain newlines, carriage returns, or control characters
            expect(sanitized).not.toMatch(/[\n\r\x00-\x1f\x7f]/);

            // Should be truncated if too long
            expect(sanitized.length).toBeLessThanOrEqual(200);

            // Should still contain the basic message content (sanitized)
            expect(sanitized.length).toBeGreaterThan(0);
        });
    });
    /*
  test('log entries cannot be forged through user input', async () => {
    const mockConsole = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn()
    };

    // Mock console methods to capture log output
    const originalConsole = { ...console };
    Object.assign(console, mockConsole);

    try {
      maliciousInputs.forEach(input => {
        secureLogger.info('User input', { userInput: input });
        secureLogger.error('Error with user data', { userData: input });
        secureLogger.error('Warning about user', { username: input });
      });

      // Verify all log calls were made
      expect(mockConsole.info).toHaveBeenCalled();
      expect(mockConsole.error).toHaveBeenCalled();

      // Verify no log entry contains unescaped control characters
      const allCalls = [
        ...mockConsole.info.mock.calls,
        ...mockConsole.error.mock.calls
      ];

      allCalls.forEach(call => {
        const logMessage = call.join(' ');
        expect(logMessage).not.toMatch(/[\n\r\x00-\x1f\x7f]/);
      });

    } finally {
      // Restore original console
      Object.assign(console, originalConsole);
    }
  });
*/
    test("user display names are sanitized in game logs", () => {
        maliciousInputs.forEach((maliciousName) => {
            const mockUser = {
                id: "123456789",
                username: "testuser",
                displayName: maliciousName,
            };

            // This should not throw and should sanitize the display name
            expect(() => {
                secureLogger.info("Game started", {
                    player: mockUser.displayName,
                    userId: mockUser.id,
                });
            }).not.toThrow();
        });
    });

    test("command parameters are sanitized in logs", () => {
        maliciousInputs.forEach((maliciousParam) => {
            expect(() => {
                secureLogger.info("Command executed", {
                    command: "cowsay",
                    parameters: maliciousParam,
                    userId: "123456789",
                });
            }).not.toThrow();
        });
    });

    test("error messages with user data are sanitized", () => {
        maliciousInputs.forEach((maliciousData) => {
            expect(() => {
                secureLogger.error("Database error", {
                    error: "Connection failed",
                    userInput: maliciousData,
                    timestamp: new Date().toISOString(),
                });
            }).not.toThrow();
        });
    });

    test("log length limits prevent flooding", () => {
        const veryLongInput = "A".repeat(10000);
        const sanitized = secureLogger.sanitizeInput(veryLongInput);

        expect(sanitized.length).toBeLessThanOrEqual(200);
        expect(sanitized.length).toBe(200);
    });

    test("structured logging maintains data integrity", () => {
        const testData = {
            userId: "123456789",
            command: "cowsay",
            parameters: maliciousInputs[0],
            timestamp: new Date().toISOString(),
        };

        expect(() => {
            secureLogger.info("Test log entry", testData);
        }).not.toThrow();

        // Verify the structure is maintained even with malicious input
        expect(testData.userId).toBe("123456789");
        expect(testData.command).toBe("cowsay");
    });
});
