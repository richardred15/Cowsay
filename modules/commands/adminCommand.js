const BaseCommand = require('./baseCommand');
const currencyManager = require('../currencyManager');
const { EmbedBuilder } = require('discord.js');

class AdminCommand extends BaseCommand {
    constructor() {
        super('admin', {
            description: 'Administrative commands for managing the bot',
            requiresAuth: true,
            authLevel: 'admin',
            category: 'admin'
        });
    }

    async execute(message, args) {
        const subcommand = args[0]?.toLowerCase();
        
        switch (subcommand) {
            case 'addcoins':
                return await this.handleAddCoins(message, args.slice(1));
            case 'removecoins':
                return await this.handleRemoveCoins(message, args.slice(1));
            case 'balance':
                return await this.handleCheckBalance(message, args.slice(1));
            case 'transactions':
                return await this.handleTransactions(message);
            case 'help':
                return await this.handleHelp(message);
            default:
                message.reply('Usage: `!cowsay admin <addcoins|removecoins|balance|transactions|help>`');
        }
    }

    async handleAddCoins(message, args) {
        const mention = message.mentions.users.first();
        const amount = parseInt(args[1]);

        if (!mention || !amount || amount <= 0) {
            message.reply('Usage: `!cowsay admin addcoins @user <amount> [reason]`');
            return;
        }

        const reason = args.slice(2).join(' ') || 'Admin grant';
        const result = await currencyManager.adminAddCoins(mention.id, amount, reason);

        if (result.success) {
            message.reply(`✅ Added **${amount}** coins to <@${mention.id}>. New balance: **${result.newBalance}** coins`);
        } else {
            message.reply(`❌ Failed to add coins: ${result.error}`);
        }
    }

    async handleRemoveCoins(message, args) {
        const mention = message.mentions.users.first();
        const amount = parseInt(args[1]);

        if (!mention || !amount || amount <= 0) {
            message.reply('Usage: `!cowsay admin removecoins @user <amount> [reason]`');
            return;
        }

        const reason = args.slice(2).join(' ') || 'Admin removal';
        const result = await currencyManager.adminRemoveCoins(mention.id, amount, reason);

        if (result.success) {
            message.reply(`✅ Removed **${result.actualAmount}** coins from <@${mention.id}>. New balance: **${result.newBalance}** coins`);
        } else {
            message.reply(`❌ Failed to remove coins: ${result.error}`);
        }
    }

    async handleCheckBalance(message, args) {
        const mention = message.mentions.users.first();
        if (!mention) {
            message.reply('Usage: `!cowsay admin balance @user`');
            return;
        }

        const balance = await currencyManager.getBalance(mention.id);
        message.reply(`🪙 <@${mention.id}> has **${balance}** coins`);
    }

    async handleTransactions(message) {
        const history = await currencyManager.getAllTransactions(20);
        if (history.length === 0) {
            message.reply('No transactions found! 📊');
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle('🔍 All Transaction History (Admin)')
            .setColor(0xff4444)
            .setDescription(
                history.map((tx) => {
                    const sign = tx.amount >= 0 ? '+' : '';
                    const date = new Date(tx.created_at).toLocaleDateString();
                    const emoji = tx.reason.includes('perfect') ? '🏆' :
                                tx.reason.includes('win') ? '🎆' :
                                tx.reason.includes('Admin') ? '🔧' : '🪙';
                    return `${emoji} <@${tx.user_id}> ${sign}${tx.amount} 🪙 - ${tx.reason}\n*${tx.balance_before} → ${tx.balance_after} (${date})*`;
                }).join('\n\n')
            )
            .setFooter({ text: 'Last 20 transactions across all users' });

        message.reply({ embeds: [embed] });
    }

    async handleHelp(message) {
        const Pagination = require('../pagination');
        
        const helpSections = [
            '**🪙 Coin Management**\n`!cowsay admin addcoins @user <amount> [reason]` - Add coins to a user\n`!cowsay admin removecoins @user <amount> [reason]` - Remove coins from a user\n`!cowsay admin balance @user` - Check any user\'s balance\n`!cowsay admin transactions` - View last 20 transactions (all users)',
            '**🔥 Rivals Management**\n`!cowsay rival add @user <description>` - Add a rival bot\n`!cowsay rival remove @user` - Remove a rival\n`!cowsay rival list` - Show all rivals\n`!cowsay help rivals` - Learn about rivals system',
            '**🔐 Permissions**\n`!cowsay perms setrole <level> @role` - Map role to permission level\n`!cowsay perms removerole @role` - Remove role mapping\n`!cowsay perms listroles` - Show role mappings\n`!cowsay perms check @user` - Check user permission level',
            '**⚙️ Server Settings**\n`!toggleautoreply` - Toggle auto-reply to "cowsay" mentions\n`!toggleintent` - Cycle intent detection modes\n`!showconfig` - Show current server configuration\n`!clearleaderboard` - Clear leaderboard cache',
            '**📊 Statistics**\n`!cowsay serverstats` - View server game statistics\n`!cowsay topplayers` - View server leaderboard\nNote: Users can opt out with `!cowsay optstats out`'
        ];

        await Pagination.create(message, 'Admin Commands Help', helpSections, 2);
    }
}

module.exports = AdminCommand;