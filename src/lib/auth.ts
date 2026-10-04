import { cookies } from "next/headers";
import crypto from "crypto";
import { prisma } from "./prisma";

export const SESSION_COOKIE = "trade_alert_session";
export const READ_TOKEN_KEY = "homepage_read_token";
export const READ_TOKEN_HEADER = "x-api-key";

// Routes reachable without a session. Everything else under /api requires one.
const PUBLIC_API_ROUTES: RegExp[] = [
    /^\/api\/webhook\/[^/]+\/?$/,
    /^\/api\/health\/?$/,
    /^\/api\/auth\/login\/?$/,
    /^\/api\/auth\/logout\/?$/,
];

// Routes that also accept the read-only token (header X-API-Key), per method.
const READ_TOKEN_ROUTES: { method: string; path: RegExp }[] = [
    { method: "GET", path: /^\/api\/messages\/?$/ },
];

export function isPublicApiRoute(pathname: string): boolean {
    return PUBLIC_API_ROUTES.some((re) => re.test(pathname));
}

export function acceptsReadToken(method: string, pathname: string): boolean {
    return READ_TOKEN_ROUTES.some((r) => r.method === method && r.path.test(pathname));
}

export function safeEqual(a: string, b: string): boolean {
    const ha = crypto.createHash("sha256").update(a).digest();
    const hb = crypto.createHash("sha256").update(b).digest();
    return crypto.timingSafeEqual(ha, hb);
}

async function matchesSetting(key: string, provided: string | undefined | null): Promise<boolean> {
    if (!provided) return false;
    const saved = await prisma.appSetting.findUnique({ where: { key } });
    if (!saved?.value) return false;
    return safeEqual(saved.value, provided);
}

export function isValidSessionToken(token: string | undefined | null): Promise<boolean> {
    return matchesSetting("SESSION_TOKEN", token);
}

export function isValidReadToken(token: string | undefined | null): Promise<boolean> {
    return matchesSetting(READ_TOKEN_KEY, token);
}

export function generateToken(): string {
    return crypto.randomBytes(32).toString("hex");
}

export async function isAuthenticated(): Promise<boolean> {
    const cookieStore = await cookies();
    return isValidSessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}
