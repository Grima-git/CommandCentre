"use client";

import { FormEvent, useState } from "react";
import type { ReactNode } from "react";
import { AlertCircle, BriefcaseBusiness, Car, FileSearch, Gauge, Loader2, MapPin, Search, ShieldCheck } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type { PolicyInfoRow } from "@/lib/data/connectors/opengi-soap";

type SearchResponse =
  | { ok: true; policyRef: string; count: number; results: PolicyInfoRow[] }
  | { ok: false; error: string };

function cleanRef(value: string) {
  return value.trim().toUpperCase();
}

export function PolicySearchOverview() {
  const [policyRef, setPolicyRef] = useState("");
  const [searchedRef, setSearchedRef] = useState("");
  const [results, setResults] = useState<PolicyInfoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ref = cleanRef(policyRef);
    if (!ref) {
      setError("Enter a policy reference");
      return;
    }

    setLoading(true);
    setError(null);
    setResults([]);
    setSearchedRef(ref);
    try {
      const params = new URLSearchParams({ policyRef: ref });
      const res = await fetch(`/api/policy-search?${params.toString()}`);
      const json = (await res.json().catch(() => null)) as SearchResponse | null;
      if (!res.ok || !json?.ok) {
        const message = json && "error" in json ? json.error : `HTTP ${res.status}`;
        throw new Error(message);
      }
      setResults(json.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Policy search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto min-h-0">
      <div className="sticky top-0 z-10 bg-bg-base/90 backdrop-blur-sm px-8 pt-6 pb-5 border-b border-bg-line">
        <div className="flex items-center justify-between gap-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Policy Search</h1>
            <p className="text-sm text-txt-muted mt-0.5">OpenGI policy lookup by policy reference</p>
          </div>
          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <div className="flex items-center gap-2 w-80 bg-bg-elev rounded-xl px-3 py-2 border border-bg-line focus-within:border-brand-purple/60 transition-colors">
              <Search className="w-4 h-4 text-txt-muted" />
              <input
                value={policyRef}
                onChange={(event) => setPolicyRef(event.target.value)}
                placeholder="Policy ref, e.g. ABC12PC01"
                className="w-full bg-transparent outline-none text-sm text-txt-primary placeholder:text-txt-muted uppercase"
                maxLength={40}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-purple text-white text-sm font-medium hover:bg-brand-purple/90 disabled:opacity-60 transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSearch className="w-4 h-4" />}
              Search
            </button>
          </form>
        </div>
      </div>

      <div className="px-8 py-6 space-y-4">
        {!searchedRef && !loading && !error && (
          <div className="rounded-2xl border border-bg-line bg-bg-card p-8 flex items-center gap-5">
            <div className="w-12 h-12 rounded-xl bg-brand-purple/15 text-brand-purple flex items-center justify-center">
              <FileSearch className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm font-semibold">Search for a policy</div>
              <div className="text-sm text-txt-muted mt-1">Enter a policy reference to pull client and vehicle details from OpenGI.</div>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-brand-red/30 bg-brand-red/10 p-4 flex items-center gap-3 text-sm text-brand-red">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        {searchedRef && !loading && !error && results.length === 0 && (
          <div className="rounded-2xl border border-bg-line bg-bg-card p-8 text-center">
            <div className="text-sm font-semibold">No policy found</div>
            <div className="text-sm text-txt-muted mt-1">No OpenGI result came back for {searchedRef}.</div>
          </div>
        )}

        {results.map((policy, index) => (
          <PolicyCard key={`${policy.policyRef}-${index}`} policy={policy} />
        ))}
      </div>
    </div>
  );
}

function InfoTile({
  label,
  value,
  icon,
  accent = "text-txt-primary",
}: {
  label: string;
  value: string;
  icon: ReactNode;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-bg-line bg-bg-elev/40 px-4 py-3">
      <div className="flex items-center gap-2 text-[11px] text-txt-muted mb-1">
        {icon}
        {label}
      </div>
      <div className={cn("text-sm font-semibold break-words", accent)}>{value || "-"}</div>
    </div>
  );
}

function PolicyCard({ policy }: { policy: PolicyInfoRow }) {
  const vehicle = [policy.makeDescription, policy.model].filter(Boolean).join(" ");

  return (
    <div className="rounded-2xl border border-bg-line bg-bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-bg-line flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-txt-muted mb-1">{policy.policyRef}</div>
          <h2 className="text-lg font-semibold tracking-tight">{policy.clientName || "Unnamed client"}</h2>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-brand-green/10 px-3 py-1 text-xs font-medium text-brand-green">
          <ShieldCheck className="w-3.5 h-3.5" />
          Policy found
        </div>
      </div>

      <div className="p-5 grid grid-cols-5 gap-3">
        <InfoTile label="Postcode" value={policy.postcode} icon={<MapPin className="w-3.5 h-3.5" />} />
        <InfoTile label="Industry" value={policy.occupationIndustry} icon={<BriefcaseBusiness className="w-3.5 h-3.5" />} />
        <InfoTile label="Occupation" value={policy.occupation} icon={<BriefcaseBusiness className="w-3.5 h-3.5" />} />
        <InfoTile label="Vehicle" value={vehicle} icon={<Car className="w-3.5 h-3.5" />} accent="text-brand-blue" />
        <InfoTile label="Type" value={policy.vehicleType} icon={<Car className="w-3.5 h-3.5" />} />
        <InfoTile label="Scheme" value={policy.insuranceScheme} icon={<ShieldCheck className="w-3.5 h-3.5" />} />
        <InfoTile label="Value" value={policy.vehicleValue ? formatCurrency(policy.vehicleValue) : "-"} icon={<Gauge className="w-3.5 h-3.5" />} />
        <InfoTile label="Class of use" value={policy.classOfUse} icon={<FileSearch className="w-3.5 h-3.5" />} />
        <InfoTile label="Licence" value={policy.licenceDescription} icon={<ShieldCheck className="w-3.5 h-3.5" />} />
        <InfoTile label="Private mileage" value={policy.privateMileage ? policy.privateMileage.toLocaleString("en-GB") : "-"} icon={<Gauge className="w-3.5 h-3.5" />} />
      </div>
    </div>
  );
}
