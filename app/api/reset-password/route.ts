import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  try {
    const { token, newPassword } = await req.json();

    if (!token || !newPassword) {
      return NextResponse.json({ message: "Missing fields" }, { status: 400 });
    }

    // 1) 找 token
    const record = await prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!record) {
      return NextResponse.json({ message: "Invalid token" }, { status: 400 });
    }

    if (record.expiresAt < new Date()) {
      return NextResponse.json({ message: "Token expired" }, { status: 400 });
    }

    // 2) 更新密码
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: record.userId },
      data: { password: hashedPassword },
    });

    // 3) 删除 token（避免重复使用）
    await prisma.passwordResetToken.delete({
      where: { id: record.id },
    });

    return NextResponse.json({ message: "Password reset successful" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
