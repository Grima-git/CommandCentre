import { NextResponse } from "next/server";

export default function middleware(req: Request) {
  const nextUrl = new URL(req.url);
  if (nextUrl.pathname.startsWith("/_next") || nextUrl.pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  if (nextUrl.pathname.match(/\.(?:svg|png|jpg|jpeg|gif|webp)$/)) {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
