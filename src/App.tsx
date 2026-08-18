import { useState, useEffect } from "react";
import { KENPO_DATA, KenpoRecord } from "./data";

// 5つの指標の定義
interface Indicator {
  key: keyof Omit<KenpoRecord, "year" | "branch" | "rate">;
  name: string;
  description: string; // ユーザー向けの簡単な説明
}

const INDICATORS: Indicator[] = [
  { key: "kenshin", name: "特定健診等の実施率", description: "40歳以上の健診受診率" },
  { key: "shido", name: "特定保健指導の実施率", description: "メタボ等の保健指導率" },
  { key: "gensho", name: "特定保健指導対象者の減少率", description: "メタボ該当者の改善率" },
  { key: "kansho", name: "医療機関への受診勧奨率", description: "要治療者への受診促進" },
  { key: "generic", name: "ジェネリック医薬品の使用割合", description: "後発医薬品の利用率" },
];

// OLS重回帰分析によって得られた5つの健康指標の偏回帰係数
// (年齢、所得、調整前医療給付費、精算分を調整した上で抽出された純粋な影響度)
const OLS_COEFFICIENTS = {
  kenshin: -0.0024,   // 特定健診等の実施率が1%上がると、料率が -0.0024% 下がる
  shido: -0.0006,     // 特定保健指導の実施率が1%上がると、料率が -0.0006% 下がる
  gensho: -0.0183,    // 保健指導対象者の減少率が1%上がると、料率が -0.0183% 下がる (極めて強力)
  kansho: -0.0013,    // 受診勧奨率が1%上がると、料率が -0.0013% 下がる
  generic: -0.0093,   // ジェネリック医薬品の使用割合が1%上がると、料率が -0.0093% 下がる (強力)
};

// 浮いた金額の例え話データ
const FUN_EXAMPLES = [
  { threshold: 1000, emoji: "☕", text: (n: number) => `コンビニコーヒー 約${Math.floor(n / 150)}杯分` },
  { threshold: 5000, emoji: "🍿", text: (n: number) => `映画 約${Math.floor(n / 2000)}本分` },
  { threshold: 20000, emoji: "✈️", text: (n: number) => `国内旅行（日帰り） 約${Math.floor(n / 15000)}回分` },
  { threshold: 50000, emoji: "💻", text: (n: number) => `新しいタブレット ${Math.floor(n / 40000)}台分` },
];

// 削減額に応じた例え話を取得
const getFunExample = (amount: number) => {
  for (let i = FUN_EXAMPLES.length - 1; i >= 0; i--) {
    if (amount >= FUN_EXAMPLES[i].threshold) {
      return { emoji: FUN_EXAMPLES[i].emoji, text: FUN_EXAMPLES[i].text(amount) };
    }
  }
  return null;
};

