class DateUtils {
    /**
     * Convert JavaScript Date to MySQL TIMESTAMP format
     * @param {Date} date - JavaScript Date object
     * @returns {string} MySQL TIMESTAMP format (YYYY-MM-DD HH:MM:SS)
     */
    static toMySQLTimestamp(date) {
        return date.toISOString().slice(0, 19).replace('T', ' ');
    }
    
    /**
     * Get current timestamp in MySQL TIMESTAMP format
     * @returns {string} Current time as MySQL TIMESTAMP
     */
    static nowAsMySQLTimestamp() {
        return this.toMySQLTimestamp(new Date());
    }
}

module.exports = DateUtils;