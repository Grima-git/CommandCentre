import { CheckCircle2, RefreshCw, Lock } from "lucide-react";

export function StatusBar() {
  return (
    <div className="px-8 py-4 border-t border-bg-line bg-bg-panel/50 flex items-center justify-between text-xs">
      <div className="flex items-center gap-2">
        <span className="text-txt-muted uppercase tracking-wider">System Status</span>
        <CheckCircle2 className="w-3.5 h-3.5 text-brand-green" />
        <span className="text-txt-secondary">All Systems Operational</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-txt-muted uppercase tracking-wider">Data Sync</span>
        <RefreshCw className="w-3.5 h-3.5 text-brand-blue" />
        <span className="text-txt-secondary">Last synced 2 min ago</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-txt-muted uppercase tracking-wider">Security</span>
        <Lock className="w-3.5 h-3.5 text-brand-green" />
        <span className="text-txt-secondary">Secure Connection</span>
      </div>
    </div>
  );
}
