import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, isValidSessionToken } from "@/lib/auth";

export async function POST() {
    try {
        const cookieStore = await cookies();

        // Only invalidate the server-side session if the caller actually holds it;
        // this route is public, so anyone else must not be able to log the user out.
        if (await isValidSessionToken(cookieStore.get(SESSION_COOKIE)?.value)) {
            await prisma.appSetting.deleteMany({
                where: { key: "SESSION_TOKEN" }
            });
        }

        cookieStore.delete(SESSION_COOKIE);

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
