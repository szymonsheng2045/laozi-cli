import { readFileSync, writeFileSync, existsSync } from 'fs';
import { parse } from 'node-html-parser';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const LINKS_FILE = join(DATA_DIR, 'piyao-links.json');
const RESULT_FILE = join(DATA_DIR, 'piyao-dataset-v2.json');
const PROGRESS_FILE = join(DATA_DIR, 'scrape-progress.json');

const CONCURRENCY = 8;
const DELAY_MS = 200;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchPage(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i === retries) throw e;
      await sleep(1000 * (i + 1));
    }
  }
}

function parseArticle(html, meta) {
  const root = parse(html);
  const titleEl = root.querySelector('title');
  const pageTitle = titleEl ? titleEl.text.trim() : meta.title;
  
  // Get all paragraphs
  const allP = root.querySelectorAll('p');
  const paragraphs = allP.map(p => p.text.trim()).filter(t => t.length > 3);
  
  const results = [];
  
  // Pattern for combo articles: sections marked by "辟谣"/"科普"/"通报" followed by "详情："
  const sectionMarkers = ['辟谣', '科普', '通报'];
  
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    
    // Check if this paragraph starts a section
    const hasMarker = sectionMarkers.some(m => p.includes(m) && p.indexOf(m) < 10);
    
    if (hasMarker) {
      // Extract claim text (remove marker)
      let claimText = p;
      for (const m of sectionMarkers) {
        claimText = claimText.replace(new RegExp(`^\\s*${m}\\s*`, 'g'), '');
      }
      claimText = claimText.replace(/^\s+/, '').trim();
      
      // Look for truth in next paragraphs until next section or end
      const truthParts = [];
      for (let j = i + 1; j < paragraphs.length; j++) {
        const nextP = paragraphs[j];
        const isNextSection = sectionMarkers.some(m => nextP.includes(m) && nextP.indexOf(m) < 10);
        if (isNextSection) break;
        
        // Skip source/time meta paragraphs
        if (nextP.startsWith('来源：') && nextP.length < 80) continue;
        if (/^时间：/.test(nextP)) continue;
        if (/^中国互联网联合辟谣平台/.test(nextP)) continue;
        
        truthParts.push(nextP);
      }
      
      const truthText = truthParts.join('\n').trim();
      
      if (claimText && claimText.length > 5) {
        results.push({
          sourceUrl: meta.url,
          publishDate: meta.date,
          title: claimText,
          claim: claimText,
          truth: truthText,
          category: '今日辟谣',
          source: '中国互联网联合辟谣平台'
        });
      }
    }
  }
  
  // Fallback: if no sections found, treat as single article
  if (results.length === 0) {
    // Filter out meta paragraphs
    const contentParas = paragraphs.filter(p => {
      if (p.startsWith('来源：') && p.length < 80) return false;
      if (/^时间：/.test(p)) return false;
      if (/^中国互联网联合辟谣平台/.test(p)) return false;
      if (p === pageTitle) return false;
      return true;
    });
    
    const fullText = contentParas.join('\n');
    
    // Try to find truth marker
    const truthMarkers = ['真相：', '真相:', '详情：', '详情:', '实际情况：', '实际情况:', 
                          '事实上，', '事实是，', '经核实，', '经调查，', '官方回应：'];
    let truthText = '';
    for (const marker of truthMarkers) {
      const idx = fullText.indexOf(marker);
      if (idx >= 0) {
        truthText = fullText.substring(idx);
        break;
      }
    }
    
    const claimText = pageTitle.includes('今日辟谣') ? contentParas[0] || '' : pageTitle;
    
    results.push({
      sourceUrl: meta.url,
      publishDate: meta.date,
      title: pageTitle,
      claim: claimText || fullText.substring(0, 200),
      truth: truthText || fullText,
      category: '今日辟谣',
      source: '中国互联网联合辟谣平台'
    });
  }
  
  return results;
}

async function run() {
  const links = JSON.parse(readFileSync(LINKS_FILE, 'utf-8'));
  let progress = { done: [], results: [] };
  if (existsSync(PROGRESS_FILE)) {
    progress = JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8'));
  }
  
  const todo = links.filter(l => !progress.done.includes(l.url));
  console.log(`Already done: ${progress.done.length}, Remaining: ${todo.length}`);
  
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const batch = todo.slice(i, i + CONCURRENCY);
    const promises = batch.map(async (link) => {
      try {
        const html = await fetchPage(link.url);
        const entries = parseArticle(html, link);
        progress.done.push(link.url);
        progress.results.push(...entries);
        console.log(`[OK] ${link.title.substring(0, 40)} | entries: ${entries.length}`);
      } catch (e) {
        console.log(`[ERR] ${link.title.substring(0, 40)} | ${e.message}`);
        progress.done.push(link.url);
      }
    });
    
    await Promise.all(promises);
    await sleep(DELAY_MS);
    
    if (progress.done.length % 50 === 0) {
      writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
      console.log(`Progress saved: ${progress.done.length}/${links.length}`);
    }
  }
  
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
  writeFileSync(RESULT_FILE, JSON.stringify(progress.results, null, 2));
  
  console.log(`\nTotal entries: ${progress.results.length}`);
  const withTruth = progress.results.filter(r => r.truth && r.truth.length > 20).length;
  console.log(`With truth (>20 chars): ${withTruth}`);
  console.log(`With truth (>100 chars): ${progress.results.filter(r => r.truth && r.truth.length > 100).length}`);
}

run().catch(console.error);
