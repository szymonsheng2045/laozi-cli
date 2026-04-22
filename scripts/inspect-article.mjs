import { parse } from 'node-html-parser';

const url = 'https://www.piyao.org.cn/20260422/084fe0e7020a49588fc988bbb3088a6e/c.html';
const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
const html = await res.text();

const root = parse(html);

// Look for article content by checking all paragraphs
const allP = root.querySelectorAll('p');
console.log('Total p tags in entire doc:', allP.length);

// Print first 20 paragraphs with content
let count = 0;
for (const p of allP) {
  const t = p.text.trim();
  if (t.length > 5 && count < 20) {
    console.log(`p[${count}]: ${t.substring(0, 120)}`);
    count++;
  }
}

// Also look for specific content markers
console.log('\n--- Contains truth markers? ---');
const truthWords = ['真相', '辟谣', '不实', '经核实', '实际'];
for (const w of truthWords) {
  if (html.includes(w)) console.log(`Found: ${w}`);
}
