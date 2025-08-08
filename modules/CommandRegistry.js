const Logger = require('./logger');

class CommandRegistry {
    constructor() {
        this.commands = new Map();
        this.aliases = new Map();
    }

    register(command, handler, options = {}) {
        const { aliases = [], permissions = 'user', description = '' } = options;
        
        this.commands.set(command, {
            handler,
            permissions,
            description,
            aliases
        });

        aliases.forEach(alias => {
            this.aliases.set(alias, command);
        });
    }

    async execute(message, commandName, args) {
        const mainCommand = this.aliases.get(commandName) || commandName;
        const commandData = this.commands.get(mainCommand);

        if (!commandData) return false;

        try {
            const discordPermissions = require('./discordPermissions');
            if (commandData.permissions !== 'user') {
                const hasPermission = await discordPermissions.hasPermission(
                    message, 
                    discordPermissions.PERMISSION_LEVELS[commandData.permissions.toUpperCase()]
                );
                
                if (!hasPermission) {
                    message.reply(discordPermissions.getPermissionError(
                        discordPermissions.PERMISSION_LEVELS[commandData.permissions.toUpperCase()]
                    ));
                    return true;
                }
            }

            await commandData.handler(message, args);
            return true;
        } catch (error) {
            Logger.error(`Command execution error: ${mainCommand}`, error.message);
            message.reply('❌ An error occurred while executing the command.');
            return true;
        }
    }
}

module.exports = new CommandRegistry();