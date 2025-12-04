#!/usr/bin/env node

/**
 * Test Cloud Mode via API Endpoint
 * 
 * This tests the full scraping flow through the API,
 * exactly as it would work on Railway.
 * 
 * Usage:
 *   node scripts/test-cloud-api-scrape.js
 */

const TEST_URL = process.argv[2] || 'https://app.apollo.io/#/people?page=1&qSearchListId=6930bdb66179090019aa3780&prospectedByCurrentTeam[]=no&sortAscending=false&sortByField=%5Bnone%5D';

// Railway or local API URL
const API_URL = process.env.RAILWAY_API_URL || 'http://localhost:3000';

async function main() {
    console.log('\n========================================');
    console.log('Cloud Mode - API Scrape Test');
    console.log('========================================\n');
    
    console.log('Test URL:', TEST_URL);
    console.log('API URL:', API_URL);
    console.log('');
    
    try {
        // Submit scrape request
        console.log('Submitting scrape request...');
        const response = await fetch(`${API_URL}/api/scrape`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url: TEST_URL,
                pages: 1
            })
        });
        
        const result = await response.json();
        
        console.log('Response status:', response.status);
        console.log('Response:', JSON.stringify(result, null, 2));
        
        if (response.status === 202) {
            console.log('\n✓ Scrape queued successfully!');
            console.log('Queue ID:', result.queueId);
            console.log('Position:', result.position);
            
            // Poll for status
            if (result.queueId) {
                console.log('\nPolling for status...');
                let attempts = 0;
                const maxAttempts = 30;
                
                while (attempts < maxAttempts) {
                    await new Promise(r => setTimeout(r, 5000));
                    attempts++;
                    
                    const statusResponse = await fetch(`${API_URL}/api/scrape/${result.queueId}/status`);
                    const status = await statusResponse.json();
                    
                    console.log(`[${attempts}/${maxAttempts}] Status: ${status.status}`);
                    
                    if (status.status === 'completed') {
                        console.log('\n✅ SCRAPE COMPLETED');
                        console.log('Pages scraped:', status.pages_scraped);
                        console.log('Leads found:', status.leads_found);
                        break;
                    } else if (status.status === 'failed') {
                        console.log('\n❌ SCRAPE FAILED');
                        console.log('Error:', status.error);
                        break;
                    }
                }
            }
        } else if (response.status === 200) {
            console.log('\n✓ Scrape completed (sync mode)');
            console.log('Leads found:', result.leads?.length || 0);
            
            if (result.leads?.length > 0) {
                console.log('\n--- Sample Leads ---');
                result.leads.slice(0, 5).forEach((lead, i) => {
                    console.log(`${i + 1}. ${lead.firstName} ${lead.lastName}`);
                    if (lead.title) console.log(`   Title: ${lead.title}`);
                    if (lead.company) console.log(`   Company: ${lead.company}`);
                });
                console.log('-------------------\n');
            }
        } else {
            console.log('\n❌ Scrape request failed');
        }
        
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main();

