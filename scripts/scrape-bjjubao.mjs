#!/usr/bin/env node
/**
 * bjjubao.org.cn 爬虫
 * 抓取网络安全知识和案例分析栏目
 */

import { parse } from 'node-html-parser';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://www.bjjubao.org.cn';
const COLUMNS = [
  { id: 'node_285', name: '\u7f51络安全知识', maxPages: 10 },
  { id: 'node_286', name: '\u6848例分析', maxPages: 8 },
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}

function cleanText(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&emsp;/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ldquo;/g, '\u201c')
    .replace(/&rdquo;/g, '\u201d')
    .replace(/&mdash;/g, '\u2014')
    .replace(/&hellip;/g, '\u2026')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/[\s\u00A0]+/g, ' ')
    .trim();
}

function extractLinksFromList(html, columnId) {
  const root = parse(html);
  const items = [];
  
  // 文章列表在 li > a 结构中，日期在同级文本节点
  root.querySelectorAll('li').forEach(li => {
    const a = li.querySelector('a');
    if (!a) return;
    const title = a.text.trim();
    const href = a.getAttribute('href');
    if (!href || !title) return;
    
    // 过滤非文章链接
    if (!href.match(/\/\d{4}-\d{2}\/\d{2}\/content_\d+\.html/)) return;
    
    const url = href.startsWith('http') ? href : `${BASE_URL}${href}`;
    
    // 尝试提取日期
    const dateMatch = li.text.match(/(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : '';
    
    items.push({ title, url, date, column: columnId });
  });
  
  return items;
}

function parseArticle(html, url) {
  const root = parse(html);
  
  // 标题
  const h1 = root.querySelector('h1');
  const title = h1 ? cleanText(h1.innerHTML) : '';
  
  // 日期和来源
  const metaEl = root.querySelector('h1')?.nextElementSibling;
  let publishDate = '';
  let sourceText = '';
  
  if (metaEl) {
    const metaText = cleanText(metaEl.innerHTML || metaEl.text);
    const dateMatch = metaText.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);
    if (dateMatch) publishDate = dateMatch[1].split(' ')[0];
    
    const sourceMatch = metaText.match(/来源[\uff1a:]([^\u4f5c\u8005]+)/);
    if (sourceMatch) sourceText = sourceMatch[1].trim();
  }
  
  // 正文段落
  const paragraphs = [];
  root.querySelectorAll('p').forEach(p => {
    const text = cleanText(p.innerHTML);
    if (text.length > 5) {
      paragraphs.push(text);
    }
  });
  
  // 过滤掉尾部的版权/友情链接等
  const footerKeywords = ['Copyright', '\u7248权所有', '\u4eacICP备', '\u53cb情链接', '举报查询'];
  const cleanParagraphs = paragraphs.filter(p => {
    return !footerKeywords.some(k => p.includes(k));
  });
  
  const truth = cleanParagraphs.join('\n');
  
  return {
    title,
    claim: title,
    truth,
    source: url,
    publishDate,
    sourceText
  };
}

async function main() {
  console.log('\u5f00始抓取 bjjubao.org.cn ...');
  
  const allLinks = [];
  const seen = new Set();
  
  for (const col of COLUMNS) {
    console.log(`\n\u6293取栏目: ${col.name}`);
    for (let page = 1; page <= col.maxPages; page++) {
      const pageUrl = page === 1 
        ? `${BASE_URL}/${col.id}.html`
        : `${BASE_URL}/${col.id}_${page}.html`;
      
      try {
        console.log(`  页面 ${page}/${col.maxPages}: ${pageUrl}`);
        const html = await fetchHtml(pageUrl);
        const links = extractLinksFromList(html, col.id);
        
        let newCount = 0;
        for (const link of links) {
          if (!seen.has(link.url)) {
            seen.add(link.url);
            allLinks.push(link);
            newCount++;
          }
        }
        console.log(`    \u53d1现 ${newCount} \u7bc7新文章`);
        await sleep(500);
      } catch (err) {
        console.error(`    \u5931败: ${err.message}`);
      }
    }
  }
  
  console.log(`\n\u5171发现 ${allLinks.length} \u7bc7文章，开始解析...`);
  
  const entries = [];
  let success = 0;
  let fail = 0;
  
  for (let i = 0; i < allLinks.length; i++) {
    const { title, url, date, column } = allLinks[i];
    try {
      process.stdout.write(`[${i + 1}/${allLinks.length}] ${title.substring(0, 40)}... `);
      const html = await fetchHtml(url);
      const article = parseArticle(html, url);
      
      if (!article.title || !article.truth) {
        console.log('\u8df3过 (缺少标题或正文)');
        continue;
      }
      
      // 如果列表页没有提取到日期，使用文章页的日期
      if (!article.publishDate && date) {
        article.publishDate = date;
      }
      
      entries.push({
        title: article.title,
        claim: article.claim,
        truth: article.truth,
        source: url,
        publishDate: article.publishDate || date || '',
      });
      
      console.log('\u2713');
      success++;
      await sleep(300);
    } catch (err) {
      console.log(`\u2717 ${err.message}`);
      fail++;
    }
  }
  
  console.log(`\n\u722c取完成: ${success} 成功, ${fail} 失败`);
  console.log(`共生成 ${entries.length} 条记录`);
  
  // 读取现有的 piyao-entries.json
  const entriesFile = path.resolve(process.cwd(), 'data', 'piyao-entries.json');
  let existing = [];
  try {
    existing = JSON.parse(fs.readFileSync(entriesFile, 'utf-8'));
  } catch {
    existing = [];
  }
  
  // 合并
  const merged = [...existing, ...entries];
  fs.writeFileSync(entriesFile, JSON.stringify(merged, null, 2), 'utf-8');
  console.log(`\u5df2追加到 ${entriesFile}，总记录数: ${merged.length}`);
}

main().catch(console.error);
