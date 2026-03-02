// app/api/user/delete-account/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function DELETE(request: NextRequest) {
  try {
    // Get current user
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Delete all user-related data
    // Note: The order matters due to foreign key constraints

    // Delete user's posts
    await prisma.post.deleteMany({
      where: { authorId: authUser.userId },
    });

    // Delete user's accounts (OAuth)
    await prisma.account.deleteMany({
      where: { userId: authUser.userId },
    });

    // Delete user's sessions
    await prisma.session.deleteMany({
      where: { userId: authUser.userId },
    });

    // Delete password reset tokens
    await prisma.passwordResetToken.deleteMany({
      where: { userId: authUser.userId },
    });

    // Finally, delete the user
    await prisma.user.delete({
      where: { id: authUser.userId },
    });

    return NextResponse.json({ 
      success: true,
      message: "Account deleted successfully" 
    });

  } catch (error) {
    console.error("Delete account error:", error);
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 }
    );
  }
}
