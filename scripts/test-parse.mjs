import { readFileSync } from 'fs';
import { parse } from 'node-html-parser';

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
  });
  return await res.text();
}

function extractClaims(html, meta) {
  const root = parse(html);
  const titleEl = root.querySelector('h1');
  const title = titleEl ? titleEl.text.trim() : meta.title;
  
  const article = root.querySelector('#article, .detailContent, .news-content, .conTxt, #content');
  if (!article) return [{ title, claim: title, truth: '', note: 'no_content' }];
  
  // Get all text segments with their element info
  const segments = [];
  function walk(node, depth = 0) {
    if (node.nodeType === 3) {
      const t = node.text.trim();
      if (t.length > 2) segments.push({ text: t, depth, tag: node.parentNode?.tagName });
    }
    if (node.childNodes) {
      for (const child of node.childNodes) walk(child, depth + 1);
    }
  }
  walk(article);
  
  const fullText = segments.map(s => s.text).join('\n');
  
  // Find claim headers: strong/b tags with claim-like text
  const strongs = article.querySelectorAll('strong, b');
  const headers = [];
  for (const s of strongs) {
    const t = s.text.trim();
    if (t.length >= 5 && t.length <= 120) {
      headers.push({ text: t, el: s });
    }
  }
  
  const results = [];
  
  if (headers.length >= 2) {
    // Multi-claim article (like "今日辟谣" combo)
    const allTexts = segments.map(s => s.text);
    for (let i = 0; i < headers.length; i++) {
      const claimText = headers[i].text;
      const startIdx = allTexts.indexOf(claimText);
      const nextClaim = headers[i + 1]?.text;
      let endIdx = nextClaim ? allTexts.indexOf(nextClaim, startIdx + 1) : allTexts.length;
      if (endIdx < 0) endIdx = allTexts.length;
      
      const truthParts = allTexts.slice(startIdx + 1, endIdx);
      const truthText = truthParts.join('\n').trim();
      
      results.push({
        title: claimText,
        claim: claimText,
        truth: truthText,
        sourceUrl: meta.url,
        publishDate: meta.date
      });
    }
  } else {
    // Single claim article
    const truthMarkers = ['真相：', '真相:', '辟谣：', '辟谣:', '实际情况：', '实际情况:', 
                          '事实上，', '事实是，', '经核实，', '经调查，', '官方回应：', 
                          '专家介绍，', '医学科普：', '科学解读：'];
    let truthText = '';
    for (const marker of truthMarkers) {
      const idx = fullText.indexOf(marker);
      if (idx >= 0) {
        truthText = fullText.substring(idx);
        break;
      }
    }
    
    results.push({
      title,
      claim: title.includes('今日辟谣') ? '' : title,
      truth: truthText,
      sourceUrl: meta.url,
      publishDate: meta.date
    });
  }
  
  return results;
}

async function main() {
  const links = JSON.parse(readFileSync('data/piyao-links.json', 'utf-8'));
  
  // Test first 10 articles
  for (let i = 0; i < 10; i++) {
    const link = links[i];
    try {
      const html = await fetchPage(link.url);
      const claims = extractClaims(html, link);
      console.log(`\n=== ${link.title} ===`);
      for (const c of claims) {
        console.log(`Claim: ${c.claim.substring(0, 60)}`);
        console.log(`Truth: ${c.truth.substring(0, 120)}...`);
        console.log('---');
      }
    } catch (e) {
      console.log(`ERR ${link.title}: ${e.message}`);
    }
  }
}

main().catch(console.error);