export default function App() {
  // --- 状態管理 ---
  const [homePref, setHomePref] = useState<string>("長崎");

  // モード管理（個人 / 会社）
  const [mode, setMode] = useState<"individual" | "company">("individual");

  // 個人モード: 年収（万円）
  const [userIncome, setUserIncome] = useState<number>(400);

  // 会社モード: 各入力値
  const [companyHealthPremium, setCompanyHealthPremium] = useState<number>(500000); // 月額健康保険料(円)
  const [companyCarePremium, setCompanyCarePremium] = useState<number>(80000);      // 月額介護保険料(円)
  const [employeeCount, setEmployeeCount] = useState<number>(30);                   // 社員数
  const [seniorCount, setSeniorCount] = useState<number>(12);                       // 40歳以上の社員数

  // 5つのスライダーの変更後の値
  const [sliderVals, setSliderVals] = useState({
    kenshin: 50,
    shido: 20,
    gensho: 30,
    kansho: 10,
    generic: 80,
  });

  // --- データ取得ヘルパー ---
  // 年度は最新(6=2024)固定
  const selectedYear = 6;
  const currentYearData = KENPO_DATA.filter((r) => r.year === selectedYear);
  const homeData = currentYearData.find((r) => r.branch === homePref) || currentYearData[0];

  // 全都道府県の一覧 (セレクトボックス用)
  const allPrefs = Array.from(new Set(KENPO_DATA.filter((r) => r.year === 6).map((r) => r.branch)));

  // その年度の各指標における全都道府県の最大値・最小値の計算
  const getIndicatorLimits = (key: keyof Omit<KenpoRecord, "year" | "branch" | "rate">) => {
    const vals = currentYearData.map((r) => Number(r[key]));
    return { min: Math.min(...vals), max: Math.max(...vals) };
  };

  const limits = {
    kenshin: getIndicatorLimits("kenshin"),
    shido: getIndicatorLimits("shido"),
    gensho: getIndicatorLimits("gensho"),
    kansho: getIndicatorLimits("kansho"),
    generic: getIndicatorLimits("generic"),
  };

  // お住まいの都道府県が変更された場合、スライダーの初期値をその都道府県の現在値に更新
  useEffect(() => {
    if (homeData) {
      setSliderVals({
        kenshin: Number(homeData.kenshin),
        shido: Number(homeData.shido),
        gensho: Number(homeData.gensho),
        kansho: Number(homeData.kansho),
        generic: Number(homeData.generic),
      });
    }
  }, [homePref]);

  // --- シミュレーション計算ロジック (OLS重回帰モデルの偏回帰係数を反映) ---
  const calculateSimulation = () => {
    if (!homeData) return { simulatedRate: 0, currentYearly: 0, simulatedYearly: 0, deltaYearly: 0, currentMonthly: 0, simulatedMonthly: 0 };

    // 各指標における現在値とシミュレーション値の差分（ポイント）を計算
    const deltaKenshin = sliderVals.kenshin - Number(homeData.kenshin);
    const deltaShido = sliderVals.shido - Number(homeData.shido);
    const deltaGensho = sliderVals.gensho - Number(homeData.gensho);
    const deltaKansho = sliderVals.kansho - Number(homeData.kansho);
    const deltaGeneric = sliderVals.generic - Number(homeData.generic);

    // 回帰係数を掛け合わせ、保険料率の変化幅を算出（改善するとマイナスになる）
    const totalDelta =
      (OLS_COEFFICIENTS.kenshin * deltaKenshin) +
      (OLS_COEFFICIENTS.shido * deltaShido) +
      (OLS_COEFFICIENTS.gensho * deltaGensho) +
      (OLS_COEFFICIENTS.kansho * deltaKansho) +
      (OLS_COEFFICIENTS.generic * deltaGeneric);

    // シミュレーション後の保険料率 (実数値の範囲に収める)
    const simulatedRate = Math.max(8.0, Math.min(12.0, homeData.rate + totalDelta));
    const rateRatio = simulatedRate / homeData.rate;

    let currentYearly: number;
    let simulatedYearly: number;

    if (mode === "individual") {
      // 個人モード: 年収(万円) × 料率 / 2 (労使折半の従業員負担分) → 年額
      currentYearly = Math.round((userIncome * 10000) * (homeData.rate / 100) / 2);
      simulatedYearly = Math.round((userIncome * 10000) * (simulatedRate / 100) / 2);
    } else {
      // 会社モード: 入力された月額保険料合計をベースに算出
      const monthlyTotal = companyHealthPremium + companyCarePremium;
      currentYearly = monthlyTotal * 12;
      simulatedYearly = Math.round(monthlyTotal * rateRatio * 12);
    }

    const deltaYearly = currentYearly - simulatedYearly;
    const currentMonthly = Math.round(currentYearly / 12);
    const simulatedMonthly = Math.round(simulatedYearly / 12);

    return {
      simulatedRate: parseFloat(simulatedRate.toFixed(2)),
      currentYearly,
      simulatedYearly,
      deltaYearly,
      currentMonthly,
      simulatedMonthly,
    };
  };

  const simResult = calculateSimulation();

  // 削減か、それとも負担増か
  const isSaving = simResult.deltaYearly >= 0;
  const absDeltaYearly = Math.abs(simResult.deltaYearly);
  const absDeltaMonthly = Math.round(absDeltaYearly / 12);

  // 例え話
  const funExample = isSaving ? getFunExample(absDeltaYearly) : null;

  return (
    <div className="app-container">
      {/* ================================================================
         ヘッダー
         ================================================================ */}
      <header className="app-header">
        <div className="header-title-area">
          <svg className="header-logo-svg" viewBox="0 0 560.96 216.87" aria-label="ケンポー団">
            <defs>
              <style>{`
                .cls-1 { font-family: Futura-Medium, Futura, sans-serif; font-size: 14.87px; font-weight: 500; fill: var(--primary); }
                .cls-2 { letter-spacing: .06em; }
                .cls-3 { letter-spacing: .02em; }
                .cls-4 { letter-spacing: .05em; }
                .cls-5 { letter-spacing: .05em; }
                .cls-6 { letter-spacing: .04em; }
                .cls-7 { letter-spacing: .03em; }
              `}</style>
            </defs>
            <g fill="var(--primary)">
              <path d="M392.07,193.35c-.25-2.85.85-4.94,1.96-6.96,1.57-2.85,2.87-5.93,3.74-8.92.88-3.01,3.53-5.32,3.23-8.68,2.11-2.23,2.51-5.29,3.82-7.91,2.54-5.1,4.87-10.32,7.05-15.56,3.02-7.24,6.57-14.25,9.43-21.58,2.27-5.83,4.79-11.67,7.66-17.31,1.6-3.15,2.89-6.47,4.11-9.78,1.23-3.32,3.11-6.33,4.07-9.83.8-2.9,2.8-5.47,4.4-8.42,1.42-.63,3.14-1.51,5.15-1.14,2.47.45,4.56-1.39,7.09-1.06,2.29.3,4.88.68,6.94-.07,3.57-1.3,7.1-.81,10.63-.82,28.15-.07,56.29-.04,84.44-.04h5.17c-.16,1.58.2,2.77-.6,4.31-2.07,3.94-3.63,8.15-5.4,12.24-3.05,7.07-6.3,14.04-9.34,21.11-1.69,3.93-3.25,7.98-5.32,11.81-1.72,3.18-3.12,6.69-4.37,10.16-1.2,3.34-2.65,6.64-4.14,9.76-1.67,3.47-2.79,7.19-4.69,10.57-1.73,3.07-3.02,6.41-4.21,9.74-1.19,3.34-3.21,6.3-4.05,9.84-.47,2-1.85,3.89-2.89,5.76-1.52,2.71-4.4,4.36-7.15,5.25-3.73,1.21-7.06,3.13-10.5,4.82-3.36,1.65-6.64,2.71-10.41,2.67-9.83-.11-19.66.11-29.48-.09-5.74-.12-11.3,1.56-17.08,1.17-2.28-.15-4.22-1.47-6.58-1.17-2.13.26-4.41-.33-6.47.12-8.66,1.9-17.41.33-26.08,1-3.5.27-6.54-1.72-10.11-.97ZM487.04,107.59c-.2,5.37-4.13,8.66-6.71,12.68-.99-.33-1.3.88-2.07.96-.96.11-2.03-.2-2.83,1.28-1.01,4.64-4.76,8.55-5.76,13.71-5.09,4.97-11.17,8.49-17.37,12-.31-1.16-.31-1.95.13-2.96,3.04-6.9,5.86-13.9,8.96-20.77.53-1.16.82-2,.22-3.26-5.17.18-10.4-.25-15.95.28,2.23,4.88,4.91,9.08,6.54,13.71-2.41,3.77-6.37,4.43-9.75,5.75-1.39-1.07-2.81-.72-4.22-.58-2.62,6.98-6.2,13.45-8.34,20.74h55.84c.18-.74.96-1.03,1.35-1.86,3.48-7.4,5.98-15.2,9.27-22.65,3.61-8.17,6.76-16.53,10.61-24.6,2.26-4.74,4.6-9.51,5.71-14.6h-56.58c.37,3.7-3.72,5.96-2.97,9.72h15.51c1.21-1.25,2.53-2.23,2.87-3.93,4.1-1.06,8.12-2.1,11.98-3.1,1.57,2.26-.98,3.58-.47,5.34.5,2.16,2.58,1.52,4.03,2.14Z"/>
              <path d="M62.51,110.25h-19.8c-1.62,1.02-3.46,2.17-5.44,3.41-.32,1.27-1.72,2.44-1.34,4.17-2.9,2.8-5.41,6.08-10.32,7.42.21,0-.46-.03-1.13,0-8.06.47-16.04-.59-24.19-1.26-.55-.89-.29-1.72.25-2.92,1.37-3.09,2.66-6.22,3.72-9.46.99-3.04,2.66-5.9,3.99-8.83,2.03-4.48,4.02-9.01,6.08-13.49,3.47-7.57,7.19-15.01,11.16-22.92,3.94-2.1,8.7-1.37,13.29-.75,3.5.48,6.12.88,9.43-.07,2.42-.69,4.9-.11,7.28-.34.55.55,1.02,1.02,1.49,1.49,0,.47.03.88-.24,1.37-3.25,5.98-6.28,12.06-7.83,18.75-.09.38-.54.67-1.18,1.41h69.91c.99,1.54-.21,2.18-.66,2.83-4.74,6.81-10.29,12.94-16.06,18.83-1.12.66-2.3.19-3.66.4-2.54,3.42-3.6,7.73-5.11,11.73-1.57,4.18-3.24,8.33-4.92,12.46-2.14,5.28-3.9,10.7-6.16,15.94-1.28,2.96-2.19,6.08-3.67,8.98-1.11,2.19-1.86,4.56-2.87,6.81-3.03,6.75-7.61,12.55-11.67,18.66-1.66,2.5-2.89,5.34-5.24,7.21h-29.57c.43-1.64.62-3.19,1.23-4.55,2.03-4.5,4.32-8.87,6.29-13.39,2.28-5.22,4.28-10.56,6.47-15.82,1.12-2.7,2.43-5.32,3.53-8.04,2.73-6.7,5.81-13.26,8.77-19.86,2.46-5.48,4.9-10.97,7.46-16.4.53-1.12-.68-2.75.73-3.79Z"/>
              <path d="M93.61,148.27c5.59.16,11.02-1.78,16.61-1.02,6.27-1.97,12.72-.88,19.07-.94,11.2-.09,22.35-1.81,33.57-1.06,1.25.08,2.7-.5,3.51.79,2.74-.45,3.61-2.64,4.66-4.76,7.73-15.62,15.5-31.23,23.3-46.81.78-1.56,1.41-3.32,3.92-4.22h6.22c3.5,0,7,.06,10.49-.02,3.21-.08,6.26-1.8,9.85-.72,1.47,1.23,1.83,2.84.58,4.9-1.2,1.97-2.25,4.06-3.19,6.17-3.06,6.9-6.36,13.69-9.48,20.56-2.42,5.35-5.02,10.59-7.67,15.81-1.38,2.73-2.01,5.81-3.67,8.48-1.14,1.82-2.18,3.78-2.79,5.82-.68,2.26-3.35,3.08-3.6,5.51-6.04,5.9-9.88,13.64-16.47,19.37h-94.09c-1.83-1.01-1.88-2.97-1.34-4.35,2.45-6.16,4.41-12.49,6.94-18.61.79-1.91,1.73-3.78,3.57-4.9Z"/>
              <path d="M273.63,121.32c-3.12,2.19-4.35,5.04-4.6,8.37-.05.69-.37,1.16-.65,1.74-2.19,4.58-4.27,9.22-6.38,13.84-2.67,5.89-5.73,11.64-7.86,17.72-1.41,4.01-4.4,5.99-7.64,6.99-3.29,1.01-6.08,3.04-9.45,3.8-2.22.5-4.28,1.71-6.05,2.45-.92-.62-1.6-1.07-2.31-1.55,2.46-4.01,3.6-8.22,5.48-12.09,1.89-3.88,3.28-8,5.09-11.87,1.95-4.19,3.66-8.49,5.67-12.65,2.59-5.36,4.68-10.96,7.07-16.66h-32.34l-1.59-1.59c-.03-.31-.18-.7-.06-.95,2.97-5.97,7.03-11.18,11.15-16.39,3-3.79,5.69-7.82,9.31-11.19h24.7c3.97-2.5,4.99-7.23,8.35-10.04h17.3c.31,3.56-2.44,6.24-2.83,9.77h38.34c.68.65,1.25,1.2,1.73,1.67-2.18,7.05-6.42,12.97-8.34,20.33-.9.79-2.15,1.88-3.67,3.21-2.48-.55-5.12.9-7.92,1.42-3.83.71-7.62,1.65-11.4,2.62-6.97,1.78-14.05.61-21.14,1.06Z"/>
              <path d="M416.75,119.25c.84,2.41-.28,4.09-1.05,5.77-1.54,3.36-3.3,6.62-4.9,9.96-1.86,3.89-3.87,7.71-4.98,11.92-.11.42-.67.71-1.32,1.36-1,0-2.29.04-3.58,0-9.37-.38-18.65,1.45-28.05,1.09-9.64-.37-19.3-.08-28.95-.08h-33.49c-.85-1.76-.22-3.22.5-4.93,2.2-5.25,4.02-10.65,6.09-15.95,1.17-3.01,2.54-5.95,3.71-8.66,1.65-.81,3.01-.53,4.26-.42,7.9.66,15.67-1.22,23.55-1.07,7.82.15,15.65.31,23.46-.05,7.42-.34,14.69,1.13,22.05,1.09,7.49-.04,14.97,0,22.68,0Z"/>
              <path d="M213.1,20.25c1.87,0,4.04-.03,6.2,0,3.22.05,5.21-1.49,6.77-4.31,2.33-4.2,4.05-8.72,6.85-12.69.77-1.09,1.83-1.83,2.47-2.88h15.45c.08,1.54.32,2.76-.57,4.24-2.15,3.57-3.27,7.7-5.98,11.04-.51.63-1.53,1.67-1.28,2.92.08.13.14.28.25.39.11.11.26.25.39.25,11.32.01,22.63.01,33.97.01.96,1.86.11,3.36-.58,5.01-3.03,7.24-6.31,14.37-9.34,21.61-2.25,5.38-4.61,10.75-6.95,16.11-1.17,2.68-1.86,5.62-3.78,7.88-7.81,1.78-15.78,1-23.41,2.65-1.17-2.43-.12-3.78,1.05-5.55,1.76-2.68,3.37-5.4,5.98-7.75h6.47c3.6-8.53,7.2-17.03,10.81-25.58-1.33-.43-2.79-1.27-4.27-1.32-4.99-.17-9.99-.07-14.75-.07-3.77,1.6-5.63,4.54-7.38,7.88-1.94,3.69-4.29,7.2-5.85,11.08-.99,2.47-2.05,4.83-3.58,7.02-.93,1.33-1.88,2.29-3.4,3.12-5.18,2.82-10.49,5.45-15.34,8.86-1.36.96-3.05,1.44-4.6,2.14-1.55-1.49-.45-2.6.29-3.83,4.69-7.83,8.33-16.21,12.52-24.29,1.83-3.52,3.55-7.1,5.52-11.05-8.04.91-15.79-2.52-23.71-.28-.36-.29-.86-.69-1.55-1.25,6.91-3.96,13.61-7.85,21.32-11.4Z"/>
              <path d="M150.82,33.38c-5.89-.12-11.61-1.51-17.53-1.2-5.96.31-11.95.07-17.8.07-.58-.6-1.01-1.06-1.48-1.56,2.76-2.5,6.23-3.82,9.45-5.11,3.03-1.21,5.86-2.77,8.82-4.07,3.04-1.34,6.09-2.5,9.56-2.3,3.49.2,7,.04,10.5.04,1.76,0,3.58.29,5.09-1.21,1.89-2.8,2.69-6.3,4.39-9.44,1.11-2.05,2.75-3.01,4.22-3.19,3.32-.42,6.5-1.4,9.54-2.45,2.94-1.01,6.1-1.08,8.94-2.55,1.28-.66,3.31-.66,4.25,1.1-2.3,5.74-5.05,11.23-6.82,17.42,2.19.74,4.51,0,6.74.47.68,1.05.18,2.23.34,3.44-2.9,1.91-4.16,5.32-6.71,7.64-1.44,1.31-2.84,2.56-4.86,2.76-1.51.15-2.36.94-2.42,2.44-.03.69-.35,1.16-.63,1.75-3.52,7.37-6.95,14.78-10.38,22.19-1.69,3.63-3.32,7.29-5.02,10.92-.27.57-.8,1.01-1.18,1.48h-33.69c-.28-.96.04-1.45.55-1.95,1.8-1.74,3.65-3.43,5.29-5.31,2.3-2.64,5.23-3.51,8.55-3.52,4.77-8.93,8.45-18.35,12.3-27.84Z"/>
              <path d="M413.94.37h18.15c-.43,6.79-4.63,12.19-6.06,18.81,2.35.15,4.86-.24,6.86,1.45-2.51,4.3-4.37,9.03-8.42,12.62h-3.92c-2.03,1.59-1.95,4.06-4.03,6.05h22.32c.52,2.05-.97,2.76-1.89,3.4-3.3,2.29-6.45,4.72-9.38,7.47-1.43,1.34-3.06,2.16-5.13,2.1-3.32-.09-6.65-.02-10.23-.02-3.64,5.84-5.23,12.83-9.11,18.42-.98.98-2.03.5-2.97.57-3.86.29-7.8-.64-11.6.95-.96.4-2.24.06-3.43.06-.33-2.93.64-5.14,1.76-7.46,1.61-3.31,2.81-6.82,4.11-10.28.21-.56.03-1.28.03-2.09h-18.34c-.63-.64-1.09-1.11-1.6-1.63.3-.33.54-.77.92-.99,5.27-3.03,10.6-5.94,15.6-9.43.93-.65,2.33-1.56,4.02-1.19,1.58.35,3.3.07,4.9.07,1.86-1.48,2-3.92,3.82-5.93h-8.74c-.7-.7-1.06-1.06-1.4-1.4-1.11-4.55,1.91-7.08,4.55-10,3.12-3.46,7.1-2.48,10.69-2.7,3.7-6.07,5.85-12.72,8.52-18.85Z"/>
              <path d="M299.49,34.25c-1.94-2.86,1.78-3.44,1.53-5.47,3.77-2.11,7.55-4.23,11.65-6.53,1.48,0,3.32-.2,5.1.05,1.92.27,3.35-.8,4.99-1.31,1.86-4.73,3.73-9.46,5.85-14.85.52-.52,1.58-1.58,2.77-2.77h15.59c-1.32,6.43-5.61,11.95-6.14,18.77h3.79c1.73-2.1,4.49-3.72,5.87-6.81h16.12c1.65,2.08-1.55,3.56-.49,5.53,1.58,1.59,4.37.79,5.79,2.8-2.21,3.35-3.06,7.53-6.32,10.53h-5.29c-3.59,8.83-7.12,17.53-10.58,26.06-5.32,2.83-10.38,5.51-15.43,8.21-.82.44-1.75.8-2.39,1.44-1.84,1.83-3.99,2.66-6.54,2.32-1-.14-1.35.78-2.33,1.12-1.03-1.01-2.68-.95-4.44-1.55,3.97-6.24,10.91-8.64,14.9-13.5,3.24-8.09,6.03-15.86,9.14-24.58-10.29,3.15-18.69,8.32-27.76,10.92-1.93-2.12.19-3.33.17-4.83-.02-1.65,1.27-2.75,1.9-4.14-.47-.47-.94-.94-1.41-1.41-5.33,0-10.67,0-16.02,0Z"/>
              <path d="M255.12,175.73c1.63-3.84,3.47-7.59,4.84-11.5,2.65-7.55,7.2-16.75,11.69-23.14,2.89-4.11,5.66-8.31,8.74-12.84,3.69,0,7.64-.13,11.58.04,3.66.16,7.52-1.05,11.13,1.57-5.74,12.95-10.65,26.38-16.75,38.75-6.55,2.24-12.53,4.32-18.53,6.31-2.64.88-5.31,1.75-8.04,2.26-1.49.28-3.35.63-4.67-1.44Z"/>
              <path d="M179.9,88.42v4.3c-2.92,3.87-2.12,9.47-6.59,12.57-1.63-.61-3.13.64-4.82.95-1.7.31-3.65-.72-5.07,1.02-5-.24-9.6,2.48-14.63,2-6.58,2.18-13.37.27-20.26,1.23-.49-.63-.98-1.27-1.75-2.25,2.44-6.48,4.84-13.3,8.11-19.81h45Z"/>
              <path d="M222.52,171.31c-6.91,1.48-13.74,4.23-20.88,5.22-.89-1.41-.61-2.24-.08-3.44,3.55-8.01,7.37-15.89,10.86-23.91,2.08-4.79,4.7-9.34,6.44-14.28.74-2.12,1.66-4.12,3.71-5.56h18.12c.51,1.2.18,2.04-.33,3.18-4.49,9.94-8.97,19.89-13.7,29.72-1.32,2.74-2.61,5.56-4.13,9.07Z"/>
              <path d="M342.89,97.74c1.53-3.39,1.27-6.5,3.01-9.05-.84-.98-2.06-.21-3.31-.5-3.21,2.84-4.08,6.69-4.68,10.5,1.12,1.02,2.35,0,3.04,1-3.79,4.61-8.28,7.63-14.64,6.38-.44-.46-.89-.93-1.43-1.5,2.36-5.35,4.26-10.9,7.03-16.09.39-.74,1.13-1.43,1.15-2.53.06-2.84,1.67-4.68,5.67-5.7,2.15,0,5.66.25,9.12-.07,3.49-.33,6.55,1.7,10.28.95-.64,4.5-1.84,8.21-5.26,10.71-2.95,2.15-5.75,4.7-9.98,5.91Z"/>
              <path d="M297.16,11.26c-.69-3.45-1.77-6.52-.94-9.79,1.7-.72,2.22.51,2.79,1.71,1.65,3.47,3.2,6.98,4.17,10.72.07.28.45.47.68.71-.43,1.63-2.34,1.35-3.17,2.46-2.86-1.64-5.99-.39-9.19-.92-.65.84-1.36,1.75-2.43,3.13.25,1.79-.45,3.98-2.47,5.88-2.4-1.35-2.12-4.25-3.17-6.27-1.06-2.05-2.28-4.63-1.12-7.62h14.86Z"/>
            </g>
            <text className="cls-1" transform="translate(68.16 192.04) scale(.84) skewX(-33.05)"><tspan className="cls-3" x="0" y="0">K</tspan><tspan className="cls-5" x="10.14" y="0">en</tspan><tspan className="cls-7" x="28.01" y="0">k</tspan><tspan className="cls-4" x="35.86" y="0">ou Estimation </tspan><tspan className="cls-2" x="140.24" y="0">N</tspan><tspan className="cls-5" x="153.68" y="0">agasaki P</tspan><tspan className="cls-6" x="225.78" y="0">r</tspan><tspan className="cls-4" x="231.96" y="0">oject Organization</tspan></text>
          </svg>
          <div className="title-group">
            <h1 className="header-title">協会けんぽ 保険料削減シミュレーター</h1>
            <p className="disclaimer-text">
              ※ 本シミュレーターの数値は統計モデルに基づく<strong>概算・目安</strong>です。実際の保険料率を保証するものではありません。
            </p>
          </div>
        </div>
      </header>

      {/* ================================================================
         メインレイアウト（上段: 結果バナー、下段: 2カラム入力+スライダー）
         ================================================================ */}
      <main className="main-layout">

        {/* === 上段: シミュレーション結果（メイン表示） === */}
        <section className="glass-card results-banner">
          <div className="result-main-info">
            <h2 className="result-headline">📊 シミュレーション結果</h2>

            {/* 保険料率の変化 */}
            <div className="rate-comparison-strip">
              <div className="rate-box">
                <span className="rate-label">現在の保険料率（{homePref}県）</span>
                <span className="rate-value current">{homeData ? homeData.rate.toFixed(2) : "-"}%</span>
              </div>
              <div className="rate-arrow">→</div>
              <div className="rate-box">
                <span className="rate-label">改善後の保険料率</span>
                <span className="rate-value simulated">{simResult.simulatedRate.toFixed(2)}%</span>
              </div>
            </div>

            {/* 金額の比較 */}
            <div className="amount-comparison">
              <div className="amount-box">
                <span className="amount-label">現在の{mode === "individual" ? "年間保険料（自己負担）" : "年間保険料（会社負担）"}</span>
                <span className="amount-value current">{simResult.currentYearly.toLocaleString()}<small>円</small></span>
                <span className="amount-monthly">月額 {simResult.currentMonthly.toLocaleString()}円</span>
              </div>
              <div className="amount-arrow">➔</div>
              <div className="amount-box">
                <span className="amount-label">健康指標改善後</span>
                <span className="amount-value simulated">{simResult.simulatedYearly.toLocaleString()}<small>円</small></span>
                <span className="amount-monthly">月額 {simResult.simulatedMonthly.toLocaleString()}円</span>
              </div>
            </div>

            {/* 削減/負担増のハイライト */}
            <div className={`savings-banner ${isSaving ? "" : "warning"}`}>
              <span className="savings-banner-amount">
                {isSaving ? "✨" : "⚠️"} 年間 {absDeltaYearly.toLocaleString()} 円の{isSaving ? "削減" : "負担増"}
              </span>
              <span className="savings-banner-sub">
                （月々 {absDeltaMonthly.toLocaleString()} 円{isSaving ? "お得" : "の支出増"}）
              </span>
            </div>
          </div>

          {/* サイドカラム: 例え話＆傷病手当金 */}
          <div className="result-side-info">
            {funExample && isSaving && (
              <div className="fun-fact-card">
                <span className="fun-fact-emoji">{funExample.emoji}</span>
                <div className="fun-fact-body">
                  <span className="fun-fact-lead">浮いた金額で...</span>
                  <strong className="fun-fact-main">{funExample.text}</strong>
                </div>
              </div>
            )}
            <div className="info-card nagasaki">
              <h4>💡 長崎県の傷病手当金</h4>
              <p>
                長崎県の傷病手当金1件あたりの平均受給額は<strong>約26.2万円</strong>（全国平均よりやや高め）。
                健康指標の改善は保険料率を下げるだけでなく、従業員の病欠リスクの低減にも貢献します。
              </p>
            </div>
          </div>
        </section>

        {/* === 下段: 2カラム（左: 設定入力、右: 5指標スライダー） === */}
        <div className="main-grid">
          {/* 左カラム: 設定・入力フォーム */}
          <section className="glass-card input-section">
            <h2 className="section-title">⚙️ シミュレーション設定</h2>

            {/* モード切替タブ */}
            <div className="mode-tabs">
              <button
                className={`mode-tab ${mode === "individual" ? "active" : ""}`}
                onClick={() => setMode("individual")}
              >
                👤 個人モード
              </button>
              <button
                className={`mode-tab ${mode === "company" ? "active" : ""}`}
                onClick={() => setMode("company")}
              >
                🏢 会社モード
              </button>
            </div>

            <div className="input-form-area">
              {/* 都道府県選択 */}
              <div className="control-group">
                <label className="control-label">お住まい / 事業所の都道府県</label>
                <select
                  className="custom-select"
                  value={homePref}
                  onChange={(e) => setHomePref(e.target.value)}
                >
                  {allPrefs.map((p) => (
                    <option key={p} value={p}>{p}県</option>
                  ))}
                </select>
              </div>

              {/* --- 個人モード --- */}
              {mode === "individual" && (
                <>
                  <div className="control-group">
                    <label className="control-label">年収の目安</label>
                    <p className="input-hint">
                      給与明細の「支給額合計」×12ヶ月（＋賞与）の概算額をご入力ください。
                      健康保険料は年収に基づいて算定されます。
                    </p>
                    <div className="input-with-unit">
                      <input
                        type="number"
                        className="custom-input"
                        value={userIncome}
                        onChange={(e) => setUserIncome(Math.max(0, Number(e.target.value)))}
                        min={0}
                      />
                      <span className="input-unit">万円</span>
                    </div>
                  </div>
                  <div className="mynaportal-mock">
                    <button className="mynaportal-btn" disabled>
                      🐰 マイナポータルから自動入力（準備中）
                    </button>
                  </div>
                </>
              )}

              {/* --- 会社モード --- */}
              {mode === "company" && (
                <>
                  <div className="control-group">
                    <label className="control-label">月額健康保険料（会社負担分）</label>
                    <p className="input-hint">
                      協会けんぽからの領収書に記載されている月額の健康保険料をご入力ください。
                    </p>
                    <div className="input-with-unit">
                      <input
                        type="number"
                        className="custom-input"
                        value={companyHealthPremium}
                        onChange={(e) => setCompanyHealthPremium(Math.max(0, Number(e.target.value)))}
                        min={0}
                      />
                      <span className="input-unit">円/月</span>
                    </div>
                  </div>
                  <div className="control-group">
                    <label className="control-label">月額介護保険料（会社負担分）</label>
                    <p className="input-hint">
                      40歳以上の従業員がいる場合に発生する介護保険料をご入力ください。
                    </p>
                    <div className="input-with-unit">
                      <input
                        type="number"
                        className="custom-input"
                        value={companyCarePremium}
                        onChange={(e) => setCompanyCarePremium(Math.max(0, Number(e.target.value)))}
                        min={0}
                      />
                      <span className="input-unit">円/月</span>
                    </div>
                  </div>
                  <div className="control-group">
                    <label className="control-label">協会けんぽ加入社員数</label>
                    <div className="input-with-unit">
                      <input
                        type="number"
                        className="custom-input"
                        value={employeeCount}
                        onChange={(e) => setEmployeeCount(Math.max(1, Number(e.target.value)))}
                        min={1}
                      />
                      <span className="input-unit">人</span>
                    </div>
                  </div>
                  <div className="control-group">
                    <label className="control-label">うち40歳以上の社員数</label>
                    <div className="input-with-unit">
                      <input
                        type="number"
                        className="custom-input"
                        value={seniorCount}
                        onChange={(e) => setSeniorCount(Math.max(0, Math.min(employeeCount, Number(e.target.value))))}
                        min={0}
                        max={employeeCount}
                      />
                      <span className="input-unit">人</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* 右カラム: 5指標スライダー */}
          <section className="glass-card slider-section">
            <div className="slider-header">
              <h2 className="section-title">🎛 健康5指標を調整してみよう</h2>
              <button
                className="reset-btn"
                onClick={() => {
                  if (homeData) {
                    setSliderVals({
                      kenshin: Number(homeData.kenshin),
                      shido: Number(homeData.shido),
                      gensho: Number(homeData.gensho),
                      kansho: Number(homeData.kansho),
                      generic: Number(homeData.generic),
                    });
                  }
                }}
              >
                🔄 初期値に戻す
              </button>
            </div>
            <p className="slider-guide">
              各指標のスライダーを動かすと、保険料率と保険料の変化がリアルタイムで上に反映されます。
            </p>
            <div className="slider-grid">
              {INDICATORS.map((ind) => {
                const key = ind.key;
                const value = sliderVals[key];
                const min = limits[key].min;
                const max = limits[key].max;
                const homeVal = homeData ? Number(homeData[key]) : 0;

                return (
                  <div className="slider-card" key={key}>
                    <div className="slider-title">{ind.name}</div>
                    <div className="slider-description">{ind.description}</div>
                    <div className="reference-value">
                      現在値: <span>{homeVal.toFixed(1)}%</span>
                    </div>
                    <div className="vertical-slider-wrapper">
                      <input
                        type="range"
                        min={min}
                        max={max}
                        step={0.1}
                        value={value}
                        className="slider-vertical"
                        onChange={(e) =>
                          setSliderVals({
                            ...sliderVals,
                            [key]: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="slider-value">{value.toFixed(1)}%</div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </main>

      {/* ================================================================
         フッター
         ================================================================ */}
      <footer className="app-footer">
        <p>&copy; 長大データバンクデータ塾「長崎県民の手取りを増やす」All Rights Reserved.</p>
      </footer>
    </div>
  );
}
