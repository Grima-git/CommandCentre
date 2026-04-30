import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, opts?: { compact?: boolean; currency?: string; decimals?: number }) {
  const currency = opts?.currency ?? "GBP";
  const symbol = currency === "GBP" ? "£" : currency === "USD" ? "$" : "";
  const dec = opts?.decimals ?? 0;
  if (opts?.compact) {
    if (value >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `${symbol}${(value / 1_000).toFixed(0)}K`;
    return `${symbol}${value.toFixed(dec)}`;
  }
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  }).format(value);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-GB").format(value);
}

export function formatPercent(value: number, digits = 1) {
  return `${value.toFixed(digits)}%`;
}

export function formatPP(value: number) {
  const sign = value >= 0 ? "" : "";
  return `${sign}${Math.abs(value).toFixed(1)}pp`;
}
