// Data orchestrator for the renewals dashboard.
//
// Each function tries the live connector first; if the connector returns null
// (not configured, network failure, mapping error), we transparently fall back
// to the mock data so the dashboard always renders.
//
// This is the only module the dashboard pages should import from. Swap the
// connector module to point at a different platform without touching the UI.

import * as mock from "@/lib/mock/renewals";
import * as api from "./connectors/renewals-api";
import type {
  RevenuePulse,
  RenewalFunnel,
  PremiumTrend,
  RiskAlert,
  AiInsight,
  PerformanceMetrics,
} from "@/lib/mock/renewals";

export type DataSource = "live" | "mock";

export type DataResult<T> = { data: T; source: DataSource };

async function withFallback<T>(
  live: () => Promise<T | null>,
  fallback: () => T,
): Promise<DataResult<T>> {
  const liveData = await live();
  if (liveData !== null) return { data: liveData, source: "live" };
  return { data: fallback(), source: "mock" };
}

export function getRevenuePulse(): Promise<DataResult<RevenuePulse>> {
  return withFallback(api.fetchRevenuePulse, mock.getRevenuePulse);
}

export function getRenewalFunnel(): Promise<DataResult<RenewalFunnel>> {
  return withFallback(api.fetchRenewalFunnel, mock.getRenewalFunnel);
}

export function getPremiumTrend(): Promise<DataResult<PremiumTrend>> {
  return withFallback(api.fetchPremiumTrend, mock.getPremiumTrend);
}

export function getRiskAlerts(): Promise<DataResult<RiskAlert[]>> {
  return withFallback(api.fetchRiskAlerts, mock.getRiskAlerts);
}

export function getAiInsights(): Promise<DataResult<AiInsight[]>> {
  return withFallback(api.fetchAiInsights, mock.getAiInsights);
}

export function getPerformanceMetrics(): Promise<DataResult<PerformanceMetrics>> {
  return withFallback(api.fetchPerformanceMetrics, mock.getPerformanceMetrics);
}

export function isLiveSourceConfigured(): boolean {
  return api.isRenewalsApiConfigured();
}
