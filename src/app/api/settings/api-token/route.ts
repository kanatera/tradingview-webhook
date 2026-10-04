import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { READ_TOKEN_KEY, generateToken } from "@/lib/auth";

// Read-only token for external dashboards (e.g. Homepage). Accepted only on
// GET /api/messages via the X-API-Key header; see src/middleware.ts.

export async function GET() {
    const setting = await prisma.appSetting.findUnique({ where: { key: READ_TOKEN_KEY } });
    return NextResponse.json({ token: setting?.value || "" });
}

// Generate (or rotate) the token. The previous token stops working immediately.
export async function POST() {
    const token = generateToken();
    await prisma.appSetting.upsert({
        where: { key: READ_TOKEN_KEY },
        update: { value: token },
        create: { key: READ_TOKEN_KEY, value: token },
    });
    return NextResponse.json({ token });
}

// Revoke the token entirely.
export async function DELETE() {
    await prisma.appSetting.deleteMany({ where: { key: READ_TOKEN_KEY } });
    return NextResponse.json({ success: true });
}
