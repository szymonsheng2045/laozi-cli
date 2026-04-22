import { readFileSync } from 'fs';

// Test data loading
const data = JSON.parse(readFileSync('data/piyao-entries.json', 'utf-8'));
console.log('Total entries:', data.length);
console.log('First entry claim:', data[0].claim.substring(0, 60));
console.log('First entry truth length:', data[0].truth.length);

// Test keyword extraction logic
function extractKeywords(text) {
  const cleaned = text
    .replace(/[\s\u3000\n\r\t]+/g, " ")
    .replace(/[\uff0c\u3002\uff1f\uff01\uff1b\uff1a""''\uff08\uff09\u3010\u3011\[\]\(\)!?;:,.]/g, " ")
    .trim();
  
  const words = cleaned.split(/\s+/).filter(w => w.length >= 2);
  
  const stopWords = new Set([
    "\u6211", "\u4f60", "\u4ed6", "\u5979", "\u5b83", "\u4eec", "\u7684", "\u662f", "\u4e86", "\u5728", "\u6709", "\u548c", "\u4e0e", "\u5bf9", "\u8fd9", "\u90a3",
    "\u4e00", "\u4e2a", "\u4e0d", "\u4eba", "\u4e3a", "\u4ee5", "\u53ef", "\u80fd", "\u4f46", "\u6765", "\u5230", "\u8bf4", "\u8981", "\u4f1a", "\u8fd8", "\u800c",
    "\u4e8e", "\u88ab", "\u628a", "\u7ed9", "\u8ba9", "\u5411", "\u4ece", "\u4e4b", "\u5176", "\u53ca", "\u7b49", "\u90fd", "\u4e5f", "\u5c31", "\u90fd",
    "\u542c\u8bf4", "\u7f51\u4f20", "\u6709\u4eba", "\u8bf4", "\u8bb0\u5f97", "\u770b\u5230", "\u670b\u53cb", "\u5bb6\u91cc", "\u8001\u4eba", "\u7fa4\u91cc"
  ]);
  
  return [...new Set(words.filter(w => !stopWords.has(w)))];
}

const q = '\u5c0f\u9ea6\u9752\u8d2e\u9972\u6599';
const keywords = extractKeywords(q);
console.log('\nKeywords for query:', keywords);

// Test matching
const entry = data[0];
const claimLower = entry.claim.toLowerCase();
const truthLower = entry.truth.toLowerCase();
let hits = 0;
for (const w of keywords) {
  if (claimLower.includes(w) || truthLower.includes(w)) {
    hits++;
    console.log(`Hit: ${w}`);
  }
}
console.log(`Score: ${hits}/${keywords.length} = ${hits/keywords.length}`);
