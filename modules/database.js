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
                            // Check if index already exists
                            const [existingIndexes] = await this.pool.execute(
                                'SELECT COUNT(*) as count FROM information_schema.statistics WHERE table_schema = ? AND table_name = ? AND index_name = ?',
                                [process.env.DB_NAME || 'cowsay', tableName, indexName]
                            );
                            
                            if (existingIndexes[0].count === 0) {
                                const createIndexSQL = `CREATE INDEX ${indexName} ON ${tableName} (${indexColumn})`;
                                await this.queryWithoutLogging(createIndexSQL);
                            }
                        } catch (error) {
                            // Silently ignore duplicate key errors - index already exists
                            if (!error.message.includes('Duplicate key name')) {
                                Logger.error(`Failed to create index ${indexName}:`, error.message);
                            }
                        }
                    }
                }
            }

            // Run version-specific migrations
            if (this.schema.version === 10) {
                await this.migrateToV10();
            }
        } catch (error) {
            Logger.error('Migration failed', error.message);
            throw error;
        }
    }

    async migrateToV10() {
        const connection = await this.pool.getConnection();
        try {
            await connection.beginTransaction();
            
            // Check if user_purchases table exists and has data
            const [tables] = await connection.execute("SHOW TABLES LIKE 'user_purchases'");
            if (tables.length === 0) {
                Logger.info('No user_purchases table found, skipping v10 migration');
                await connection.commit();
                return;
            }

            // Check if migration already completed
            const [existingInventory] = await connection.execute('SELECT COUNT(*) as count FROM user_inventory');
            if (existingInventory[0].count > 0) {
                Logger.info('user_inventory already has data, skipping v10 migration');
                await connection.commit();
                return;
            }

            // Migrate data from user_purchases to user_inventory
            const [purchases] = await connection.execute('SELECT * FROM user_purchases');
            Logger.info(`Migrating ${purchases.length} purchases to inventory system`);

            for (const purchase of purchases) {
                await connection.execute(
                    'INSERT INTO user_inventory (user_id, item_id, acquired_date, acquired_method) VALUES (?, ?, ?, ?)',
                    [purchase.user_id, purchase.item_id, purchase.purchased_at, 'purchase']
                );
            }

            // Drop old table after successful migration
            await connection.execute('DROP TABLE user_purchases');
            await connection.commit();
            Logger.info('Successfully migrated to v10 inventory system');
        } catch (error) {
            await connection.rollback();
            Logger.error('v10 migration failed, rolled back', error.message);
            throw error;
        } finally {
            connection.release();
        }
    }

    async query(sql, params = []) {
        const connection = await this.pool.getConnection();
        try {
            const [rows] = await connection.execute(sql, params);
            return rows;
        } catch (error) {
            Logger.error('Database query failed', { sql: sql.substring(0, 100), error: error.message });
            throw error;
        } finally {
            connection.release();
        }
    }

    async queryWithoutLogging(sql, params = []) {
        const connection = await this.pool.getConnection();
        try {
            const [rows] = await connection.execute(sql, params);
            return rows;
        } catch (error) {
            // Don't log errors for this method - used for index creation
            throw error;
        } finally {
            connection.release();
        }
    }

    async close() {
        if (this.pool) {
            await this.pool.end();
        }
    }
}

module.exports = new Database();