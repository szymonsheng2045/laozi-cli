#!/usr/bin/env python3
"""修复 piyao-entries.json 中 claim 为日期格式的记录，从truth字段提取谣言描述"""
import json
import os
import re

DATA_DIR = os.path.expanduser("~/laozi-cli/data")

def extract_claim_from_truth(truth):
    """从truth字段中提取谣言描述"""
    if not truth:
        return None
    
    # 移除开头的"真相："或"详情："
    truth = re.sub(r'^(?:真相：|详情：)', '', truth).strip()
    
    # 尝试提取引号内的内容
    match = re.search(r'[“"｢]([^”"｣]+)[”"｣]', truth)
    if match:
        claim = match.group(1).strip()
        if len(claim) >= 5 and len(claim) <= 100:
            return claim
    
    # 尝试提取第一个句子
    sentences = re.split(r'[。！？]', truth)
    for s in sentences:
        s = s.strip()
        if len(s) >= 5 and len(s) <= 100 and not s.startswith('此外') and not s.startswith('统筹'):
            # 移除开头的时间状语
            s = re.sub(r'^[近日，最近，今年，去年，目前]', '', s).strip('， ')
            if len(s) >= 5:
                return s
    
    return None

def main():
    with open(os.path.join(DATA_DIR, "piyao-entries.json"), "r") as f:
        entries = json.load(f)
    
    date_pattern = re.compile(r'^\d{4}年\d{1,2}月\d{1,2}日$')
    fixed_count = 0
    
    for entry in entries:
        claim = entry.get("claim", "")
        if date_pattern.match(claim):
            extracted = extract_claim_from_truth(entry.get("truth", ""))
            if extracted:
                entry["claim"] = extracted
                fixed_count += 1
    
    # 保存修复后的数据
    with open(os.path.join(DATA_DIR, "piyao-entries.json"), "w") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)
    
    print(f"修复完成: {fixed_count} / {len([e for e in entries if date_pattern.match(e.get('claim', ''))])} 条日期格式 claim 被修复")
    print(f"总记录数: {len(entries)}")

if __name__ == "__main__":
    main()
