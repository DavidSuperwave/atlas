/**
 * Test Script for Dolphin Anty Setup
 * 
 * This script helps verify your Dolphin Anty configuration before running scrapes.
 * 
 * Usage:
 *   node scripts/test-dolphin-setup.js
 * 
 * Or with environment variables:
 *   SCRAPER_MODE=dolphin DOLPHIN_ANTY_PROFILE_ID=your-id node scripts/test-dolphin-setup.js
 */

const DOLPHIN_API_URL = process.env.DOLPHIN_ANTY_API_URL || 'http://localhost:3001';
const PROFILE_ID = process.env.DOLPHIN_ANTY_PROFILE_ID;

console.log('🧪 Dolphin Anty Setup Test\n');
console.log('='.repeat(50));

// Test 1: Check Dolphin Anty API availability
async function testDolphinApi() {
    console.log('\n1️⃣ Testing Dolphin Anty API availability...');
    try {
        const response = await fetch(`${DOLPHIN_API_URL}/browser_profiles`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000)
        });
        
        if (response.ok) {
            console.log('✅ Dolphin Anty API is accessible');
            return true;
        } else {
            console.log(`❌ Dolphin Anty API returned status: ${response.status}`);
            return false;
        }
    } catch (error) {
        console.log('❌ Dolphin Anty API is not accessible');
        console.log(`   Error: ${error.message}`);
        console.log(`   Make sure Dolphin Anty is running and accessible at ${DOLPHIN_API_URL}`);
        return false;
    }
}

// Test 2: List available profiles
async function testListProfiles() {
    console.log('\n2️⃣ Testing profile listing...');
    try {
        const response = await fetch(`${DOLPHIN_API_URL}/browser_profiles?page=1&limit=10`, {
            method: 'GET'
        });
        
        if (response.ok) {
            const data = await response.json();
            const profiles = data.data || [];
            
            console.log(`✅ Found ${profiles.length} profile(s)`);
            
            if (profiles.length > 0) {
                console.log('\n   Available profiles:');
                profiles.forEach((profile, index) => {
                    console.log(`   ${index + 1}. ${profile.name} (ID: ${profile.id}) - Status: ${profile.status}`);
                });
            }
            
            return profiles;
        } else {
            console.log(`❌ Failed to list profiles: ${response.status}`);
            return [];
        }
    } catch (error) {
        console.log(`❌ Error listing profiles: ${error.message}`);
        return [];
    }
}

// Test 3: Check profile ID configuration
async function testProfileId(profiles) {
    console.log('\n3️⃣ Testing profile ID configuration...');
    
    if (!PROFILE_ID) {
        console.log('❌ DOLPHIN_ANTY_PROFILE_ID is not set');
        console.log('   Set it in your .env.local file:');
        console.log('   DOLPHIN_ANTY_PROFILE_ID=your-profile-id');
        
        if (profiles.length > 0) {
            console.log('\n   Available profile IDs:');
            profiles.forEach(p => {
                console.log(`   - ${p.id} (${p.name})`);
            });
        }
        return false;
    }
    
    console.log(`✅ DOLPHIN_ANTY_PROFILE_ID is set: ${PROFILE_ID}`);
    
    // Check if profile exists
    const profileExists = profiles.some(p => p.id === PROFILE_ID);
    if (profileExists) {
        console.log('✅ Profile ID exists in Dolphin Anty');
        return true;
    } else {
        console.log('❌ Profile ID not found in Dolphin Anty');
        console.log('   Make sure the profile ID is correct');
        return false;
    }
}

// Test 4: Check profile status
async function testProfileStatus() {
    console.log('\n4️⃣ Testing profile status...');
    
    if (!PROFILE_ID) {
        console.log('⏭️  Skipping (no profile ID configured)');
        return null;
    }
    
    try {
        const response = await fetch(`${DOLPHIN_API_URL}/browser_profiles/${PROFILE_ID}`, {
            method: 'GET'
        });
        
        if (response.ok) {
            const data = await response.json();
            const profile = data.data || data;
            
            console.log(`✅ Profile found: ${profile.name}`);
            console.log(`   Status: ${profile.status}`);
            console.log(`   Created: ${profile.createdAt || 'N/A'}`);
            
            return profile;
        } else {
            console.log(`❌ Failed to get profile status: ${response.status}`);
            return null;
        }
    } catch (error) {
        console.log(`❌ Error checking profile status: ${error.message}`);
        return null;
    }
}

