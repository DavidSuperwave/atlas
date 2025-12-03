const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
    connectionString: process.env.POSTGRES_URL,
    ssl: {
        rejectUnauthorized: false,
    },
});

async function run() {
    try {
        await client.connect();
        const sql = fs.readFileSync(path.join(__dirname, '../supabase/schema.sql'), 'utf8');
        await client.query(sql);
        console.log('Schema applied successfully.');
    } catch (err) {
        console.error('Error applying schema:', err);
    } finally {
        await client.end();
    }
}

run();
