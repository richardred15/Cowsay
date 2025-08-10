const database = require("./database");
const currencyManager = require("./currencyManager");
const inventoryManager = require("./inventoryManager");
const giftManager = require("./giftManager");
const Logger = require("./logger");

class ShopManager {
    constructor() {
        this.initialized = false;
        // Don't initialize immediately - wait for database to be ready
    }

    async initializeShop() {
        if (this.initialized) return;

        try {
            await this.createDefaultItems();
            this.initialized = true;
        } catch (error) {
            Logger.error("Shop initialization failed:", error);
        }
    }

    async createDefaultItems() {
        const defaultItems = [
            // Premium Characters
            {
                item_id: "dragon",
                name: "Dragon",
                price: 500,
                category: "character",
                description: "Fierce dragon ASCII art",
            },
            {
                item_id: "tux",
                name: "Tux Penguin",
                price: 300,
                category: "character",
                description: "Linux mascot penguin",
            },
            {
                item_id: "vader",
                name: "Darth Vader",
                price: 750,
                category: "character",
                description: "Dark side ASCII art",
            },
            {
                item_id: "elephant",
                name: "Elephant",
                price: 400,
                category: "character",
                description: "Majestic elephant ASCII",
            },
            {
                item_id: "ghostbusters",
                name: "Ghostbusters",
                price: 600,
                category: "character",
                description: "Who you gonna call?",
            },

            // Future categories
            {
                item_id: "daily_boost",
                name: "Daily Boost",
                price: 1000,
                category: "boost",
                description: "Double daily bonus for 7 days",
            },
            {
                item_id: "streak_shield",
                name: "Streak Shield",
                price: 1000,
                category: "boost",
                description: "Protect win streak from one loss",
            },
        ];

        for (const item of defaultItems) {
            try {
                await database.query(
                    "INSERT IGNORE INTO shop_items (item_id, name, price, category, description) VALUES (?, ?, ?, ?, ?)",
                    [
                        item.item_id,
                        item.name,
                        item.price,
                        item.category,
                        item.description,
                    ]
                );
            } catch (error) {
                Logger.error(
                    `Failed to create shop item ${item.item_id}:`,
                    error
                );
            }
        }
    }

    async getShopItems(category = null) {
        try {
            await this.initializeShop();

            const query = category
                ? "SELECT * FROM shop_items WHERE category = ? ORDER BY price ASC"
                : "SELECT * FROM shop_items ORDER BY category, price ASC";
            const params = category ? [category] : [];

            const rows = await database.query(query, params);
            return rows || [];
        } catch (error) {
            Logger.error("Failed to get shop items:", error);
            return [];
        }
    }

    async getUserPurchases(userId) {
        try {
            await this.initializeShop();

            const inventory = await inventoryManager.getUserInventory(userId);
            return inventory.map((item) => item.item_id);
        } catch (error) {
            Logger.error("Failed to get user purchases:", error);
            return [];
        }
    }

    async purchaseItem(userId, itemId) {
        try {
            await this.initializeShop();

            // Check if item exists
            const items = await database.query(
                "SELECT * FROM shop_items WHERE item_id = ?",
                [itemId]
            );
            if (!items || items.length === 0) {
                return { success: false, message: "Item not found!" };
            }

            const item = items[0];

            // Check if already purchased (only for characters)
            if (item.category === "character") {
                const owns = await inventoryManager.hasItem(userId, itemId);
                if (owns) {
                    return {
                        success: false,
                        message: "You already own this character!",
                    };
                }
            }

            // Check balance
            const balance = await currencyManager.getBalance(userId);
            if (balance < item.price) {
                return {
                    success: false,
                    message: `Insufficient coins! Need ${item.price}, have ${balance}`,
                };
            }

            // Deduct coins first
            const spendSuccess = await currencyManager.spendCoins(
                userId,
                item.price,
                `Purchased ${item.name}`
            );
            if (!spendSuccess) {
                return {
                    success: false,
                    message: "Failed to deduct coins. Please try again.",
                };
            }

            // Handle different item types
            if (item.category === "character") {
                // Add character to inventory
                await inventoryManager.addToInventory(
                    userId,
                    itemId,
                    "purchase"
                );
            } else if (item.category === "boost") {
                // Activate boost immediately
                if (itemId === "daily_boost") {
                    await currencyManager.activateDailyBoost(userId);
                } else if (itemId === "streak_shield") {
                    await currencyManager.addStreakShield(userId, 1);
                }
            }

            return {
                success: true,
                message: `Successfully purchased ${item.name} for ${item.price} coins!`,
                item: item,
            };
        } catch (error) {
            Logger.error("Purchase failed:", error);
            return {
                success: false,
                message: "Purchase failed. Please try again.",
            };
        }
    }

    async hasItem(userId, itemId) {
        try {
            await this.initializeShop();
            return await inventoryManager.hasItem(userId, itemId);
        } catch (error) {
            Logger.error("Failed to check item ownership:", error);
            return false;
        }
    }

    async getShopWithGiftPricing(userId) {
        try {
            const items = await this.getShopItems();
            const userInventory = await inventoryManager.getUserInventory(
                userId
            );
            const ownedItems = new Set(
                userInventory.map((item) => item.item_id)
            );

            return items.map((item) => ({
                ...item,
                owned: ownedItems.has(item.item_id),
                gift_cost: giftManager.calculateGiftCost(item.price),
            }));
        } catch (error) {
            Logger.error("Failed to get shop with gift pricing:", error);
            return [];
        }
    }
}

module.exports = new ShopManager();
