import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { setAuthCookie } from "@/lib/auth";

const INTERMEDIATE_EMAIL = "intermediate.user@oiyen.local";
const INTERMEDIATE_NAME = "Intermediate User";

export async function POST() {
  try {
    const user = await prisma.user.upsert({
      where: { email: INTERMEDIATE_EMAIL },
      update: { name: INTERMEDIATE_NAME },
      create: {
        name: INTERMEDIATE_NAME,
        email: INTERMEDIATE_EMAIL,
        role: "INVESTOR",
      },
    });

    await setAuthCookie({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      quickEntry: "INTERMEDIATE",
      hasWatchlistBuiltUp: true,
    });
  } catch (error) {
    console.error("Quick intermediate login error:", error);
    return NextResponse.json(
      { error: "Unable to enter as Intermediate User" },
      { status: 500 }
    );
  }
}