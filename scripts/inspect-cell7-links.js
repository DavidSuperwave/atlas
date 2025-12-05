/**
 * Inspect Cell 7 links to find website selector
 * Paste this into browser console
 */

(function() {
    const table = document.querySelector('div[role="treegrid"]');
    if (!table) {
        console.error('No table found');
        return;
    }
    
    const rows = table.querySelectorAll('[role="row"]');
    let dataRowCount = 0;
    
    for (const row of rows) {
        if (row.querySelector('[role="columnheader"], th')) continue;
        if (!row.querySelector('input[type="checkbox"]')) continue;
        
        dataRowCount++;
        if (dataRowCount > 2) break;
        
        const cells = row.querySelectorAll('[role="gridcell"]');
        if (cells.length < 8) continue;
        
        const cell7 = cells[7];
        const links = cell7.querySelectorAll('a');
        
        console.log(`\n--- Row ${dataRowCount} - Cell 7 Links (${links.length} links) ---`);
        
        Array.from(links).forEach((link, i) => {
            const href = link.getAttribute('href') || link.getAttribute('data-href') || '';
            const ariaLabel = link.getAttribute('aria-label') || '';
            const title = link.getAttribute('title') || '';
            const text = link.textContent?.trim() || '';
            const classes = link.getAttribute('class') || '';
            
            console.log(`\n  Link ${i + 1}:`);
            console.log(`    href: ${href.substring(0, 80)}`);
            console.log(`    aria-label: ${ariaLabel || '(none)'}`);
            console.log(`    title: ${title || '(none)'}`);
            console.log(`    text: ${text || '(empty)'}`);
            console.log(`    class: ${classes.substring(0, 60) || '(none)'}`);
            
            // Check if it's a website link
            if (href && !href.includes('apollo.io') && !href.includes('linkedin.com') && 
                !href.includes('twitter.com') && !href.includes('facebook.com')) {
                console.log(`    >>> POTENTIAL WEBSITE LINK!`);
            }
        });
        
        // Also check all links in the row for website
        console.log(`\n  All website-like links in row:`);
        const allLinks = row.querySelectorAll('a[href^="http"]');
        Array.from(allLinks).forEach(link => {
            const href = link.getAttribute('href') || link.getAttribute('data-href') || '';
            if (href && !href.includes('apollo.io') && !href.includes('linkedin.com') && 
                !href.includes('twitter.com') && !href.includes('facebook.com') &&
                !href.includes('google.com') && !href.includes('instagram.com')) {
                const ariaLabel = link.getAttribute('aria-label') || '';
                console.log(`    ${href.substring(0, 60)} (aria-label: ${ariaLabel || 'none'})`);
            }
        });
    }
    
    console.log('\n' + '='.repeat(60));
})();

