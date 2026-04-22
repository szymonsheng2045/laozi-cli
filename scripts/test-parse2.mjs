import { parse } from 'node-html-parser';

async function fetchPage(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  return await res.text();
}

function parseArticle(html, meta) {
  const root = parse(html);
  const titleEl = root.querySelector('title');
  const pageTitle = titleEl ? titleEl.text.trim() : meta.title;
  
  const allP = root.querySelectorAll('p');
  const paragraphs = allP.map(p => p.text.trim()).filter(t => t.length > 3);
  
  const results = [];
  const sectionMarkers = ['辟 谣', '科 普', '通 报'];
  
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const hasMarker = sectionMarkers.some(m => p.includes(m) && p.indexOf(m) < 10);
    
    if (hasMarker) {
      let claimText = p;
      for (const m of sectionMarkers) {
        claimText = claimText.replace(new RegExp(`^\\s*${m.replace(/\s/g, '\\s*')}\\s*`, 'g'), '');
      }
      claimText = claimText.replace(/^\s+/, '').trim();
      
      const truthParts = [];
      for (let j = i + 1; j < paragraphs.length; j++) {
        const nextP = paragraphs[j];
        const isNextSection = sectionMarkers.some(m => nextP.includes(m) && nextP.indexOf(m) < 10);
        if (isNextSection) break;
        if (nextP.startsWith('来源：') && nextP.length < 80) continue;
        if (/^时间：/.test(nextP)) continue;
        truthParts.push(nextP);
      }
      
      const truthText = truthParts.join('\n').trim();
      
      if (claimText && claimText.length > 5) {
        results.push({ claim: claimText, truth: truthText.substring(0, 200) + (truthText.length > 200 ? '...' : '') });
      }
    }
  }
  
  return results;
}

async function main() {
  const url = 'https://www.piyao.org.cn/20260422/084fe0e7020a49588fc988bbb3088a6e/c.html';
  const html = await fetchPage(url);
  const results = parseArticle(html, { url, title: '', date: '' });
  
  console.log(`Extracted ${results.length} entries:\n`);
  for (const r of results) {
    console.log('Claim:', r.claim);
    console.log('Truth:', r.truth);
    console.log('---');
  }
}

main().catch(console.error);
