const baseUrl = process.env.BASE_URL || "http://localhost:3000";

const checks = [
  { method: "GET", path: "/api/contacts", allowed: [401, 403] },
  { method: "GET", path: "/api/hr/summary", allowed: [401, 403] },
  { method: "GET", path: "/api/admin/users", allowed: [401, 403] },
  {
    method: "POST",
    path: "/api/sms/send",
    body: { to: "07123456789", message: "security smoke" },
    allowed: [401, 403, 429],
  },
  {
    method: "POST",
    path: "/api/register",
    headers: { Origin: "https://evil.example" },
    body: { email: "attacker@example.com", password: "not-a-real-password", name: "Attacker" },
    allowed: [403, 429],
  },
];

let failures = 0;

for (const check of checks) {
  const res = await fetch(`${baseUrl}${check.path}`, {
    method: check.method,
    headers: {
      "Content-Type": "application/json",
      ...(check.headers ?? {}),
    },
    body: check.body ? JSON.stringify(check.body) : undefined,
  });

  if (!check.allowed.includes(res.status)) {
    failures++;
    console.error(`FAIL ${check.method} ${check.path}: expected ${check.allowed.join("/")} got ${res.status}`);
  } else {
    console.log(`PASS ${check.method} ${check.path}: ${res.status}`);
  }
}

if (failures > 0) process.exit(1);
