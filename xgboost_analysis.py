#!/usr/bin/env python3
import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.model_selection import GroupKFold
from sklearn.metrics import mean_squared_error, r2_score
import matplotlib.pyplot as plt
import os

# --- 設定 ---
file_path = '/home/naoe/デスクトップ/KenpoSimulator/分析用データ - 拡張版.tsv'
output_dir = '/home/naoe/デスクトップ/KenpoSimulator'

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
group_col = '支部名'  # 都道府県ごとのグループ（Leakage防止）

# --- データ読み込み ---
df = pd.read_csv(file_path, sep='\t', encoding='utf-8')
df_clean = df.dropna().copy()

X = df_clean[feature_cols]
y = df_clean[target_col]
groups = df_clean[group_col]

# --- XGBoost + GroupKFold 交差検証 ---
gkf = GroupKFold(n_splits=5)

rmse_scores = []
r2_scores = []
feature_importances = np.zeros(len(feature_cols))

print("=" * 60)
print("XGBoost GroupKFold (n_splits=5) 交差検証")
print("=" * 60)

fold = 1
for train_idx, test_idx in gkf.split(X, y, groups=groups):
    X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
    y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]
    
    model = xgb.XGBRegressor(
        objective='reg:squarederror',
        n_estimators=100,
        learning_rate=0.1,
        max_depth=4,
        random_state=42
    )
    
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)
    
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    r2 = r2_score(y_test, y_pred)
    
    rmse_scores.append(rmse)
    r2_scores.append(r2)
    feature_importances += model.feature_importances_ / gkf.n_splits
    
    print(f"Fold {fold}: RMSE = {rmse:.4f}, R² = {r2:.4f}")
    fold += 1

print("-" * 60)
print(f"平均 RMSE: {np.mean(rmse_scores):.4f}")
print(f"平均 R²  : {np.mean(r2_scores):.4f}")
print("=" * 60)

# --- 全データでの再学習と特徴量重要度の可視化 ---
final_model = xgb.XGBRegressor(
    objective='reg:squarederror',
    n_estimators=100,
    learning_rate=0.1,
    max_depth=4,
    random_state=42
)
final_model.fit(X, y)

# 重要度のデータフレーム作成
importances = pd.DataFrame({
    'Feature': feature_cols,
    'Importance': final_model.feature_importances_
}).sort_values(by='Importance', ascending=True)

import japanize_matplotlib
plt.figure(figsize=(10, 6))
plt.barh(importances['Feature'], importances['Importance'], color='skyblue')
plt.xlabel('Feature Importance')
plt.title('XGBoost Feature Importance for Insurance Premium Rate Prediction')
plt.tight_layout()

plot_path = os.path.join(output_dir, 'xgboost_feature_importance.png')
plt.savefig(plot_path)
print(f"\n特徴量重要度のグラフを保存しました: {plot_path}")
