import { Topbar } from "@/components/topbar";
import { AiQueryChat } from "@/components/ai-query/chat";
import { auth } from "@/lib/auth";
import { findExecByEmail, DEV_USER } from "@/lib/users";

export default async function AiQueryPage() {
  const session = await auth();
  const exec = findExecByEmail(session?.user?.email) ?? DEV_USER;

  return (
    <div className="flex flex-col h-full">
      <Topbar
        title="AI Query"
        subtitle="Ask anything about your business"
        user={{ name: exec.name }}
      />
      <div className="flex-1 min-h-0">
        <AiQueryChat userName={exec.name} />
      </div>
    </div>
  );
}
