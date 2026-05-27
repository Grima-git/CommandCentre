import { LoginPanel } from "@/components/auth/login-panel";

const hasMyFirstMicrosoft = Boolean(
  process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
    process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET &&
    process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
);

const hasArmaMicrosoft = Boolean(
  process.env.AUTH_ARMA_ENTRA_ID &&
    process.env.AUTH_ARMA_ENTRA_SECRET &&
    process.env.AUTH_ARMA_ENTRA_ISSUER,
);

export default function LoginPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string };
}) {
  const callbackUrl = searchParams.callbackUrl || "/dashboard/renewals";
  const microsoftProviders = [
    ...(hasMyFirstMicrosoft
      ? [{ id: "microsoft-entra-id", label: "Sign in with MyFirst Microsoft" }]
      : []),
    ...(hasArmaMicrosoft
      ? [{ id: "arma-microsoft-entra-id", label: "Sign in with ARMA Microsoft" }]
      : []),
  ];

  return <LoginPanel callbackUrl={callbackUrl} microsoftProviders={microsoftProviders} />;
}
