import subprocess
import re
import os
import json
import pandas as pd

pdf_files = {
    'H30': ('平成30年度都道府県単位保険料率.pdf', 30),
    'H31': ('平成31年度保険料率に係る参考資料.pdf', 31),
    'R02': ('令和２年度保険料率に係る参考資料.pdf', 2),
    'R03': ('令和３年度保険料率に係る参考資料.pdf', 3),
    'R04': ('令和４年度保険料率に係る参考資料.pdf', 4),
    'R05': ('令和５年度保険料率に係る参考資料.pdf', 5),
    'R06': ('令和６年度保険料率に係る参考資料.pdf', 6),
    'R07': ('令和７年度保険料率に係る参考資料.pdf', 7),
    'R08': ('令和８年度 都道府県単位保険料率について.pdf', 8)
}

dir_path = '/home/naoe/デスクトップ/KenpoSimulator'

def parse_pdf(year_key, filename, nendo):
    path = os.path.join(dir_path, filename)
    if not os.path.exists(path):
        return None
    
    result = subprocess.run(['pdftotext', '-layout', path, '-'], capture_output=True, text=True)
    lines = result.stdout.split('\n')
    
    # 算定表の開始行を探す（小数点が必ず含まれることで、人口表を回避）
    start_idx = -1
    for i, line in enumerate(lines):
        if re.match(r'^\s*1\s+北\s*海\s*道', line) and '.' in line:
            start_idx = i
            break
    
    if start_idx == -1:
        print(f"[{year_key}] Table not found")
        return []
        
    extracted_data = []
    current_idx = start_idx
    count = 0
    while count < 47 and current_idx < len(lines):
        line = lines[current_idx]
        # 「▲」はマイナス、「－」は0に置換
        line_clean = line.replace('▲', '-').replace('－', '0.00').replace('＋', '')
        
        m = re.match(r'^\s*(\d{1,2})\s+([^\d]+)(.*)$', line_clean)
        if m:
            pref_num = int(m.group(1))
            if pref_num == count + 1:
                pref_name = m.group(2).replace(' ', '').strip()
                values_str = m.group(3).strip()
                values = [v for v in values_str.split() if v]
                
                try:
                    num_values = [float(v) for v in values if v.replace('.', '', 1).replace('-', '', 1).isdigit()]
                    
                    # カラムの意味合いは年によって異なるが、基本構造:
                    # R08: (a+b)所要, (a)調整前, 年齢調整, 所得調整, (a+b+4.55)所要, (c)精算後, 精算分, ｲﾝｾﾝ分, 最終(c+0.1)
                    # => [5.69, 6.21, -0.33, -0.19, 10.24, 10.28, 0.03, 0.01, 10.38]
                    # R04: (a)調整前, 年齢調整, 所得調整, (a+b)調整後, 所要, (c)精算後, (d)ｲﾝｾﾝ後, ｲﾝｾﾝ分
                    # => [6.26, -0.31, -0.26, 5.69, 10.41, 10.38, 10.39, 0.007]
                    
                    # 統一フォーマットにマッピングする処理（後で目視確認するため生データを保持）
                    extracted_data.append({
                        'PDF年度': year_key,
                        '都道府県番号': pref_num,
                        '都道府県名': pref_name,
                        'raw_values': num_values
                    })
                    count += 1
                except Exception as e:
                    pass
        current_idx += 1
        
    return extracted_data

all_data = []
for key, (filename, nendo) in pdf_files.items():
    data = parse_pdf(key, filename, nendo)
    if data:
        all_data.extend(data)
        print(f"[{key}] Extracted {len(data)} prefectures. Example(Hokkaido): {data[0]['raw_values']}")
    else:
        print(f"[{key}] Failed to extract")

# JSONとして保存
with open(os.path.join(dir_path, 'temp_extracted_pdf.json'), 'w') as f:
    json.dump(all_data, f, ensure_ascii=False, indent=2)

print("\nData parsing complete. Ready to map to TSV.")
