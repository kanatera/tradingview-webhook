import { NextRequest, NextResponse } from "next/server";
import {
    SESSION_COOKIE,
    READ_TOKEN_HEADER,
    isPublicApiRoute,
    acceptsReadToken,
    isValidSessionToken,
    isValidReadToken,
} from "@/lib/auth";

// Default-deny for every /api route: a valid session cookie is required unless the
// route is on the public allowlist (webhook, health, login/logout) or accepts the
// read-only Homepage token. Runs on the Node.js runtime so it can query Prisma.
export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (isPublicApiRoute(pathname)) {
        return NextResponse.next();
    }

    if (await isValidSessionToken(request.cookies.get(SESSION_COOKIE)?.value)) {
        return NextResponse.next();
    }

    if (
        acceptsReadToken(request.method, pathname) &&
        (await isValidReadToken(request.headers.get(READ_TOKEN_HEADER)))
    ) {
        return NextResponse.next();
    }

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export const config = {
    matcher: "/api/:path*",
    runtime: "nodejs",
};
