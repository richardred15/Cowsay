const database = require("./database");
const inventoryManager = require("./inventoryManager");
const currencyManager = require("./currencyManager");
const Logger = require("./logger");

class GiftManager {
    async sendGift(senderId, recipientId, itemId, message = null) {
        try {
            // Validate sender can't gift to themselves
            if (senderId === recipientId) {
                return {
                    success: false,
                    error: "You can't gift items to yourself!",
                };
            }

            // Use Promise.all for concurrent database queries
            const [recipientOwns, item, senderBalance] = await Promise.all([
                inventoryManager.hasItem(recipientId, itemId),
                database.query(
                    "SELECT item_id, name, price, category FROM shop_items WHERE item_id = ?",
                    [itemId]
                ),
                currencyManager.getBalance(senderId),
            ]);

            if (recipientOwns) {
                return {
                    success: false,
                    error: "Recipient already owns this item!",
                };
            }

            if (item.length === 0) {
                return { success: false, error: "Item not found!" };
            }

            const basePrice = item[0].price;
            const giftCost = Math.floor(basePrice * 1.1); // 10% gift fee
            if (senderBalance < giftCost) {
                return {
                    success: false,
                    error: `Insufficient coins! Need ${giftCost} coins (${basePrice} + 10% gift fee).`,
                };
            }

            // Process the gift transaction
            await database.query("BEGIN");

            try {
                // Deduct coins from sender
                await currencyManager.removeCoins(
                    senderId,
                    giftCost,
                    `Gift: ${item[0].name} to user`
                );

                // Add item to recipient's inventory
                await inventoryManager.addToInventory(
                    recipientId,
                    itemId,
                    "gift",
                    senderId
                );

                // Log the gift transaction
                await database.query(
                    "INSERT INTO gift_transactions (sender_id, recipient_id, item_id, message, cost) VALUES (?, ?, ?, ?, ?)",
                    [senderId, recipientId, itemId, message, giftCost]
                );

                await database.query("COMMIT");

                Logger.info(
                    `Gift sent: ${senderId} -> ${recipientId}, item: ${itemId}, cost: ${giftCost}`
                );
                return {
                    success: true,
                    item: item[0],
                    cost: giftCost,
                    message: message,
                };
            } catch (error) {
                await database.query("ROLLBACK");
                throw error;
            }
        } catch (error) {
            Logger.error("Failed to send gift", error.message);
            return {
                success: false,
                error: "Failed to process gift. Please try again.",
            };
        }
    }

    async getGiftHistory(userId, type = "all", limit = 10) {
        try {
            let query = `
                SELECT gt.*, si.name as item_name, si.category
                FROM gift_transactions gt
                JOIN shop_items si ON gt.item_id = si.item_id
                WHERE 1=1
            `;
            const params = [];

            if (type === "sent") {
                query += " AND gt.sender_id = ?";
                params.push(userId);
            } else if (type === "received") {
                query += " AND gt.recipient_id = ?";
                params.push(userId);
            } else {
                query += " AND (gt.sender_id = ? OR gt.recipient_id = ?)";
                params.push(userId, userId);
            }

            query += " ORDER BY gt.created_at DESC LIMIT ?";
            params.push(limit.toString());

            return await database.query(query, params);
        } catch (error) {
            Logger.error("Failed to get gift history", error.message);
            return [];
        }
    }

    async addToWishlist(userId, itemId, message = null) {
        try {
            // Check if user already owns the item
            const owns = await inventoryManager.hasItem(userId, itemId);
            if (owns) {
                return { success: false, error: "You already own this item!" };
            }

            // Check if item exists
            const item = await database.query(
                "SELECT * FROM shop_items WHERE item_id = ?",
                [itemId]
            );
            if (item.length === 0) {
                return { success: false, error: "Item not found!" };
            }

            await database.query(
                "INSERT INTO gift_requests (user_id, item_id, message) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE message = VALUES(message)",
                [userId, itemId, message]
            );

            return { success: true, item: item[0] };
        } catch (error) {
            Logger.error("Failed to add to wishlist", error.message);
            return { success: false, error: "Failed to add to wishlist." };
        }
    }

    async removeFromWishlist(userId, itemId) {
        try {
            const result = await database.query(
                "DELETE FROM gift_requests WHERE user_id = ? AND item_id = ?",
                [userId, itemId]
            );

            return { success: result.affectedRows > 0 };
        } catch (error) {
            Logger.error("Failed to remove from wishlist", error.message);
            return { success: false };
        }
    }

    async getWishlist(userId) {
        try {
            const wishlist = await database.query(
                `
                SELECT gr.*, si.name, si.price, si.category, si.description
                FROM gift_requests gr
                JOIN shop_items si ON gr.item_id = si.item_id
                WHERE gr.user_id = ?
                ORDER BY gr.created_at DESC
            `,
                [userId]
            );

            return wishlist;
        } catch (error) {
            Logger.error("Failed to get wishlist", error.message);
            return [];
        }
    }

    calculateGiftCost(basePrice) {
        return Math.floor(basePrice * 1.1); // 10% gift fee
    }
}

module.exports = new GiftManager();
