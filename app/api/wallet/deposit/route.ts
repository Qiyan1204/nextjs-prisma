import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const amount = Number(body?.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Invalid deposit amount" }, { status: 400 });
    }

    if (amount < 100) {
      return NextResponse.json({ error: "Minimum top-up amount is $100" }, { status: 400 });
    }

    if (amount > 1_000_000) {
      return NextResponse.json({ error: "Maximum top-up amount is $1,000,000 per transaction" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const currentUser = await tx.user.findUnique({
        where: { id: authUser.userId },
        select: { walletBalance: true },
      });

      if (!currentUser) {
        throw new Error("User not found");
      }

      const currentBalance = Number(currentUser.walletBalance);
      const newBalance = currentBalance + amount;

      const user = await tx.user.update({
        where: { id: authUser.userId },
        data: {
          walletBalance: {
            increment: amount,
          },
        },
        select: {
          id: true,
          walletBalance: true,
        },
      });

      await tx.polyTransaction.create({
        data: {
          userId: authUser.userId,
          type: "DEPOSIT",
          amount,
          balanceAfter: newBalance,
        },
      });

      return user;
    });

    return NextResponse.json({
      success: true,
      walletBalance: Number(result.walletBalance),
    });
  } catch (error) {
    console.error("Deposit error:", error);
    return NextResponse.json({ error: "Failed to deposit funds" }, { status: 500 });
  }
}
