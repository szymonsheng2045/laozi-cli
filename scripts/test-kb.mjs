import { searchPiyao, formatPiyaoMatches } from '../dist/knowledge-base.js';

// Test various queries
const queries = [
  '小麦青贮饲料',
  '收割小麦',
  '小麦',
  '地震',
  'ETC认证',
  '退税',
  '医保',
  '疫苗'
];

for (const q of queries) {
  const matches = searchPiyao(q, 3);
  console.log(`Query: "${q}" -> ${matches.length} matches`);
  if (matches.length > 0) {
    console.log('  Top:', matches[0].claim.substring(0, 60));
  }
}
