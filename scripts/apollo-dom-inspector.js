/**
 * Apollo DOM Inspector - Paste this into browser console on Apollo search results page
 * 
 * Copy the entire contents of this file and paste into browser console (F12)
 * It will output detailed analysis of the table structure
 */

(function() {
    console.log('='.repeat(60));
    console.log('Apollo DOM Inspector');
    console.log('='.repeat(60));
    
    // Find the table
    const table = document.querySelector('div[role="treegrid"]') || 
                  document.querySelector('table[role="grid"]') ||
                  document.querySelector('table');
    
    if (!table) {
        console.error('✗ No table found!');
        return;
    }
    
    console.log('✓ Table found\n');
    
    // Get all rows
    const allRows = table.querySelectorAll('[role="row"], tr');
    console.log(`Total rows: ${allRows.length}`);
    
    // Test cell selectors on first data row
    let firstDataRow = null;
    for (const row of allRows) {
        if (row.querySelector('[role="columnheader"], th')) continue;
        if (row.querySelector('input[type="checkbox"]')) {
            firstDataRow = row;
            break;
        }
    }
    
    if (!firstDataRow) {
        console.error('✗ No data rows found!');
        return;
    }
    
    const gridcells = firstDataRow.querySelectorAll('[role="gridcell"]');
    const divCells = firstDataRow.querySelectorAll('div[role="cell"]');
    const roleCells = firstDataRow.querySelectorAll('[role="cell"]');
    const tdCells = firstDataRow.querySelectorAll('td');
    
    console.log('\n[CELL SELECTOR TEST] (first data row)');
    console.log(`  [role="gridcell"]:    ${gridcells.length} cells`);
    console.log(`  div[role="cell"]:     ${divCells.length} cells`);
    console.log(`  [role="cell"]:        ${roleCells.length} cells`);
    console.log(`  td:                   ${tdCells.length} cells`);
    
    const bestSelector = gridcells.length > 0 ? '[role="gridcell"]' :
                         divCells.length > 0 ? 'div[role="cell"]' :
                         roleCells.length > 0 ? '[role="cell"]' : 'td';
    console.log(`\n  >> Best selector: ${bestSelector}`);
    
    // Use best selector
    const cells = gridcells.length > 0 ? gridcells :
                  divCells.length > 0 ? divCells :
                  roleCells.length > 0 ? roleCells : tdCells;
    
    // Analyze first 2 data rows
    console.log('\n[SAMPLE ROWS ANALYSIS]');
    let dataRowCount = 0;
    
    for (const row of allRows) {
        if (row.querySelector('[role="columnheader"], th')) continue;
        if (!row.querySelector('input[type="checkbox"]')) continue;
        
        dataRowCount++;
        if (dataRowCount > 2) break;
        
        const rowCells = gridcells.length > 0 ? row.querySelectorAll('[role="gridcell"]') :
                         divCells.length > 0 ? row.querySelectorAll('div[role="cell"]') :
                         roleCells.length > 0 ? row.querySelectorAll('[role="cell"]') :
                         row.querySelectorAll('td');
        
        console.log(`\n  --- Row ${dataRowCount} (${rowCells.length} cells) ---`);
        
        // Test semantic selectors
        const personLink = row.querySelector('a[href*="/people/"]');
        const websiteLink = row.querySelector('a[aria-label="website link"]');
        const companyLink = row.querySelector('a[href*="/organizations/"]') ||
                           row.querySelector('a[href*="/accounts/"]');
        const linkedinCompany = row.querySelector('a[href*="linkedin.com/company"]');
        const linkedinPerson = row.querySelector('a[href*="linkedin.com/in/"]');
        
        console.log('  Semantic Selectors:');
        console.log(`    Person Name:      ${personLink?.textContent?.trim() || '(not found)'}`);
        console.log(`    Person Href:      ${personLink?.getAttribute('href')?.substring(0, 60) || '(not found)'}`);
        console.log(`    Website Href:     ${websiteLink?.getAttribute('href') || websiteLink?.getAttribute('data-href') || '(not found)'}`);
        console.log(`    Company Name:     ${companyLink?.textContent?.trim() || '(not found)'}`);
        console.log(`    LinkedIn Company: ${linkedinCompany?.getAttribute('href')?.substring(0, 60) || '(not found)'}`);
        console.log(`    LinkedIn Person:  ${linkedinPerson?.getAttribute('href')?.substring(0, 60) || '(not found)'}`);
        
        // Map cell contents
        console.log('\n  Cell Contents:');
        Array.from(rowCells).forEach((cell, index) => {
            const text = cell.textContent?.trim() || '';
            const links = cell.querySelectorAll('a');
            const linkCount = links.length;
            const linkInfo = linkCount > 0 ? ` [${linkCount} link${linkCount > 1 ? 's' : ''}]` : '';
            const displayText = text.substring(0, 50) + (text.length > 50 ? '...' : '');
            console.log(`    Cell ${index.toString().padStart(2)}: ${displayText || '(empty)'}${linkInfo}`);
        });
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('RECOMMENDATIONS FOR GOLOGIN SCRAPER');
    console.log('='.repeat(60));
    console.log(`\n1. Use cell selector: ${bestSelector}`);
    console.log(`2. Total cells per row: ${cells.length}`);
    
    const personLink = firstDataRow.querySelector('a[href*="/people/"]');
    const websiteLink = firstDataRow.querySelector('a[aria-label="website link"]');
    const companyLink = firstDataRow.querySelector('a[href*="/organizations/"]');
    
    console.log(`\n3. Semantic selectors status:`);
    console.log(`   - a[href*="/people/"]:           ${personLink ? '✓ WORKS' : '✗ NOT WORKING'}`);
    console.log(`   - a[aria-label="website link"]:  ${websiteLink ? '✓ WORKS' : '✗ NOT WORKING'}`);
    console.log(`   - a[href*="/organizations/"]:   ${companyLink ? '✓ WORKS' : '✗ NOT WORKING'}`);
    
    console.log('\n' + '='.repeat(60));
})();

