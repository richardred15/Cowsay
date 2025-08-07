const fs = require('fs');
const path = require('path');
const Logger = require('./logger');

class DataStore {
    constructor() {
        this.dataDir = path.join(__dirname, '..', 'data');
        this.ensureDataDir();
    }

    ensureDataDir() {
        try {
            fs.mkdirSync(this.dataDir, { recursive: true });
        } catch (error) {
            if (error.code !== 'EEXIST') {
                Logger.error('Failed to create data directory', error.message);
            }
        }
    }

    async save(filename, data) {
        try {
            const filePath = path.join(this.dataDir, `${filename}.json`);
            await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
        } catch (error) {
            Logger.error('Failed to save data file', { filename, error: error.message });
        }
    }

    async load(filename) {
        try {
            const filePath = path.join(this.dataDir, `${filename}.json`);
            const data = await fs.promises.readFile(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            // File doesn't exist or is invalid, return null
            return null;
        }
    }
}

module.exports = new DataStore();