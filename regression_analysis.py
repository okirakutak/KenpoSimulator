#!/usr/bin/env python3
"""
重回帰分析スクリプト
目的変数: 翌々年度保険料率
説明変数: 特定健診等、特定保健指導、対象者減少率、受診勧奨、後発医薬品
"""

import pandas as pd
import numpy as np
import statsmodels.api as sm
from scipy import stats
import json

# --- データ読み込み ---
df = pd.read_csv(
    '/home/naoe/デスクトップ/KenpoSimulator/分析用データ - 5つの指標.tsv',
    sep='\t',
    encoding='utf-8'
)

# カラム名の前後の空白やBOMを除去
df.columns = df.columns.str.strip().str.replace('\ufeff', '')

print("=" * 70)
print("データ概要")
print("=" * 70)
print(f"データ件数: {len(df)} 行")
print(f"カラム名: {list(df.columns)}")
print()
print(df.describe().to_string())
print()

# --- 変数の設定 ---
target_col = '翌々年度保険料率'
feature_cols = ['特定健診等', '特定保健指導', '対象者減少率', '受診勧奨', '後発医薬品']

# 目的変数と説明変数の分離
y = df[target_col].astype(float)
X = df[feature_cols].astype(float)

# --- 相関行列 ---
print("=" * 70)
print("相関行列（目的変数 + 説明変数）")
print("=" * 70)
corr_df = pd.concat([y, X], axis=1).corr()
print(corr_df.round(4).to_string())
print()

# --- 目的変数との相関係数 ---
print("=" * 70)
print("目的変数（翌々年度保険料率）との相関係数")
print("=" * 70)
for col in feature_cols:
    r, p = stats.pearsonr(X[col], y)
    print(f"  {col:12s}: r = {r:+.4f}  (p値 = {p:.6f}) {'***' if p < 0.001 else '**' if p < 0.01 else '*' if p < 0.05 else ''}")
print()

# --- 重回帰分析 ---
X_with_const = sm.add_constant(X)  # 定数項（切片）を追加
model = sm.OLS(y, X_with_const)
results = model.fit()

print("=" * 70)
print("重回帰分析結果")
print("=" * 70)
print(results.summary())
print()

# --- 主要な結果の要約 ---
print("=" * 70)
print("分析結果サマリー")
print("=" * 70)
print(f"  決定係数 (R²):           {results.rsquared:.4f}")
print(f"  自由度調整済み決定係数:    {results.rsquared_adj:.4f}")
print(f"  F統計量:                  {results.fvalue:.4f}")
print(f"  F検定 p値:                {results.f_pvalue:.2e}")
print(f"  AIC:                      {results.aic:.4f}")
print(f"  BIC:                      {results.bic:.4f}")
print(f"  残差の標準誤差:           {np.sqrt(results.mse_resid):.4f}")
print()

# --- 回帰係数の詳細 ---
print("=" * 70)
print("回帰係数の詳細")
print("=" * 70)
print(f"  {'変数':14s} {'係数':>10s} {'標準誤差':>10s} {'t値':>10s} {'p値':>12s} {'有意性':>6s} {'95%CI下限':>10s} {'95%CI上限':>10s}")
print("-" * 90)
ci_df = results.conf_int()
for name in results.params.index:
    coef = results.params[name]
    se = results.bse[name]
    t = results.tvalues[name]
    p = results.pvalues[name]
    ci_low = ci_df.loc[name, 0]
    ci_high = ci_df.loc[name, 1]
    sig = '***' if p < 0.001 else '**' if p < 0.01 else '*' if p < 0.05 else '.'  if p < 0.1 else ''
    display_name = '切片' if name == 'const' else name
    print(f"  {display_name:14s} {coef:>10.4f} {se:>10.4f} {t:>10.4f} {p:>12.6f} {sig:>6s} {ci_low:>10.4f} {ci_high:>10.4f}")
print()
print("  有意水準: *** p<0.001, ** p<0.01, * p<0.05, . p<0.1")
print()

