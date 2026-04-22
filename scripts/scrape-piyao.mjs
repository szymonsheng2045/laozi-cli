#!/usr/bin/env node
/**
 * 中国互联网联合辟谣平台 (piyao.org.cn) 爬虫 v3
 * 更精确的解析逻辑
 */

import { parse } from 'node-html-parser';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://www.piyao.org.cn';
const LIST_PAGES = ['/jj.htm', '/ld.htm', '/rm.htm', '/ft.htm', '/gz.htm'];
const DATA_DIR = path.resolve(process.cwd(), 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'piyao-dataset.json');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchHtml(url) {
  const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
  const res = await fetch(fullUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${fullUrl}`);
  return res.text();
}

function resolveUrl(href) {
  if (!href) return null;
  if (href.startsWith('http')) return href;
  if (href.startsWith('/')) return `${BASE_URL}${href}`;
  return `${BASE_URL}/${href}`;
}

function extractLinksFromList(html) {
  const root = parse(html);
  const items = [];
  root.querySelectorAll('.ej_list li, .xpage-content-list li').forEach(li => {
    const a = li.querySelector('h2 a');
    if (!a) return;
    const title = a.text.trim();
    const href = a.getAttribute('href');
    const dateEl = li.querySelector('p');
    const date = dateEl ? dateEl.text.trim() : '';
    if (href && title) {
      items.push({ title, url: resolveUrl(href), date });
    }
  });
  return items;
}

function cleanText(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&emsp;/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&mdash;/g, '—')
    .replace(/&hellip;/g, '…')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/[\s\u00A0]+/g, ' ')
    .trim();
}

function extractParagraphs(html) {
  const root = parse(html);
  const content = root.querySelector('.content, .con_left, .detail, #detail, .main');
  const container = content || root;
  const paragraphs = container.querySelectorAll('p');
  return paragraphs
    .map(p => cleanText(p.innerHTML))
    .filter(t => t.length > 5);
}

function isRumorArticle(title, paragraphs) {
  // 先通过标题判断是否强烈像辟谣文章
  const strongRumorTitle = /\u8c23\u8a00|\u4e0d\u5b9e|\u865a\u5047|\u8f9f\u8c23|\u771f\u76f8\u662f|警\u65b9\u901a\u62a5|\u56de\u5e94\u6765\u4e86/.test(title);
  if (strongRumorTitle) return true;

  const fullText = paragraphs.join('\n');

  // 如果正\u6587\u6709\u8f9f\u8c23\u6807\u8bb0，\u76f4\u63a5\u8ba4\u4e3a\u662f\u8f9f\u8c23
  const rumorMarkers = [
    '\u8c23\u8a00', '\u4e0d\u5b9e', '\u865a\u5047', '\u7ecf\u6838\u5b9e', '\u8f9f\u8c23',
    '\u771f\u76f8', '\u8bef\u533a', '\u89e3\u8bfb', '\u56de\u5e94', '\u8b66\u65b9\u901a\u62a5',
    '\u7cfb\u8c23\u8a00', '\u4e3a\u5047', '\u62df\u9020', 'AI\u751f\u6210', '\u65e7\u56fe\u65b0\u53d1',
    '\u8bef\u5bfc', '\u8fdd\u6cd5', '\u5904\u7f5a', '\u8bad\u8bda', '\u7ea6\u8c08',
    '\u62d2\u6536', '\u62d2\u7edd', '\u89e3\u91ca'
  ];
  const hasRumorMarker = rumorMarkers.some(m => fullText.includes(m));
  if (hasRumorMarker) return true;

  // \u5982\u679c\u6b63\u6587\u6ca1\u6709\u8f9f\u8c23\u6807\u8bb0\uff0c\u68c0\u67e5\u6807\u9898
  const titleRumorMarkers = ['\u8c23\u8a00', '\u4e0d\u5b9e', '\u865a\u5047', '\u8f9f\u8c23', '\u771f\u76f8', '\u56de\u5e94', '\u89e3\u91ca'];
  if (titleRumorMarkers.some(m => title.includes(m))) return true;

  // \u6392\u9664\u660e\u663e\u4e0d\u662f\u8f9f\u8c23\u7684\u6587\u7ae0
  const nonRumorKeywords = [
    '\u5de5\u4f5c\u52a8\u6001:', '\u4f1a\u8bae:', '\u57f9\u8bad\u73ed:', '\u4e13\u9898:', '\u5fae\u8bbf\u8c08:',
    '\u6cd5\u6cbb:', '\u6cbb\u7406:', '\u7814\u7a76:', '\u5206\u6790:', '\u7279\u6027:',
    '\u5bfb\u627e:', '\u9009\u62d4:', '\u5b81\u9759:', '\u6307\u5357:', '\u653b\u7565:',
    '\u62a5\u544a:', '\u767d\u76ae\u4e66:', '\u8c03\u67e5:', '\u7edf\u8ba1:',
    '\u521b\u4f5c:', '\u5f81\u96c6:', '\u6d3b\u52a8:', '\u5927\u8d5b:',
    '\u5173\u4e8e:', '\u7684\u610f\u89c1:', '\u7684\u901a\u77e5:', '\u7684\u51b3\u5b9a:',
    '\u5165\u6821:', '\u8fdb\u6821\u56ed:', '\u8fdb\u4f01\u4e1a:', '\u8fdb\u793e\u533a:',
    '\u5f62\u8c61\u4e0a\u7ebf', 'IP\u5f62\u8c61', '\u4e0a\u7ebf\u5566', '\u516c\u544a:',
    '\u5e74\u5ea6\u5341\u5927\u8f9f\u8c23', '\u70ed\u70b9\u4e13\u9898', '\u5e74\u5ea6\u8f9f\u8c23\u699c', '\u6708\u8f9f\u8c23\u699c',
    '\u5e74\u8f9f\u8c23\u699c', '\u5b63\u5ea6\u8f9f\u8c23\u699c', '\u5e74\u5ea6\u7f51\u7edc\u70ed\u70b9\u8c23\u8a00'
  ];
  if (nonRumorKeywords.some(k => title.includes(k))) return false;

  return false;
}

function parseArticleFlex(title, paragraphs, url, date) {
  const hasSectionLabels = paragraphs.some(p => /^\u8f9f\s*\u8c23/.test(p) || /^\u79d1\s*\u666e/.test(p) || /^\u901a\s*\u62a5/.test(p));
  if (hasSectionLabels) {
    return parseCollection(paragraphs, url, title, date);
  }

  // \u68c0\u67e5\u662f\u5426\u4e3a\u591a\u8bef\u533a\u6587\u7ae0
  const mythMatches = paragraphs.join('\n').match(/\u8bef\u533a[\u2460\u2461\u2462\u2463\u2464\u2465]/g);
  if (mythMatches && mythMatches.length > 1) {
    return parseMultiSectionArticle(paragraphs, url, title, date);
  }

  const entry = parseSingleRumor(paragraphs, url, title, date);
  return entry ? [entry] : [];
}

function parseCollection(paragraphs, url, title, date) {
  const entries = [];
  let current = null;

  for (const p of paragraphs) {
    if (/^\u8f9f\s*\u8c23/.test(p) || /^\u79d1\s*\u666e/.test(p) || /^\u901a\s*\u62a5/.test(p)) {
      if (current) {
        finalizeEntry(current);
        if (current.claim || current.truth) entries.push(current);
      }
      const cat = p.match(/^(\u8f9f\s*\u8c23|\u79d1\s*\u666e|\u901a\s*\u62a5)/)?.[1]?.replace(/\s/g, '') || '\u5176\u4ed6';
      current = {
        sourceUrl: url,
        sourceTitle: title,
        category: cat,
        title: '',
        claim: '',
        truth: '',
        raw: [],
        publishDate: date
      };
      continue;
    }
    if (!current) continue;
    current.raw.push(p);
  }

  if (current) {
    finalizeEntry(current);
    if (current.claim || current.truth) entries.push(current);
  }

  return entries;
}

function finalizeEntry(entry) {
  const raw = entry.raw;
  delete entry.raw;

  // \u6807\u9898\u901a\u5e38\u662f\u7b2c\u4e00\u4e2a\u957f\u5ea6\u9002\u4e2d\u7684\u6bb5\u843d
  let titleIdx = -1;
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    if (t.length >= 5 && t.length <= 120 && !/\u6765\u6e90|\u8d23\u4efb\u7f16\u8f91|\u7edf\u7b79|\u6267\u884c|\u6587\u5b57|\u8bbe\u8ba1/.test(t)) {
      entry.title = t;
      titleIdx = i;
      break;
    }
  }

  const contentStart = titleIdx >= 0 ? titleIdx + 1 : 0;
  const content = raw.slice(contentStart);

  // \u79fb\u9664\u5f00\u5934\u7684"\u8be6\u60c5\uff1a"
  while (content.length > 0 && /^\u8be6\u60c5[\uff1a:]/.test(content[0])) {
    content.shift();
  }

  let splitIdx = -1;
  for (let i = 0; i < content.length; i++) {
    const t = content[i];
    if (/\u7ecf\u6838\u5b9e.*\u8c23\u8a00|\u4ee5\u4e0a\u4fe1\u606f\u5747\u7cfb\u8c23\u8a00|\u7cfb\u8c23\u8a00|先\u8bf4\u7ed3\u8bba|不\u5b9e|虚\u5047\u4fe1\u606f|\u4e3a\u5047/.test(t)) {
      splitIdx = i;
      break;
    }
  }

  if (splitIdx >= 0) {
    entry.claim = content.slice(0, splitIdx).join('\n').trim();
    entry.truth = content.slice(splitIdx).join('\n').trim();
  } else {
    entry.claim = content.join('\n').trim();
  }

  // \u6e05\u7406\u5c3e\u90e8\u5197\u4f59
  entry.truth = entry.truth.replace(/\n?\u6765\u6e90\uff1a[^\n]+/g, '').trim();
  entry.truth = entry.truth.replace(/\n?\u8d23\u4efb\u7f16\u8f91\uff1a[^\n]+/g, '').trim();
}

function parseSingleRumor(paragraphs, url, title, date) {
  const cleanParagraphs = paragraphs.filter(p => {
    if (/^\u6765\u6e90[\uff1a:]/.test(p)) return false;
    if (/^\u65f6\u95f4[\uff1a:]/.test(p)) return false;
    if (/^\u8d23\u4efb\u7f16\u8f91[\uff1a:]/.test(p)) return false;
    if (/^\u7edf\u7b79[\uff1a:]/.test(p)) return false;
    if (/^\u6267\u884c[\uff1a:]/.test(p)) return false;
    if (/^\u6587\u5b57[\uff1a:]/.test(p)) return false;
    if (/^\u8bbe\u8ba1[\uff1a:]/.test(p)) return false;
    if (p.length < 10) return false;
    return true;
  });

  if (cleanParagraphs.length === 0) return null;

  const fullText = cleanParagraphs.join('\n');

  // \u5c1d\u8bd5\u627e\u5230\u5206\u9694\u70b9
  const splitPatterns = [
    /(\u771f\u76f8\u662f[\u2192\uff1a:].*)/,
    /(\u7ecf\u6838\u5b9e[^\n]{5,})/,
    /(\u56de\u5e94\u6765\u4e86[\uff1a:].*)/,
    /(\u8b66\u65b9\u901a\u62a5[\uff1a:].*)/,
    /(\u7cfb\u8c23\u8a00[^\n]{3,})/,
    /(\u4e3a\u5047[^\n]{3,})/,
    /(\u4e0d\u5b9e[^\n]{3,})/,
    /(\u865a\u5047\u4fe1\u606f[^\n]{3,})/,
    /(\u5148\u8bf4\u7ed3\u8bba[^\n]{3,})/,
  ];

  let splitMatch = null;

  for (const pat of splitPatterns) {
    const m = fullText.match(pat);
    if (m) {
      splitMatch = m;
      break;
    }
  }

  let claim = '';
  let truth = '';

  if (splitMatch) {
    const idx = fullText.indexOf(splitMatch[0]);
    claim = fullText.substring(0, idx).trim();
    truth = fullText.substring(idx).trim();
  } else {
    claim = fullText;
  }

  let articleTitle = title.replace(/-\u4e2d\u56fd\u4e92\u8054\u7f51\u8054\u5408\u8f9f\u8c23\u5e73\u53f0$/, '').trim();
  if (!articleTitle) articleTitle = cleanParagraphs[0].substring(0, 60);

  return {
    sourceUrl: url,
    sourceTitle: title,
    category: detectCategory(title, fullText),
    title: articleTitle,
    claim,
    truth,
    publishDate: date
  };
}

function parseMultiSectionArticle(paragraphs, url, title, date) {
  const entries = [];
  let current = null;

  for (const p of paragraphs) {
    if (/\u8bef\u533a[\u2460\u2461\u2462\u2463\u2464\u2465\u2466\u2467\u2468\u2469]|^\u4e3a\u4ec0\u4e48|^\u7f51\u4f20/.test(p)) {
      if (current) {
        entries.push(current);
      }
      current = {
        sourceUrl: url,
        sourceTitle: title,
        category: '\u79d1\u666e',
        title: p.split(/[\uff1a:]/)[0].substring(0, 80),
        claim: p,
        truth: '',
        publishDate: date
      };
      continue;
    }

    if (!current) continue;

    if (/\u89e3\u8bfb[\uff1a:]|\u771f\u76f8[\uff1a:]|^\u4e8b\u5b9e\u662f/.test(p)) {
      current.truth += (current.truth ? '\n' : '') + p;
    } else {
      if (current.truth) {
        current.truth += '\n' + p;
      } else {
        current.claim += '\n' + p;
      }
    }
  }

  if (current) entries.push(current);
  return entries.length > 0 ? entries : null;
}

function detectCategory(title, text) {
  const combined = title + text;
  if (/\u98df\u54c1|\u836f\u54c1|\u533b\u7597|\u5065\u5eb7|\u75c5\u6bd2|\u75ab\u82d7/.test(combined)) return '\u5065\u5eb7';
  if (/\u8d22\u7ecf|\u91d1\u878d|\u80a1\u7968|\u57fa\u91d1|\u94f6\u884c/.test(combined)) return '\u8d22\u7ecf';
  if (/\u79d1\u5b66|\u79d1\u666e|\u4f20\u611f|\u5316\u5b66|\u7269\u7406/.test(combined)) return '\u79d1\u666e';
  if (/\u653f\u7b56|\u6cd5\u89c4|\u653f\u5e9c|\u59d4|\u529e\u4e8b\u5904/.test(combined)) return '\u653f\u7b56';
  if (/\u5730\u9707|\u707e\u5bb3|\u6c34\u707e|\u706b\u707e|\u53f0\u98ce/.test(combined)) return '\u707e\u5bb3';
  if (/\u793e\u4f1a|\u4ea4\u901a|\u51fa\u884c|\u65c5\u6e38/.test(combined)) return '\u793e\u4f1a';
  return '\u5176\u4ed6';
}

async function main() {
  console.log('\u5f00\u59cb\u6293\u53d6 piyao.org.cn ...');

  const allLinks = [];
  const seen = new Set();

  for (const listPage of LIST_PAGES) {
    try {
      console.log(`\u6293\u53d6\u5217\u8868\u9875: ${listPage}`);
      const html = await fetchHtml(listPage);
      const links = extractLinksFromList(html);
      for (const link of links) {
        if (!seen.has(link.url)) {
          seen.add(link.url);
          allLinks.push(link);
        }
      }
      await sleep(500);
    } catch (err) {
      console.error(`\u5217\u8868\u9875\u5931\u8d25 ${listPage}:`, err.message);
    }
  }

  console.log(`\u5171\u53d1\u73b0 ${allLinks.length} \u7bc7\u6587\u7ae0`);

  const dataset = [];
  let skipped = 0;
  let success = 0;
  let fail = 0;

  for (let i = 0; i < allLinks.length; i++) {
    const { title, url, date } = allLinks[i];
    try {
      process.stdout.write(`[${i + 1}/${allLinks.length}] ${title.substring(0, 40)}... `);
      const html = await fetchHtml(url);
      const paragraphs = extractParagraphs(html);

      if (!isRumorArticle(title, paragraphs)) {
        console.log('\u8df3\u8fc7 (\u975e\u8f9f\u8c23)');
        skipped++;
        continue;
      }

      const entries = parseArticleFlex(title, paragraphs, url, date);
      const validEntries = (Array.isArray(entries) ? entries : [entries]).filter(e => e && (e.claim || e.truth));

      for (const entry of validEntries) {
        dataset.push(entry);
      }
      console.log(`\u2713 ${validEntries.length} \u6761`);
      success++;
      await sleep(300);
    } catch (err) {
      console.log(`\u2717 ${err.message}`);
      fail++;
    }
  }

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const output = {
    version: 3,
    source: 'piyao.org.cn (\u4e2d\u56fd\u4e92\u8054\u7f51\u8054\u5408\u8f9f\u8c23\u5e73\u53f0)',
    scrapedAt: new Date().toISOString(),
    totalEntries: dataset.length,
    articlesParsed: success,
    articlesSkipped: skipped,
    articlesFailed: fail,
    entries: dataset
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n\u5b8c\u6210\uff01\u5171\u89e3\u6790 ${dataset.length} \u6761\u8f9f\u8c23\u8bb0\u5f55`);
  console.log(`  \u6210\u529f: ${success} \u7bc7 | \u8df3\u8fc7: ${skipped} \u7bc7 | \u5931\u8d25: ${fail} \u7bc7`);
  console.log(`\u6570\u636e\u4fdd\u5b58\u81f3: ${OUTPUT_FILE}`);
}

main().catch(console.error);
