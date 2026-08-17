#!/usr/bin/env python3
"""
拡張版 重回帰分析スクリプト
目的変数: 翌々年度保険料率
説明変数: 調整前所要保険料率, 年齢調整, 所得調整, 精算分, インセンティブ分, 5つの指標
"""

import pandas as pd
import numpy as np
import statsmodels.api as sm
from scipy import stats

# --- データ読み込み ---
df = pd.read_csv(
    '/home/naoe/デスクトップ/KenpoSimulator/分析用データ - 拡張版.tsv',
    sep='\t',
    encoding='utf-8'
)

print("=" * 70)
print("データ概要（拡張版）")
print("=" * 70)
print(f"データ件数: {len(df)} 行")
print(f"欠損値の確認:\n{df.isnull().sum()}")

# 欠損値を含む行（古い年度など）を削除して分析
df_clean = df.dropna().copy()
print(f"分析対象データ件数: {len(df_clean)} 行")
print()

# --- 変数の設定 ---
target_col = '翌々年度保険料率'
feature_cols = [
    '調整前所要保険料率', 
    '年齢調整', 
    '所得調整', 
    '精算分', 
    '特定健診等', 
    '特定保健指導', 
    '対象者減少率', 
    '受診勧奨', 
    '後発医薬品'
]

# 目的変数と説明変数の分離
y = df_clean[target_col].astype(float)
X = df_clean[feature_cols].astype(float)

# --- 目的変数との相関係数 ---
print("=" * 70)
print("目的変数（翌々年度保険料率）との単相関係数")
print("=" * 70)
for col in feature_cols:
    r, p = stats.pearsonr(X[col], y)
    print(f"  {col:15s}: r = {r:+.4f}  (p値 = {p:.6f}) {'***' if p < 0.001 else '**' if p < 0.01 else '*' if p < 0.05 else ''}")
print()

# --- 重回帰分析（全変数） ---
X_with_const = sm.add_constant(X)
model = sm.OLS(y, X_with_const)
results = model.fit()

print("=" * 70)
print("重回帰分析結果（全10変数）")
print("=" * 70)
print(results.summary())
print()

# 標準化偏回帰係数（各変数の影響度を比較するため）
print("=" * 70)
print("標準化偏回帰係数（影響度の大きさ）")
print("=" * 70)
# データを標準化
y_std = (y - y.mean()) / y.std()
X_std = (X - X.mean()) / X.std()
model_std = sm.OLS(y_std, X_std)  # 標準化すると切片は不要
results_std = model_std.fit()

std_coef = pd.DataFrame({'変数': X_std.columns, '標準化係数': results_std.params})
std_coef['絶対値'] = std_coef['標準化係数'].abs()
std_coef = std_coef.sort_values(by='絶対値', ascending=False)

for _, row in std_coef.iterrows():
    print(f"  {row['変数']:15s}: {row['標準化係数']:+.4f}")