# --- 標準化回帰係数（β） ---
print("=" * 70)
print("標準化回帰係数（β）- 各変数の相対的な影響度")
print("=" * 70)
# 標準化
X_std = (X - X.mean()) / X.std()
y_std = (y - y.mean()) / y.std()
X_std_const = sm.add_constant(X_std)
results_std = sm.OLS(y_std, X_std_const).fit()

betas = []
for col in feature_cols:
    beta = results_std.params[col]
    betas.append((col, beta))
    
# 影響度の大きい順にソート
betas_sorted = sorted(betas, key=lambda x: abs(x[1]), reverse=True)
print(f"  {'変数':14s} {'β':>10s} {'|β|':>10s} {'影響度ランク':>12s}")
print("-" * 50)
for rank, (col, beta) in enumerate(betas_sorted, 1):
    print(f"  {col:14s} {beta:>10.4f} {abs(beta):>10.4f} {rank:>12d}")
print()

# --- VIF（多重共線性の確認） ---
print("=" * 70)
print("VIF（分散膨張係数）- 多重共線性の確認")
print("=" * 70)
from statsmodels.stats.outliers_influence import variance_inflation_factor
vif_data = pd.DataFrame()
vif_data["変数"] = feature_cols
vif_data["VIF"] = [variance_inflation_factor(X_with_const.values, i+1) for i in range(len(feature_cols))]
print(vif_data.to_string(index=False))
print()
print("  ※ VIF > 10 の場合、多重共線性の問題がある可能性があります")
print()

# --- 残差の正規性検定 ---
print("=" * 70)
print("残差の正規性検定（Shapiro-Wilk検定）")
print("=" * 70)
stat, p_shapiro = stats.shapiro(results.resid)
print(f"  検定統計量: {stat:.4f}")
print(f"  p値:        {p_shapiro:.6f}")
print(f"  判定:       {'正規性あり（p >= 0.05）' if p_shapiro >= 0.05 else '正規性に問題あり（p < 0.05）'}")
print()

# --- Durbin-Watson統計量（自己相関の検定） ---
from statsmodels.stats.stattools import durbin_watson
dw = durbin_watson(results.resid)
print("=" * 70)
print("Durbin-Watson統計量（残差の自己相関の検定）")
print("=" * 70)
print(f"  DW統計量: {dw:.4f}")
print(f"  判定:     {'自己相関なし（2に近い）' if 1.5 < dw < 2.5 else '自己相関の可能性あり'}")
print()

# --- 回帰式 ---
print("=" * 70)
print("回帰式")
print("=" * 70)
eq = f"翌々年度保険料率 = {results.params['const']:.4f}"
for col in feature_cols:
    coef = results.params[col]
    sign = '+' if coef >= 0 else '-'
    eq += f" {sign} {abs(coef):.4f} × {col}"
print(f"  {eq}")
print()

# --- JSON形式でも出力（後で使いやすいように） ---
result_json = {
    "r_squared": round(results.rsquared, 4),
    "r_squared_adj": round(results.rsquared_adj, 4),
    "f_statistic": round(results.fvalue, 4),
    "f_pvalue": float(f"{results.f_pvalue:.2e}"),
    "aic": round(results.aic, 4),
    "bic": round(results.bic, 4),
    "coefficients": {},
    "standardized_coefficients": {}
}

for col in ['const'] + feature_cols:
    display_name = '切片' if col == 'const' else col
    result_json["coefficients"][display_name] = {
        "coefficient": round(results.params[col], 6),
        "std_error": round(results.bse[col], 6),
        "t_value": round(results.tvalues[col], 4),
        "p_value": round(results.pvalues[col], 6),
    }

for col, beta in betas:
    result_json["standardized_coefficients"][col] = round(beta, 4)

with open('/home/naoe/デスクトップ/KenpoSimulator/regression_result.json', 'w', encoding='utf-8') as f:
    json.dump(result_json, f, ensure_ascii=False, indent=2)

print("結果をregression_result.jsonに保存しました。")
