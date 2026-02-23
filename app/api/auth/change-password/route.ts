// app/api/auth/change-password/route.ts
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
        { error: "You must be logged in to change password" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { currentPassword, newPassword, confirmPassword } = body;

    // 验证必填字段
    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json(
        { error: "Current password, new password and confirm password are required" },
        { status: 400 }
      );
    }

    // 验证新密码匹配
    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { error: "New passwords do not match" },
        { status: 400 }
      );
    }

    // 验证密码长度
    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters" },
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

    // 检查用户是否有密码
    if (!user.password) {
      return NextResponse.json(
        { error: "You don't have a password set. Use set password instead." },
        { status: 400 }
      );
    }

    // 验证当前密码
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 401 }
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
      message: "Password changed successfully!",
    });

  } catch (error) {
    console.error("Change password error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
