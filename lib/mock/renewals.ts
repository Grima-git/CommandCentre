// Mock data for George's Renewals Intelligence dashboard.
// Replace each function with a real connector call when ready (Salesforce,
// telephony, BI warehouse, etc). The shapes below are the contract — change
// them only if the dashboard component shape needs to change too.

export type Trend = { x: string; y: number };

export type RevenuePulse = {
  grossWrittenPremium: { value: number; deltaPct: number; trend: Trend[] };
  renewalRate: { value: number; deltaPP: number; trend: Trend[] };
  renewalPremiumValue: { value: number; deltaPct: number; trend: Trend[] };
  lapseRate: { value: number; deltaPP: number; trend: Trend[] };
  avgPremiumPerPolicy: { value: number; deltaPct: number; trend: Trend[] };
  newVsRenewal: { newBusinessPct: number; renewalsPct: number };
};

export type RenewalFunnel = {
  quotesGenerated: number;
  quotesViewed: { count: number; conversionPct: number; deltaPP: number };
  quotesAccepted: { count: number; conversionPct: number; deltaPP: number };
  policiesRenewed: { count: number; conversionPct: number; deltaPP: number };
  overallConversionPct: number;
  overallConversionDeltaPP: number;
  renewalRateByCount: number;
  renewalRateByCountDeltaPP: number;
};

export type PremiumTrendPoint = { date: string; renewals: number; newBusiness: number; addOns: number };

export type PremiumTrend = {
  series: PremiumTrendPoint[];
  totalThisWeek: number;
  totalLastWeek: number;
  deltaPct: number;
};

export type RiskAlert = {
  id: string;
  severity: "critical" | "warning" | "info" | "success";
  title: string;
  description: string;
};

export type AiInsight = {
  id: string;
  icon: "chart" | "cohort" | "forecast";
  title: string;
  body: string;
  cta: string;
};

export type RateMetric = { value: number; deltaPP: number; trend: Trend[] };

export type InsurerEntry = {
  insurer: string;
  count: number;
  premium: number;
  pct: number;
};

export type PerformanceMetrics = {
  financePenRate: RateMetric;
  legalAddonRate: RateMetric;
  breakdownAddonRate: RateMetric;
  insurerBreakdown: InsurerEntry[];
  totalPolicies: number;
};

const trend = (base: number, n = 14, jitter = 0.08): Trend[] =>
  Array.from({ length: n }, (_, i) => ({
    x: `t-${n - i}`,
    y: base * (1 + (Math.sin(i / 2) * jitter) + (i / n) * 0.05),
  }));

export function getRevenuePulse(): RevenuePulse {
  return {
    grossWrittenPremium: { value: 4_280_000, deltaPct: 12.4, trend: trend(4_000_000) },
    renewalRate: { value: 78.6, deltaPP: 4.3, trend: trend(76) },
    renewalPremiumValue: { value: 3_360_000, deltaPct: 11.7, trend: trend(3_100_000) },
    lapseRate: { value: 12.4, deltaPP: -2.1, trend: trend(13) },
    avgPremiumPerPolicy: { value: 612, deltaPct: 5.8, trend: trend(580) },
    newVsRenewal: { newBusinessPct: 36, renewalsPct: 64 },
  };
}

export function getRenewalFunnel(): RenewalFunnel {
  return {
    quotesGenerated: 22_145,
    quotesViewed: { count: 13_782, conversionPct: 62.2, deltaPP: -3.6 },
    quotesAccepted: { count: 9_438, conversionPct: 43.8, deltaPP: -2.8 },
    policiesRenewed: { count: 7_382, conversionPct: 33.3, deltaPP: 2.4 },
    overallConversionPct: 33.3,
    overallConversionDeltaPP: 2.4,
    renewalRateByCount: 78.6,
    renewalRateByCountDeltaPP: 4.3,
  };
}

export function getPremiumTrend(): PremiumTrend {
  const days = ["10 May", "11 May", "12 May", "13 May", "14 May", "15 May", "16 May"];
  const series: PremiumTrendPoint[] = days.map((date, i) => ({
    date,
    renewals: 380_000 + i * 12_000 + Math.sin(i) * 30_000,
    newBusiness: 220_000 + i * 8_000 + Math.cos(i) * 20_000,
    addOns: 40_000 + i * 1_500,
  }));
  return {
    series,
    totalThisWeek: 4_280_000,
    totalLastWeek: 3_810_000,
    deltaPct: 12.4,
  };
}

export function getRiskAlerts(): RiskAlert[] {
  return [
    {
      id: "a1",
      severity: "critical",
      title: "Renewal rate dropped below target",
      description: "Current: 78.6%   Target: 80%",
    },
    {
      id: "a2",
      severity: "warning",
      title: "Lapse rate spike detected",
      description: "12.4% today  · 2.1pp vs yesterday",
    },
    {
      id: "a3",
      severity: "warning",
      title: "17–18 age band at high risk",
      description: "Renewal rate: 62.1%",
    },
    {
      id: "a4",
      severity: "info",
      title: "Pricing competitiveness alert",
      description: "3 regions flagged",
    },
    {
      id: "a5",
      severity: "success",
      title: "Strong renewal cohort detected",
      description: "20–24 high score segment",
    },
  ];
}

export function getPerformanceMetrics(): PerformanceMetrics {
  const t = (base: number) => trend(base, 14, 0.1);
  return {
    financePenRate: { value: 54, deltaPP: 3.2, trend: t(51) },
    legalAddonRate: { value: 38, deltaPP: -2.1, trend: t(40) },
    breakdownAddonRate: { value: 22, deltaPP: 1.4, trend: t(21) },
    totalPolicies: 92,
    insurerBreakdown: [
      { insurer: "Ageas (Telematics)", count: 28, premium: 32450, pct: 30.4 },
      { insurer: "Sabre Insurance", count: 22, premium: 26200, pct: 23.9 },
      { insurer: "Markerstudy (Telematics)", count: 18, premium: 21800, pct: 19.6 },
      { insurer: "Marmalade", count: 14, premium: 18600, pct: 15.2 },
      { insurer: "Sabre Telematics", count: 10, premium: 11200, pct: 10.9 },
    ],
  };
}

export function getAiInsights(): AiInsight[] {
  return [
    {
      id: "i1",
      icon: "chart",
      title: "Why did renewal rate drop?",
      body:
        "Renewal rate dropped 2.1pp yesterday primarily due to a lapse spike in the 17–19 low score segment in the North West.",
      cta: "View analysis",
    },
    {
      id: "i2",
      icon: "cohort",
      title: "Which cohort is most at risk?",
      body:
        "17–18 low score drivers in the North West have the highest risk of lapse with a predicted renewal rate of 48%.",
      cta: "View cohorts",
    },
    {
      id: "i3",
      icon: "forecast",
      title: "Predict next 7 days income",
      body:
        "We predict £3.12M in premium income over the next 7 days, a 6.3% increase vs the previous 7 days.",
      cta: "View forecast",
    },
  ];
}
