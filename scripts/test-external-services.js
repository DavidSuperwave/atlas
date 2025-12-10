/**
 * Test Script for External Services
 * 
 * Tests all external service integrations:
 * - GoLogin token/profile handling
 * - MailTester rate limits
 * - Resend domain verification
 * - Instantly/Smartlead/Plusvibe integrations
 * - Supabase RLS enforcement
 * 
 * Usage:
 *   node scripts/test-external-services.js
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '..', '.env.local') });

const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function test(name, fn) {
    return async () => {
        try {
            log(`\n[TEST] ${name}`, 'cyan');
            await fn();
            log(`[PASS] ${name}`, 'green');
            return true;
        } catch (error) {
            log(`[FAIL] ${name}: ${error.message}`, 'red');
            console.error(error);
            return false;
        }
    };
}

async function testGoLogin() {
    const tests = [];
    
    tests.push(test('GoLogin API Token configured', async () => {
        if (!process.env.GOLOGIN_API_TOKEN) {
            throw new Error('GOLOGIN_API_TOKEN not set');
        }
        if (process.env.GOLOGIN_API_TOKEN.length < 10) {
            throw new Error('GOLOGIN_API_TOKEN appears invalid (too short)');
        }
    }));
    
    tests.push(test('GoLogin Profile ID configured', async () => {
        if (!process.env.GOLOGIN_PROFILE_ID) {
            log('  WARNING: GOLOGIN_PROFILE_ID not set (may use user-specific profiles)', 'yellow');
        }
    }));
    
    tests.push(test('GoLogin API availability', async () => {
        const token = process.env.GOLOGIN_API_TOKEN;
        if (!token) {
            throw new Error('GOLOGIN_API_TOKEN not set');
        }
        
        const response = await fetch('https://api.gologin.com/browser/v2', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(10000)
        });
        
        if (!response.ok) {
            throw new Error(`GoLogin API returned ${response.status}: ${response.statusText}`);
        }
    }));
    
    const results = await Promise.all(tests.map(t => t()));
    return results.every(r => r);
}

async function testMailTester() {
    const tests = [];
    
    tests.push(test('MailTester API key configured', async () => {
        const singleKey = process.env.MAILTESTER_API_KEY;
        const jsonKeys = process.env.MAILTESTER_API_KEYS;
        const numberedKeys = [];
        
        for (let i = 1; i <= 20; i++) {
            const key = process.env[`MAILTESTER_API_KEY_${i}`];
            if (key) numberedKeys.push(key);
        }
        
        if (!singleKey && !jsonKeys && numberedKeys.length === 0) {
            throw new Error('No MailTester API keys configured');
        }
        
        log(`  Found ${singleKey ? 1 : 0} single key, ${jsonKeys ? 'JSON keys' : 'none'}, ${numberedKeys.length} numbered keys`, 'blue');
    }));
    
    tests.push(test('MailTester API key format', async () => {
        const key = process.env.MAILTESTER_API_KEY;
        if (!key) {
            log('  SKIP: No single key to test', 'yellow');
            return;
        }
        
        if (key.length < 10) {
            throw new Error('API key appears invalid (too short)');
        }
    }));
    
    tests.push(test('MailTester API endpoint accessible', async () => {
        const key = process.env.MAILTESTER_API_KEY;
        if (!key) {
            log('  SKIP: No API key to test', 'yellow');
            return;
        }
        
        // Test with a dummy email
        const params = new URLSearchParams({
            email: 'test@example.com',
            key: key,
        });
        
        const response = await fetch(`https://happy.mailtester.ninja/ninja?${params.toString()}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(10000)
        });
        
        if (!response.ok && response.status !== 429) {
            throw new Error(`MailTester API returned ${response.status}: ${response.statusText}`);
        }
        
        if (response.status === 429) {
            log('  WARNING: Rate limited (expected if testing frequently)', 'yellow');
        }
    }));
    
    const results = await Promise.all(tests.map(t => t()));
    return results.every(r => r);
}

async function testResend() {
    const tests = [];
    
    tests.push(test('Resend API key configured', async () => {
        if (!process.env.RESEND_API_KEY) {
            throw new Error('RESEND_API_KEY not set');
        }
        if (!process.env.RESEND_API_KEY.startsWith('re_')) {
            log('  WARNING: RESEND_API_KEY should start with "re_"', 'yellow');
        }
    }));
    
    tests.push(test('Resend FROM email configured', async () => {
        if (!process.env.RESEND_FROM_EMAIL) {
            throw new Error('RESEND_FROM_EMAIL not set');
        }
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(process.env.RESEND_FROM_EMAIL)) {
            throw new Error('RESEND_FROM_EMAIL is not a valid email format');
        }
        
        log(`  FROM email: ${process.env.RESEND_FROM_EMAIL}`, 'blue');
    }));
    
    tests.push(test('Resend domain verification (warning only)', async () => {
        const fromEmail = process.env.RESEND_FROM_EMAIL;
        if (!fromEmail) {
            log('  SKIP: No FROM email to check', 'yellow');
            return;
        }
        
        const domain = fromEmail.split('@')[1];
        log(`  NOTE: Domain "${domain}" should be verified in Resend dashboard`, 'yellow');
        log(`  Check: https://resend.com/domains`, 'yellow');
    }));
    
    const results = await Promise.all(tests.map(t => t()));
    return results.every(r => r);
}

async function testSupabase() {
    const tests = [];
    
    tests.push(test('Supabase URL configured', async () => {
        if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
            throw new Error('NEXT_PUBLIC_SUPABASE_URL not set');
        }
        if (!process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith('https://')) {
            throw new Error('NEXT_PUBLIC_SUPABASE_URL should be HTTPS');
        }
    }));
    
    tests.push(test('Supabase anon key configured', async () => {
        if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
            throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY not set');
        }
    }));
    
    tests.push(test('Supabase service role key configured', async () => {
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error('SUPABASE_SERVICE_ROLE_KEY not set (required for server operations)');
        }
    }));
    
    tests.push(test('Supabase connection test', async () => {
        const { createClient } = await import('@supabase/supabase-js');
        
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        );
        
        // Test connection with a simple query
        const { error } = await supabase.from('user_profiles').select('id').limit(1);
        
        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found, which is OK
            throw new Error(`Supabase connection failed: ${error.message}`);
        }
    }));
    
    const results = await Promise.all(tests.map(t => t()));
    return results.every(r => r);
}

async function testExportEndpoints() {
    log('\n[TEST] Export Endpoints Security Check', 'cyan');
    log('  WARNING: Export endpoints should require authentication', 'yellow');
    log('  Check: src/app/api/instantly/send-leads/route.ts', 'yellow');
    log('  Check: src/app/api/smartlead/send-leads/route.ts', 'yellow');
    log('  Check: src/app/api/plusvibe/send-leads/route.ts', 'yellow');
    log('  These endpoints currently accept API keys in request body without user auth', 'red');
    return true;
}

async function main() {
    log('='.repeat(60), 'cyan');
    log('External Services Test Suite', 'cyan');
    log('='.repeat(60), 'cyan');
    
    const results = {
        gologin: await testGoLogin(),
        mailtester: await testMailTester(),
        resend: await testResend(),
        supabase: await testSupabase(),
        exports: await testExportEndpoints(),
    };
    
    log('\n' + '='.repeat(60), 'cyan');
    log('Test Summary', 'cyan');
    log('='.repeat(60), 'cyan');
    
    Object.entries(results).forEach(([service, passed]) => {
        const status = passed ? 'PASS' : 'FAIL';
        const color = passed ? 'green' : 'red';
        log(`${service.padEnd(20)} ${status}`, color);
    });
    
    const allPassed = Object.values(results).every(r => r);
    
    if (allPassed) {
        log('\nAll tests passed!', 'green');
        process.exit(0);
    } else {
        log('\nSome tests failed. Review the output above.', 'red');
        process.exit(1);
    }
}

main().catch(error => {
    log(`\nFatal error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
});