// Test 5: Test profile start (optional)
async function testProfileStart() {
    console.log('\n5️⃣ Testing profile start capability...');
    
    if (!PROFILE_ID) {
        console.log('⏭️  Skipping (no profile ID configured)');
        return false;
    }
    
    console.log('   Note: This will start the profile if not already running');
    console.log('   Press Ctrl+C to cancel, or wait 5 seconds...');
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    try {
        const response = await fetch(
            `${DOLPHIN_API_URL}/browser_profiles/${PROFILE_ID}/start?automation=1`,
            { method: 'GET' }
        );
        
        if (response.ok) {
            const data = await response.json();
            
            if (data.automation?.wsEndpoint) {
                console.log('✅ Profile started successfully');
                console.log(`   WebSocket endpoint: ${data.automation.wsEndpoint}`);
                return true;
            } else {
                console.log('⚠️  Profile start response received but no WebSocket endpoint');
                return false;
            }
        } else {
            const errorText = await response.text();
            console.log(`❌ Failed to start profile: ${response.status}`);
            console.log(`   Response: ${errorText}`);
            return false;
        }
    } catch (error) {
        console.log(`❌ Error starting profile: ${error.message}`);
        return false;
    }
}

// Test 6: Check environment variables
function testEnvironmentVariables() {
    console.log('\n6️⃣ Checking environment variables...');
    
    const scraperMode = process.env.SCRAPER_MODE || 'local';
    const apiUrl = process.env.DOLPHIN_ANTY_API_URL || 'http://localhost:3001';
    const profileId = process.env.DOLPHIN_ANTY_PROFILE_ID;
    
    console.log(`   SCRAPER_MODE: ${scraperMode}`);
    console.log(`   DOLPHIN_ANTY_API_URL: ${apiUrl}`);
    console.log(`   DOLPHIN_ANTY_PROFILE_ID: ${profileId || '(not set)'}`);
    
    if (scraperMode === 'dolphin' && !profileId) {
        console.log('❌ SCRAPER_MODE is "dolphin" but DOLPHIN_ANTY_PROFILE_ID is not set');
        return false;
    }
    
    if (scraperMode === 'dolphin' && profileId) {
        console.log('✅ Environment variables configured for Dolphin mode');
        return true;
    }
    
    if (scraperMode === 'local') {
        console.log('ℹ️  Using local Chrome mode (default)');
        return true;
    }
    
    return true;
}

// Main test runner
async function runTests() {
    const results = {
        apiAvailable: false,
        profilesListed: false,
        profileIdConfigured: false,
        profileStatus: false,
        profileStart: false,
        envVars: false
    };
    
    // Test 1: API availability
    results.apiAvailable = await testDolphinApi();
    
    if (!results.apiAvailable) {
        console.log('\n⚠️  Dolphin Anty API is not available. Some tests will be skipped.');
        console.log('   Make sure Dolphin Anty is running before proceeding.');
    }
    
    // Test 2: List profiles
    let profiles = [];
    if (results.apiAvailable) {
        profiles = await testListProfiles();
        results.profilesListed = profiles.length >= 0;
    }
    
    // Test 3: Profile ID
    if (results.apiAvailable) {
        results.profileIdConfigured = await testProfileId(profiles);
    }
    
    // Test 4: Profile status
    if (results.apiAvailable && results.profileIdConfigured) {
        const profile = await testProfileStatus();
        results.profileStatus = profile !== null;
    }
    
    // Test 5: Profile start (optional - commented out by default)
    // Uncomment to test profile starting
    // if (results.apiAvailable && results.profileIdConfigured) {
    //     results.profileStart = await testProfileStart();
    // }
    
    // Test 6: Environment variables
    results.envVars = testEnvironmentVariables();
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 Test Summary\n');
    
    const allTests = [
        ['Dolphin Anty API', results.apiAvailable],
        ['Profile Listing', results.profilesListed],
        ['Profile ID Config', results.profileIdConfigured],
        ['Profile Status', results.profileStatus],
        ['Environment Variables', results.envVars]
    ];
    
    allTests.forEach(([name, passed]) => {
        const icon = passed ? '✅' : '❌';
        console.log(`${icon} ${name}`);
    });
    
    const allPassed = Object.values(results).every(v => v === true || v === null);
    
    if (allPassed) {
        console.log('\n🎉 All tests passed! Your Dolphin Anty setup is ready.');
    } else {
        console.log('\n⚠️  Some tests failed. Please fix the issues above.');
        console.log('\nNext steps:');
        console.log('1. Ensure Dolphin Anty is running');
        console.log('2. Create a profile in Dolphin Anty');
        console.log('3. Set DOLPHIN_ANTY_PROFILE_ID in .env.local');
        console.log('4. Set SCRAPER_MODE=dolphin in .env.local');
    }
    
    console.log('\n' + '='.repeat(50));
}

// Run tests
runTests().catch(error => {
    console.error('\n❌ Test script error:', error);
    process.exit(1);
});


