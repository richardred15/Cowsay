class MessageUtils {
    static truncateMessage(message, maxLength = 2000) {
        if (message.length <= maxLength) {
            return message;
        }
        
        const truncationText = " [... Truncated by Cowsay ...]";
        const availableLength = maxLength - truncationText.length;
        
        return message.slice(0, availableLength) + truncationText;
    }

    static safeReply(message, content) {
        const truncated = this.truncateMessage(content);
        return message.reply(truncated).catch(error => {
            const secureLogger = require('./secureLogger');
            secureLogger.error('Failed to send message', { error: error.message });
            return message.reply("Sorry, I couldn't send that message. 🤖");
        });
    }
}

module.exports = MessageUtils;