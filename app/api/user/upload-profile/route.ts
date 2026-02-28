// app/api/user/update-profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function PUT(request: NextRequest) {
  try {
    // Get current user
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Get request body
    const body = await request.json();
    const { name, email } = body;

    // Validate
    if (!name || !email) {
      return NextResponse.json(
        { error: "Name and email are required" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Check if email is already taken by another user
    if (email !== authUser.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser && existingUser.id !== authUser.userId) {
        return NextResponse.json(
          { error: "Email already in use" },
          { status: 409 }
        );
      }
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: authUser.userId },
      data: {
        name,
        email,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        image: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ 
      success: true,
      user: updatedUser 
    });

  } catch (error) {
    console.error("Update profile error:", error);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}