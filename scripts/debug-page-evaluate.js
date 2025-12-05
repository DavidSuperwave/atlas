/**
 * Debug Script: Test page.evaluate() extraction locally
 * 
 * This script connects to your local Chrome browser (with Apollo open)
 * and runs page.evaluate() to map out the actual DOM structure.
 * 
 * USAGE:
 * 1. Start Chrome with: chrome.exe --remote-debugging-port=9222
 * 2. Navigate to Apollo and open a search results page
 * 3. Run: node scripts/debug-page-evaluate.js
 * 
 * This will output:
 * - What selectors find data
 * - Exact cell indices and their content
 * - Comparison between different selector approaches
 */

const puppeteer = require('puppeteer');

async function debugApolloExtraction() {
    console.log('='.repeat(60));
    console.log('Apollo page.evaluate() Debug Script');
    console.log('='.repeat(60));
    
    let browser;
    try {
        console.log('\n[1] Connecting to Chrome on port 9222...');
        browser = await puppeteer.connect({ 
            browserURL: 'http://127.0.0.1:9222',
            defaultViewport: null
        });
        console.log('    ✓ Connected to Chrome');
        
        // Find Apollo page
        const pages = await browser.pages();
        const apolloPage = pages.find(p => p.url().includes('apollo.io'));
        
        if (!apolloPage) {
            console.log('\n    ✗ No Apollo page found!');
            console.log('    Please open Apollo in Chrome and navigate to a search results page.');
            console.log('    Current pages:', pages.map(p => p.url()).join('\n      '));
            return;
        }
        
        console.log(`    ✓ Found Apollo page: ${apolloPage.url().substring(0, 80)}...`);
        
        console.log('\n[2] Running page.evaluate() to analyze DOM structure...');
        
        const debug = await apolloPage.evaluate(() => {
            const results = {
                // Table detection
                table: {
                    treegridFound: !!document.querySelector('div[role="treegrid"]'),
                    tableGridFound: !!document.querySelector('table[role="grid"]'),
                    tableFound: !!document.querySelector('table')
                },
                
                // Row detection
                rows: {
                    treegridRows: document.querySelectorAll('div[role="treegrid"] div[role="row"]').length,
                    roleRows: document.querySelectorAll('[role="row"]').length,
                    trRows: document.querySelectorAll('tr').length
                },
                
                // Cell selector comparison
                cellSelectors: {
                    gridcell: 0,
                    roleCell: 0,
                    divRoleCell: 0,
                    td: 0
                },
                
                // Sample row analysis
                sampleRows: [],
                
                // Semantic selector tests
                semanticSelectors: {
                    personLinks: [],
                    websiteLinks: [],
                    companyLinks: [],
                    linkedinLinks: []
                }
            };
            
            // Find the table
            const table = document.querySelector('div[role="treegrid"]') ||
                          document.querySelector('table[role="grid"]') ||
                          document.querySelector('table');
            
            if (!table) {
                results.error = 'No table found!';
                return results;
            }
            
            // Get all rows
            const allRows = table.querySelectorAll('[role="row"], tr');
            
            // Analyze first 3 data rows
            let dataRowCount = 0;
            for (const row of allRows) {
                // Skip header rows
                if (row.querySelector('[role="columnheader"], th')) continue;
                
                // Check for checkbox (data row indicator)
                const hasCheckbox = !!row.querySelector('input[type="checkbox"]');
                if (!hasCheckbox) continue;
                
                dataRowCount++;
                if (dataRowCount > 3) break; // Only analyze first 3 rows
                
                // Test different cell selectors
                const gridcells = row.querySelectorAll('[role="gridcell"]');
                const roleCells = row.querySelectorAll('[role="cell"]');
                const divRoleCells = row.querySelectorAll('div[role="cell"]');
                const tdCells = row.querySelectorAll('td');
                
                // Use the one that finds cells
                const cells = gridcells.length > 0 ? gridcells :
                              divRoleCells.length > 0 ? divRoleCells :
                              roleCells.length > 0 ? roleCells : tdCells;
                
                // Update cell selector counts
                if (dataRowCount === 1) {
                    results.cellSelectors.gridcell = gridcells.length;
                    results.cellSelectors.roleCell = roleCells.length;
                    results.cellSelectors.divRoleCell = divRoleCells.length;
                    results.cellSelectors.td = tdCells.length;
                }
                
                // Map cell contents
                const cellData = Array.from(cells).map((cell, index) => {
                    const text = cell.textContent?.trim() || '';
                    const links = cell.querySelectorAll('a');
                    const linkInfo = Array.from(links).map(a => ({
                        text: a.textContent?.trim().substring(0, 30) || '',
                        href: a.getAttribute('href')?.substring(0, 50) || '',
                        ariaLabel: a.getAttribute('aria-label') || ''
                    }));
                    
                    return {
                        index,
                        text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
                        linkCount: links.length,
                        links: linkInfo.slice(0, 3) // First 3 links only
                    };
                });
                
                // Test semantic selectors on this row
                const personLink = row.querySelector('a[href*="/people/"]');
                const websiteLink = row.querySelector('a[aria-label="website link"]');
                const companyLink = row.querySelector('a[href*="/organizations/"]') ||
                                   row.querySelector('a[href*="/accounts/"]');
                const linkedinCompany = row.querySelector('a[href*="linkedin.com/company"]');
                const linkedinPerson = row.querySelector('a[href*="linkedin.com/in/"]');
                
                results.sampleRows.push({
                    rowNumber: dataRowCount,
                    cellCount: cells.length,
                    cellSelectorUsed: gridcells.length > 0 ? '[role="gridcell"]' :
                                      divRoleCells.length > 0 ? 'div[role="cell"]' :
                                      roleCells.length > 0 ? '[role="cell"]' : 'td',
                    cells: cellData,
                    semanticFinds: {
                        personName: personLink?.textContent?.trim() || null,
                        personHref: personLink?.getAttribute('href') || null,
                        websiteHref: websiteLink?.getAttribute('href') || websiteLink?.getAttribute('data-href') || null,
                        companyName: companyLink?.textContent?.trim() || null,
                        linkedinCompany: linkedinCompany?.getAttribute('href') || null,
                        linkedinPerson: linkedinPerson?.getAttribute('href') || null
                    }
                });
                
                // Collect all semantic finds for summary
                if (personLink) {
                    results.semanticSelectors.personLinks.push(personLink.textContent?.trim());
                }
                if (websiteLink) {
                    results.semanticSelectors.websiteLinks.push(websiteLink.getAttribute('href') || websiteLink.getAttribute('data-href'));
                }
                if (companyLink) {
                    results.semanticSelectors.companyLinks.push(companyLink.textContent?.trim());
                }
            }
            
            return results;
        });
        
        // Output results
        console.log('\n' + '='.repeat(60));
        console.log('RESULTS');
        console.log('='.repeat(60));
        
        // Table detection
        console.log('\n[TABLE DETECTION]');
        console.log(`  div[role="treegrid"]: ${debug.table.treegridFound ? '✓ FOUND' : '✗ not found'}`);
        console.log(`  table[role="grid"]:   ${debug.table.tableGridFound ? '✓ FOUND' : '✗ not found'}`);
        console.log(`  table:                ${debug.table.tableFound ? '✓ FOUND' : '✗ not found'}`);
        
        // Row detection
        console.log('\n[ROW DETECTION]');
        console.log(`  div[role="treegrid"] div[role="row"]: ${debug.rows.treegridRows} rows`);
        console.log(`  [role="row"]:                         ${debug.rows.roleRows} rows`);
        console.log(`  tr:                                   ${debug.rows.trRows} rows`);
        
        // Cell selector comparison
        console.log('\n[CELL SELECTOR COMPARISON] (first data row)');
        console.log(`  [role="gridcell"]:    ${debug.cellSelectors.gridcell} cells`);
        console.log(`  [role="cell"]:        ${debug.cellSelectors.roleCell} cells`);
        console.log(`  div[role="cell"]:     ${debug.cellSelectors.divRoleCell} cells`);
        console.log(`  td:                   ${debug.cellSelectors.td} cells`);
        
        const bestCellSelector = debug.cellSelectors.gridcell > 0 ? '[role="gridcell"]' :
                                 debug.cellSelectors.divRoleCell > 0 ? 'div[role="cell"]' :
                                 debug.cellSelectors.roleCell > 0 ? '[role="cell"]' : 'td';
        console.log(`  >> Best selector: ${bestCellSelector}`);
        
        // Sample rows analysis
        console.log('\n[SAMPLE ROWS ANALYSIS]');
        for (const row of debug.sampleRows) {
            console.log(`\n  --- Row ${row.rowNumber} (${row.cellCount} cells, using ${row.cellSelectorUsed}) ---`);
            
            // Semantic finds
            console.log('  Semantic Selectors Found:');
            console.log(`    Person Name:      ${row.semanticFinds.personName || '(not found)'}`);
            console.log(`    Person Href:      ${row.semanticFinds.personHref || '(not found)'}`);
            console.log(`    Website Href:     ${row.semanticFinds.websiteHref || '(not found)'}`);
            console.log(`    Company Name:     ${row.semanticFinds.companyName || '(not found)'}`);
            console.log(`    LinkedIn Company: ${row.semanticFinds.linkedinCompany || '(not found)'}`);
            console.log(`    LinkedIn Person:  ${row.semanticFinds.linkedinPerson || '(not found)'}`);
            
            // Cell contents
            console.log('\n  Cell Contents:');
            for (const cell of row.cells) {
                const linkInfo = cell.linkCount > 0 ? ` [${cell.linkCount} links]` : '';
                console.log(`    Cell ${cell.index.toString().padStart(2)}: ${cell.text}${linkInfo}`);
            }
        }
        
        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('SUMMARY');
        console.log('='.repeat(60));
        console.log(`\nPerson links found:  ${debug.semanticSelectors.personLinks.length}`);
        console.log(`Website links found: ${debug.semanticSelectors.websiteLinks.length}`);
        console.log(`Company links found: ${debug.semanticSelectors.companyLinks.length}`);
        
        if (debug.semanticSelectors.websiteLinks.length === 0) {
            console.log('\n⚠️  WARNING: No website links found with a[aria-label="website link"]');
            console.log('   This is likely why GoLogin scraper is failing!');
            console.log('   Check if the website link has a different aria-label or selector.');
        }
        
        // Recommendations
        console.log('\n' + '='.repeat(60));
        console.log('RECOMMENDATIONS FOR GOLOGIN SCRAPER');
        console.log('='.repeat(60));
        console.log(`\n1. Use cell selector: ${bestCellSelector}`);
        console.log(`2. Total cells per row: ${debug.sampleRows[0]?.cellCount || 'unknown'}`);
        
        if (debug.sampleRows[0]) {
            console.log('\n3. Cell index mapping (based on content):');
            for (const cell of debug.sampleRows[0].cells) {
                if (cell.text || cell.linkCount > 0) {
                    console.log(`   Cell ${cell.index}: ${cell.text.substring(0, 40) || `(${cell.linkCount} links)`}`);
                }
            }
        }
        
        console.log('\n4. Semantic selectors status:');
        console.log(`   - a[href*="/people/"]:           ${debug.semanticSelectors.personLinks.length > 0 ? '✓ WORKS' : '✗ NOT WORKING'}`);
        console.log(`   - a[aria-label="website link"]:  ${debug.semanticSelectors.websiteLinks.length > 0 ? '✓ WORKS' : '✗ NOT WORKING'}`);
        console.log(`   - a[href*="/organizations/"]:    ${debug.semanticSelectors.companyLinks.length > 0 ? '✓ WORKS' : '✗ NOT WORKING'}`);
        
    } catch (error) {
        console.error('\n✗ Error:', error.message);
        if (error.message.includes('ECONNREFUSED')) {
            console.log('\n  Chrome is not running with debugging enabled.');
            console.log('  Start Chrome with: chrome.exe --remote-debugging-port=9222');
        }
    } finally {
        if (browser) {
            await browser.disconnect();
            console.log('\n[Done] Browser disconnected');
        }
    }
}

// Run the debug script
debugApolloExtraction().catch(console.error);

