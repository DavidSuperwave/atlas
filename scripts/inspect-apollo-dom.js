/**
 * Inspect Apollo DOM structure using browser console
 * This will be run in the browser context
 */

// Find the table
const table = document.querySelector('div[role="treegrid"]') || 
              document.querySelector('table[role="grid"]') ||
              document.querySelector('table');

if (!table) {
    console.error('No table found!');
} else {
    console.log('✓ Table found');
    
    // Get all rows
    const allRows = table.querySelectorAll('[role="row"], tr');
    console.log(`Total rows: ${allRows.length}`);
    
    // Test cell selectors
    const gridcells = table.querySelectorAll('[role="gridcell"]');
    const divCells = table.querySelectorAll('div[role="cell"]');
    const roleCells = table.querySelectorAll('[role="cell"]');
    const tdCells = table.querySelectorAll('td');
    
    console.log('\n[CELL SELECTOR TEST]');
    console.log(`  [role="gridcell"]:    ${gridcells.length} cells`);
    console.log(`  div[role="cell"]:     ${divCells.length} cells`);
    console.log(`  [role="cell"]:        ${roleCells.length} cells`);
    console.log(`  td:                   ${tdCells.length} cells`);
    
    const bestSelector = gridcells.length > 0 ? '[role="gridcell"]' :
                         divCells.length > 0 ? 'div[role="cell"]' :
                         roleCells.length > 0 ? '[role="cell"]' : 'td';
    console.log(`\n  >> Best selector: ${bestSelector}`);
    
    // Analyze first 2 data rows
    console.log('\n[SAMPLE ROWS ANALYSIS]');
    let dataRowCount = 0;
    
    for (const row of allRows) {
        // Skip header rows
        if (row.querySelector('[role="columnheader"], th')) continue;
        
        // Check for checkbox (data row indicator)
        const hasCheckbox = !!row.querySelector('input[type="checkbox"]');
        if (!hasCheckbox) continue;
        
        dataRowCount++;
        if (dataRowCount > 2) break;
        
        // Get cells using best selector
        const cells = gridcells.length > 0 ? row.querySelectorAll('[role="gridcell"]') :
                      divCells.length > 0 ? row.querySelectorAll('div[role="cell"]') :
                      roleCells.length > 0 ? row.querySelectorAll('[role="cell"]') :
                      row.querySelectorAll('td');
        
        console.log(`\n  --- Row ${dataRowCount} (${cells.length} cells) ---`);
        
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
        Array.from(cells).forEach((cell, index) => {
            const text = cell.textContent?.trim() || '';
            const links = cell.querySelectorAll('a');
            const linkCount = links.length;
            const linkInfo = linkCount > 0 ? ` [${linkCount} link${linkCount > 1 ? 's' : ''}]` : '';
            console.log(`    Cell ${index.toString().padStart(2)}: ${text.substring(0, 50)}${linkInfo}`);
        });
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`\nBest cell selector: ${bestSelector}`);
    console.log(`Cells per row: ${cells.length}`);
    console.log(`\nSemantic selectors working:`);
    console.log(`  ✓ a[href*="/people/"]: ${personLink ? 'YES' : 'NO'}`);
    console.log(`  ✓ a[aria-label="website link"]: ${websiteLink ? 'YES' : 'NO'}`);
    console.log(`  ✓ a[href*="/organizations/"]: ${companyLink ? 'YES' : 'NO'}`);
}

