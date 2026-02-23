// app/api/auth/set-password/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { getAuthUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    // 获取当前登录用户
    const authUser = await getAuthUser();
    
    if (!authUser) {
      return NextResponse.json(
        { error: "You must be logged in to set a password" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { newPassword, confirmPassword } = body;

    // 验证必填字段
    if (!newPassword || !confirmPassword) {
      return NextResponse.json(
        { error: "New password and confirm password are required" },
        { status: 400 }
      );
    }

    // 验证密码匹配
    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { error: "Passwords do not match" },
        { status: 400 }
      );
    }

    // 验证密码长度
    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // 查找用户
    const user = await prisma.user.findUnique({
      where: { id: authUser.userId },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // 检查用户是否已经有密码
    if (user.password) {
      return NextResponse.json(
        { error: "You already have a password. Use change password instead." },
        { status: 400 }
      );
    }

    // 加密新密码
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 更新用户密码
    await prisma.user.update({
      where: { id: authUser.userId },
      data: { password: hashedPassword },
    });

    return NextResponse.json({
      message: "Password set successfully! You can now login with email and password.",
    });

  } catch (error) {
    console.error("Set password error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
