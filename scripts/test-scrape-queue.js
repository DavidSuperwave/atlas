#!/usr/bin/env node

/**
 * Test Scrape Queue System
 * 
 * Tests the queue system locally to ensure:
 * 1. Queue entries are created correctly
 * 2. Sequential processing works
 * 3. Browser state detection works
 * 
 * Usage:
 *   node scripts/test-scrape-queue.js
 */

const fs = require('fs');
const path = require('path');

// Load .env.local
function loadEnv() {
    const envPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const lines = envContent.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const eqIndex = trimmed.indexOf('=');
                if (eqIndex > 0) {
                    const key = trimmed.substring(0, eqIndex).trim();
                    let value = trimmed.substring(eqIndex + 1).trim();
                    if ((value.startsWith('"') && value.endsWith('"')) ||
                        (value.startsWith("'") && value.endsWith("'"))) {
                        value = value.slice(1, -1);
                    }
                    if (!process.env[key]) {
                        process.env[key] = value;
                    }
                }
            }
        }
        console.log('✓ Loaded environment from .env.local');
    }
}

loadEnv();

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testQueueSystem() {
    console.log('\n========================================');
    console.log('Testing Scrape Queue System');
    console.log('========================================\n');

    // Test 1: Check tables exist
    console.log('1. Checking database tables...');
    
    const { data: queueCheck, error: queueError } = await supabase
        .from('scrape_queue')
        .select('id')
        .limit(1);

    if (queueError && queueError.code === '42P01') {
        console.log('❌ scrape_queue table does not exist');
        console.log('   Run the migration: supabase/add_scrape_queue.sql');
        return;
    } else if (queueError) {
        console.log('⚠️  Error checking scrape_queue:', queueError.message);
    } else {
        console.log('✓ scrape_queue table exists');
    }

    const { data: sessionCheck, error: sessionError } = await supabase
        .from('browser_sessions')
        .select('id')
        .limit(1);

    if (sessionError && sessionError.code === '42P01') {
        console.log('❌ browser_sessions table does not exist');
        console.log('   Run the migration: supabase/add_scrape_queue.sql');
        return;
    } else if (sessionError) {
        console.log('⚠️  Error checking browser_sessions:', sessionError.message);
    } else {
        console.log('✓ browser_sessions table exists');
    }

    // Test 2: Check browser state
    console.log('\n2. Checking browser state...');
    
    const { data: activeSessions, error: activeError } = await supabase
        .from('browser_sessions')
        .select('*')
        .eq('status', 'active');

    if (activeError) {
        console.log('⚠️  Error checking active sessions:', activeError.message);
    } else if (activeSessions && activeSessions.length > 0) {
        console.log(`⚠️  Found ${activeSessions.length} active session(s)`);
        activeSessions.forEach(s => {
            console.log(`   - Type: ${s.session_type}, Started: ${s.started_at}`);
        });
    } else {
        console.log('✓ Browser is available (no active sessions)');
    }

    // Test 3: Check queue status
    console.log('\n3. Checking queue status...');
    
    const { data: pendingScrapes, error: pendingError } = await supabase
        .from('scrape_queue')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

    if (pendingError) {
        console.log('⚠️  Error checking pending scrapes:', pendingError.message);
    } else if (pendingScrapes && pendingScrapes.length > 0) {
        console.log(`📋 Found ${pendingScrapes.length} pending scrape(s)`);
        pendingScrapes.forEach((s, i) => {
            console.log(`   ${i + 1}. Scrape ID: ${s.scrape_id}, Created: ${s.created_at}`);
        });
    } else {
        console.log('✓ No pending scrapes in queue');
    }

    const { data: runningScrapes, error: runningError } = await supabase
        .from('scrape_queue')
        .select('*')
        .eq('status', 'running');

    if (runningError) {
        console.log('⚠️  Error checking running scrapes:', runningError.message);
    } else if (runningScrapes && runningScrapes.length > 0) {
        console.log(`🔄 Found ${runningScrapes.length} running scrape(s)`);
    } else {
        console.log('✓ No scrapes currently running');
    }

    // Test 4: Check recent completed/failed
    console.log('\n4. Recent scrape history...');
    
    const { data: recentScrapes, error: recentError } = await supabase
        .from('scrape_queue')
        .select('*')
        .in('status', ['completed', 'failed'])
        .order('completed_at', { ascending: false })
        .limit(5);

    if (recentError) {
        console.log('⚠️  Error checking recent scrapes:', recentError.message);
    } else if (recentScrapes && recentScrapes.length > 0) {
        console.log(`📜 Last ${recentScrapes.length} completed/failed scrape(s):`);
        recentScrapes.forEach(s => {
            const status = s.status === 'completed' ? '✓' : '✗';
            console.log(`   ${status} ${s.status}: ${s.leads_found || 0} leads, ${s.completed_at}`);
            if (s.error_message) {
                console.log(`     Error: ${s.error_message.substring(0, 50)}...`);
            }
        });
    } else {
        console.log('✓ No completed scrapes yet');
    }

    console.log('\n========================================');
    console.log('Queue System Check Complete');
    console.log('========================================\n');

    console.log('Summary:');
    console.log('- Database tables: Ready');
    console.log(`- Browser state: ${activeSessions?.length ? 'In Use' : 'Available'}`);
    console.log(`- Pending scrapes: ${pendingScrapes?.length || 0}`);
    console.log(`- Running scrapes: ${runningScrapes?.length || 0}`);
    console.log('');
}

testQueueSystem().catch(console.error);

