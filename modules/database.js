const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const Logger = require('./logger');

class Database {
    constructor() {
        this.pool = null;
        this.schema = null;
    }

    async init() {
        try {
            // Load schema
            const schemaPath = path.join(__dirname, '..', 'schema.json');
            this.schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

            // Create connection pool
            this.pool = mysql.createPool({
                host: process.env.DB_HOST || 'localhost',
                port: process.env.DB_PORT || 3306,
                user: process.env.DB_USER || 'admin',
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME || 'cowsay',
                waitForConnections: true,
                connectionLimit: 10,
                queueLimit: 0
            });

            await this.createDatabase();
            await this.runMigrations();
            Logger.info('Database initialized successfully');
        } catch (error) {
            Logger.error('Database initialization failed', error.message);
            throw error;
        }
    }

    async createDatabase() {
        try {
            const connection = await mysql.createConnection({
                host: process.env.DB_HOST || 'localhost',
                port: process.env.DB_PORT || 3306,
                user: process.env.DB_USER || 'admin',
                password: process.env.DB_PASSWORD
            });

            await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'cowsay'}\``);
            await connection.end();
        } catch (error) {
            Logger.error('Failed to create database', error.message);
            throw error;
        }
    }

    async runMigrations() {
        try {
            // Create tables from schema
            for (const [tableName, tableSchema] of Object.entries(this.schema.tables)) {
                const columns = Object.entries(tableSchema.columns)
                    .map(([name, definition]) => `${name} ${definition}`)
                    .join(', ');

                const createTableSQL = `CREATE TABLE IF NOT EXISTS ${tableName} (${columns})`;
                await this.query(createTableSQL);

                // Create indexes
                if (tableSchema.indexes) {
                    for (const indexColumn of tableSchema.indexes) {
                        const indexName = `idx_${tableName}_${indexColumn}`;
                        try {
                            const createIndexSQL = `CREATE INDEX ${indexName} ON ${tableName} (${indexColumn})`;
                            await this.query(createIndexSQL);
                        } catch (error) {
                            // Silently ignore duplicate key errors - index already exists
                            if (!error.message.includes('Duplicate key name')) {
                                Logger.error(`Failed to create index ${indexName}:`, error.message);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            Logger.error('Migration failed', error.message);
            throw error;
        }
    }

    async query(sql, params = []) {
        try {
            const [rows] = await this.pool.execute(sql, params);
            return rows;
        } catch (error) {
            Logger.error('Database query failed', { sql, error: error.message });
            throw error;
        }
    }

    async close() {
        if (this.pool) {
            await this.pool.end();
        }
    }
}

module.exports = new Database();