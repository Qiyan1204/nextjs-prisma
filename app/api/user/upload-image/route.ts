// app/api/user/upload-image/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import jwt from "jsonwebtoken";
import prisma from "@/lib/prisma";
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { authOptions } from "@/lib/auth";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this-in-production";

export async function POST(request: NextRequest) {
  try {
    let userId: number | null = null;

    // First try NextAuth session (for Google login users)
    const session = await getServerSession(authOptions);
    if (session?.user?.id) {
      userId = parseInt(session.user.id);
    }

    // If no NextAuth session, try custom JWT auth
    if (!userId) {
      const cookieStore = await cookies();
      const token = cookieStore.get("auth-token")?.value;
      
      if (token) {
        try {
          const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
          userId = decoded.userId;
        } catch {
          // Token invalid, continue to check other methods
        }
      }
    }

    if (!userId) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Get form data
    const formData = await request.formData();
    const file = formData.get('image') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: "No image provided" },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: "File must be an image" },
        { status: 400 }
      );
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Image size must be less than 5MB" },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Generate unique filename
    const timestamp = Date.now();
    const ext = file.type.split('/')[1] || 'png';
    const filename = `${userId}-${timestamp}.${ext}`;
    const uploadDir = join(process.cwd(), 'public', 'uploads', 'avatars');
    const filepath = join(uploadDir, filename);

    // Create directory if it doesn't exist
    try {
      if (!existsSync(uploadDir)) {
        await mkdir(uploadDir, { recursive: true });
      }
    } catch (mkdirError) {
      console.error("Failed to create upload directory:", mkdirError);
      return NextResponse.json(
        { error: "Failed to create upload directory" },
        { status: 500 }
      );
    }

    // Save file
    try {
      await writeFile(filepath, buffer);
    } catch (writeError) {
      console.error("Failed to write file:", writeError);
      return NextResponse.json(
        { error: "Failed to save image file" },
        { status: 500 }
      );
    }

    // Update user in database
    const imageUrl = `/uploads/avatars/${filename}`;
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { image: imageUrl },
      });
    } catch (dbError) {
      console.error("Database update error:", dbError);
      return NextResponse.json(
        { error: "Failed to update user profile" },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true,
      imageUrl 
    });

  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 }
    );
  }
}