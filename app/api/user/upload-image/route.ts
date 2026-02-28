// app/api/user/upload-image/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import jwt from "jsonwebtoken";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { v2 as cloudinary } from "cloudinary";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this-in-production";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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

    // Convert file to buffer and then to base64
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Image = `data:${file.type};base64,${buffer.toString('base64')}`;

    // Upload to Cloudinary
    try {
      const uploadResult = await cloudinary.uploader.upload(base64Image, {
        folder: "avatars",
        public_id: `user-${userId}-${Date.now()}`,
        overwrite: true,
        transformation: [
          { width: 400, height: 400, crop: "fill", gravity: "face" },
          { quality: "auto" }
        ]
      });

      const imageUrl = uploadResult.secure_url;

      // Update user in database
      await prisma.user.update({
        where: { id: userId },
        data: { image: imageUrl },
      });

      return NextResponse.json({ 
        success: true,
        imageUrl 
      });

    } catch (cloudinaryError) {
      console.error("Cloudinary upload error:", cloudinaryError);
      return NextResponse.json(
        { error: "Failed to upload image to cloud storage" },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 }
    );
  }
}