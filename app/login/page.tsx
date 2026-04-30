import { LoginPanel } from "@/components/auth/login-panel";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string };
}) {
  const callbackUrl = searchParams.callbackUrl || "/dashboard/renewals";
  return <LoginPanel callbackUrl={callbackUrl} />;
}
