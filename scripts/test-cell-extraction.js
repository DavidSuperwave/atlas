/**
 * Test Cell Extraction - Paste this into browser console on Apollo search results page
 * This tests the UPDATED cell indices from our fix:
 * - Cell 9: Location
 * - Cell 10: Company size
 * - Cell 11: Industry
 * - Cell 12: Keywords
 */
(function() {
  console.log('='.repeat(60));
  console.log('Testing Updated Cell Extraction');
  console.log('='.repeat(60));

  // Find the table
  const table = document.querySelector('div[role="treegrid"]') || document.querySelector('table[role="grid"]');
  if (!table) {
    console.error('❌ No table found!');
    return;
  }
  console.log('✓ Table found');

  // Find data rows
  const allRows = table.querySelectorAll('[role="row"], tr');
  let dataRows = [];
  
  for (const row of allRows) {
    // Skip header rows
    if (row.querySelector('[role="columnheader"], th')) continue;
    // Check for checkbox (data row indicator)
    if (!row.querySelector('input[type="checkbox"]')) continue;
    dataRows.push(row);
  }
  
  console.log(`Found ${dataRows.length} data rows`);
  
  if (dataRows.length === 0) {
    console.error('❌ No data rows found!');
    return;
  }

  // Test first 3 rows
  const testCount = Math.min(3, dataRows.length);
  
  for (let i = 0; i < testCount; i++) {
    const row = dataRows[i];
    const cells = row.querySelectorAll('[role="gridcell"]');
    
    console.log(`\n--- Row ${i + 1} (${cells.length} cells) ---`);
    
    // Semantic selectors (these should work)
    const personLink = row.querySelector('a[href*="/people/"]');
    const websiteLink = row.querySelector('a[aria-label="website link"]');
    const companyLink = row.querySelector('a[href*="/organization"]');
    const personLinkedin = row.querySelector('a[href*="linkedin.com/in/"]');
    const companyLinkedin = row.querySelector('a[href*="linkedin.com/company/"]');
    
    console.log('Semantic Selectors:');
    console.log('  Name:', personLink?.textContent?.trim() || '(not found)');
    console.log('  Company:', companyLink?.textContent?.trim() || '(not found)');
    console.log('  Website:', websiteLink?.getAttribute('href') || websiteLink?.getAttribute('data-href') || '(not found)');
    console.log('  Person LinkedIn:', personLinkedin?.href || '(not found)');
    console.log('  Company LinkedIn:', companyLinkedin?.href || '(not found)');
    
    // Cell-based extraction (UPDATED indices)
    console.log('\nCell-based Extraction (UPDATED):');
    console.log('  Cell 2 (Title):', cells[2]?.textContent?.trim() || '(empty)');
    console.log('  Cell 9 (Location):', cells[9]?.textContent?.trim() || '(empty)');
    console.log('  Cell 10 (Company Size):', cells[10]?.textContent?.trim() || '(empty)');
    console.log('  Cell 11 (Industry):', cells[11]?.textContent?.trim() || '(empty)');
    console.log('  Cell 12 (Keywords):', cells[12]?.textContent?.trim() || '(empty)');
    
    // Verify we're getting real data
    const location = cells[9]?.textContent?.trim();
    const companySize = cells[10]?.textContent?.trim();
    const industry = cells[11]?.textContent?.trim();
    
    if (location && companySize && industry) {
      console.log('\n✓ Cell extraction working correctly!');
    } else {
      console.log('\n⚠ Some cells may be empty - check if columns are visible in Apollo');
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Test Complete');
  console.log('='.repeat(60));
})();

