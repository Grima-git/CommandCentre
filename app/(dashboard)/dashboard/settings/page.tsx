import { Topbar } from "@/components/topbar";
import { Card } from "@/components/ui/card";
import { auth, signOut } from "@/lib/auth";
import { findExecByEmail, DEV_USER, EXEC_USERS } from "@/lib/users";

export default async function SettingsPage() {
  const session = await auth();
  const user = findExecByEmail(session?.user?.email) ?? DEV_USER;

  return (
    <>
      <Topbar title="Settings" subtitle="Account and access" user={{ name: user.name }} />
      <div className="p-8 grid grid-cols-2 gap-4 max-w-5xl">
        <Card className="p-6">
          <h2 className="text-base font-semibold mb-4">Signed-in user</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-txt-muted">Name</dt>
              <dd>{session?.user?.name ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-txt-muted">Email</dt>
              <dd className="text-xs">{session?.user?.email ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-txt-muted">Role</dt>
              <dd>{session?.user?.role ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-txt-muted">Title</dt>
              <dd>{session?.user?.title ?? "—"}</dd>
            </div>
          </dl>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
            className="mt-6"
          >
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-bg-elev border border-bg-line text-sm hover:bg-bg-line"
            >
              Sign out
            </button>
          </form>
        </Card>

        <Card className="p-6">
          <h2 className="text-base font-semibold mb-4">Configured C-suite users</h2>
          <p className="text-xs text-txt-muted mb-4">
            These email addresses are mapped to C-suite roles. Update <code className="text-brand-purple">lib/users.ts</code> when
            you have the real Entra ID UPNs.
          </p>
          <div className="space-y-2">
            {EXEC_USERS.map((u) => (
              <div
                key={u.email}
                className="flex items-center justify-between p-2.5 rounded-lg bg-bg-elev/40 border border-bg-line"
              >
                <div>
                  <div className="text-sm font-medium">{u.name}</div>
                  <div className="text-xs text-txt-muted">{u.title}</div>
                </div>
                <div className="text-xs text-txt-muted">{u.email}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
