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
    
    # 算定表の開始行を探す（「医療給付費についての調整前の所要保険料率」など）
    start_idx = -1
    for i, line in enumerate(lines):
        if '医療給付費' in line and '調整前' in line:
            # その後にある最初の1〜47の行を探す
            for j in range(i, min(len(lines), i + 50)):
                if re.match(r'^\s*1\s+北\s*海\s*道', lines[j]) and '.' in lines[j]:
                    start_idx = j
                    break
            if start_idx != -1:
                break
    
    if start_idx == -1:
        # 代替策：1 北海道が含まれ、かつ小数点が含まれる最初の行で、数値が7つ以上あるもの
        for i, line in enumerate(lines):
            if re.match(r'^\s*1\s+北\s*海\s*道', line) and '.' in line:
                line_clean = line.replace('▲ ', '-').replace('▲', '-').replace('－', '0.00').replace('＋ ', '')
                m = re.match(r'^\s*(\d{1,2})\s+([^\d]+)(.*)$', line_clean)
                if m:
                    values_str = m.group(3).strip()
                    values = [v for v in values_str.split() if v]
                    num_values = [v for v in values if v.replace('.', '', 1).replace('-', '', 1).isdigit()]
                    if len(num_values) >= 7:
                        start_idx = i
                        break
                
    if start_idx == -1:
        return []
        
    extracted_data = []
    current_idx = start_idx
    count = 0
    while count < 47 and current_idx < len(lines):
        line = lines[current_idx]
        
        # スペースを伴うマイナス記号の処理
        line_clean = line.replace('▲ ', '-').replace('▲', '-').replace('－', '0.00').replace('＋ ', '')
        
        m = re.match(r'^\s*(\d{1,2})\s+([^\d]+)(.*)$', line_clean)
        if m:
            pref_num = int(m.group(1))
            if pref_num == count + 1:
                pref_name = m.group(2).replace(' ', '').strip()
                values_str = m.group(3).strip()
                values = [v for v in values_str.split() if v]
                
                try:
                    num_values = [float(v) for v in values if v.replace('.', '', 1).replace('-', '', 1).isdigit()]
                    
                    extracted_data.append({
                        '年度_PDF': year_key,
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

# カラムの割り当て
processed_data = []
for row in all_data:
    vals = row['raw_values']
    year = row['年度_PDF']
    
    adj_pre = 0.0
    age_adj = 0.0
    inc_adj = 0.0
    settlement = 0.0
    incentive = 0.0
    
    if year in ['H30', 'H31']:
        # [調整前, 年齢, 所得, 調整後, 所要, 精算反映後, 合計]
        if len(vals) >= 7:
            adj_pre = vals[0]
            age_adj = vals[1]
            inc_adj = vals[2]
            settlement = round(vals[5] - vals[4], 3)
            incentive = 0.0
    elif year in ['R02', 'R03', 'R04', 'R05']:
        # [調整前, 年齢, 所得, 調整後, 所要, 精算後, ｲﾝｾﾝ後, ｲﾝｾﾝ分]
        if len(vals) >= 8:
            adj_pre = vals[0]
            age_adj = vals[1]
            inc_adj = vals[2]
            settlement = round(vals[5] - vals[4], 3)
            incentive = vals[7]
    elif year == 'R06':
        # R06は少し違うかもしれないので動的に対応
        if len(vals) >= 8:
            adj_pre = vals[0]
            age_adj = vals[1]
            inc_adj = vals[2]
            settlement = round(vals[5] - vals[4], 3)
            incentive = vals[7]
    elif year == 'R07':
        # R07: 調整後(a+b), 調整前(a), 年齢, 所得, 所要(a+b+4.65), (c)精算後, 最終, ｲﾝｾﾝ分
        # [5.67, 6.21, -0.33, -0.22, 10.32, 10.30, 10.31, 0.01]
        if len(vals) >= 8:
            adj_pre = vals[1]
            age_adj = vals[2]
            inc_adj = vals[3]
            settlement = round(vals[5] - vals[4], 3)
            incentive = vals[7]
    elif year == 'R08':
        # R08: 調整後(a+b), 調整前(a), 年齢, 所得, 所要(a+b+4.55), (c)精算後, 精算分, ｲﾝｾﾝ分, 最終(c+0.1)
        # [5.69, 6.21, -0.33, -0.19, 10.24, 10.28, 0.03, 0.01, 10.38]
        if len(vals) >= 9:
            adj_pre = vals[1]
            age_adj = vals[2]
            inc_adj = vals[3]
            settlement = vals[6]
            incentive = vals[7]
            
    processed_row = {
        'PDF年度': year,
        '都道府県': row['都道府県名'],
        '調整前所要保険料率': adj_pre,
        '年齢調整': age_adj,
        '所得調整': inc_adj,
        '精算分': settlement,
        'インセンティブ分': incentive
    }
    processed_data.append(processed_row)

df_pdf = pd.DataFrame(processed_data)

# 既存のTSVと結合
# TSVの「年度」列は翌々年度保険料率の年度を示す（例: 2 -> R4年度保険料率）
# R4年度の予測には「R4年度のPDF」のデータを使いたい。
# つまり、TSVの年度「2」にはPDFの「R04」をマッピングする。

year_map = {
    2: 'R04',
    3: 'R05',
    4: 'R06',
    5: 'R07',
    6: 'R08'
}

df_tsv = pd.read_csv(os.path.join(dir_path, '分析用データ - 5つの指標.tsv'), sep='\t', encoding='utf-8')
df_tsv.columns = df_tsv.columns.str.strip().str.replace('\ufeff', '')

# PDFの年度をマッピング用に変換
df_tsv['PDF年度'] = df_tsv['年度'].map(year_map)

# 都道府県名を統一（PDFは空白削除済み、TSVも空白削除）
df_tsv['都道府県_結合用'] = df_tsv['支部名'].str.replace(' ', '').str.replace('　', '')

# 結合
df_merged = pd.merge(
    df_tsv, 
    df_pdf, 
    left_on=['PDF年度', '都道府県_結合用'], 
    right_on=['PDF年度', '都道府県'], 
    how='left'
)

# 不要な列を削除
df_merged = df_merged.drop(columns=['PDF年度', '都道府県_結合用', '都道府県'])

# 保存
output_path = os.path.join(dir_path, '分析用データ - 拡張版.tsv')
df_merged.to_csv(output_path, sep='\t', index=False, encoding='utf-8')
print(f"Merged data saved to {output_path}")

# 結果の一部を表示
print("\n結合結果のサンプル (北海道):")
print(df_merged[df_merged['支部名'] == '北海道'].head(5).to_string())
