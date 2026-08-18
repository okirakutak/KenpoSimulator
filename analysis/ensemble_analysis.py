#!/usr/bin/env python3
import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.model_selection import GroupKFold
from sklearn.metrics import mean_squared_error, r2_score
from sklearn.linear_model import LinearRegression

# --- 設定 ---
file_path = '/home/naoe/デスクトップ/KenpoSimulator/分析用データ - 拡張版.tsv'

target_col = '翌々年度保険料率'

# 線形モデル（ベースライン）に使う変数（足し算で決定される要素）
linear_features = [
    '調整前所要保険料率', 
    '年齢調整', 
    '所得調整', 
    '精算分'
]

# XGBoost（残差予測）に使う変数（すべての要素）
xgb_features = [
    '調整前所要保険料率', '年齢調整', '所得調整', '精算分',
    '特定健診等', '特定保健指導', '対象者減少率', '受診勧奨', '後発医薬品'
]

group_col = '支部名'

# --- データ読み込み ---
df = pd.read_csv(file_path, sep='\t', encoding='utf-8')
df_clean = df.dropna().copy()

y = df_clean[target_col]
groups = df_clean[group_col]

# --- GroupKFold 交差検証 ---
gkf = GroupKFold(n_splits=5)

rmse_linear = []
r2_linear = []

rmse_xgb = []
r2_xgb = []

rmse_ensemble = []
r2_ensemble = []

print("=" * 60)
print("アンサンブルモデル（重回帰 + XGBoost）の精度比較")
print("=" * 60)

fold = 1
for train_idx, test_idx in gkf.split(df_clean, y, groups=groups):
    
    # データ分割
    df_train, df_test = df_clean.iloc[train_idx], df_clean.iloc[test_idx]
    y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]
    
    X_train_lin = df_train[linear_features]
    X_test_lin  = df_test[linear_features]
    
    X_train_xgb = df_train[xgb_features]
    X_test_xgb  = df_test[xgb_features]
    
    # --------------------------------------------------
    # 1. 線形モデル単体 (Linear Regression)
    # --------------------------------------------------
    lr_model = LinearRegression()
    lr_model.fit(X_train_lin, y_train)
    y_pred_lin = lr_model.predict(X_test_lin)
    
    rmse_lin_f = np.sqrt(mean_squared_error(y_test, y_pred_lin))
    r2_lin_f = r2_score(y_test, y_pred_lin)
    rmse_linear.append(rmse_lin_f)
    r2_linear.append(r2_lin_f)
    
    # --------------------------------------------------
    # 2. XGBoost単体
    # --------------------------------------------------
    xgb_only = xgb.XGBRegressor(objective='reg:squarederror', n_estimators=100, learning_rate=0.1, max_depth=4, random_state=42)
    xgb_only.fit(X_train_xgb, y_train)
    y_pred_xgb = xgb_only.predict(X_test_xgb)
    
    rmse_xgb_f = np.sqrt(mean_squared_error(y_test, y_pred_xgb))
    r2_xgb_f = r2_score(y_test, y_pred_xgb)
    rmse_xgb.append(rmse_xgb_f)
    r2_xgb.append(r2_xgb_f)
    
    # --------------------------------------------------
    # 3. アンサンブル (Linear -> Residual -> XGBoost)
    # --------------------------------------------------
    # 学習データの残差を計算（実際の値 - 線形予測値）
    y_train_residual = y_train - lr_model.predict(X_train_lin)
    
    # 残差をXGBoostで予測
    xgb_resid = xgb.XGBRegressor(objective='reg:squarederror', n_estimators=100, learning_rate=0.1, max_depth=3, random_state=42)
    xgb_resid.fit(X_train_xgb, y_train_residual)
    
    # テストデータに対する予測（線形予測 + 残差予測）
    y_pred_resid = xgb_resid.predict(X_test_xgb)
    y_pred_ensemble = y_pred_lin + y_pred_resid
    
    rmse_ens_f = np.sqrt(mean_squared_error(y_test, y_pred_ensemble))
    r2_ens_f = r2_score(y_test, y_pred_ensemble)
    rmse_ensemble.append(rmse_ens_f)
    r2_ensemble.append(r2_ens_f)
    
    fold += 1

print(f"【モデル1】重回帰分析（ベース構造のみ）")
print(f"  平均 RMSE: {np.mean(rmse_linear):.4f}")
print(f"  平均 R²  : {np.mean(r2_linear):.4f}\n")

print(f"【モデル2】XGBoost単体")
print(f"  平均 RMSE: {np.mean(rmse_xgb):.4f}")
print(f"  平均 R²  : {np.mean(r2_xgb):.4f}\n")

print(f"【モデル3】アンサンブル（重回帰 + 残差XGBoost）")
print(f"  平均 RMSE: {np.mean(rmse_ensemble):.4f}")
print(f"  平均 R²  : {np.mean(r2_ensemble):.4f}")
print("=" * 60)
