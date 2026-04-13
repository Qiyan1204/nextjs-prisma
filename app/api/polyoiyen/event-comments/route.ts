import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

function normalizeContent(content: unknown): string {
  return typeof content === "string" ? content.trim() : "";
}

const COMMENT_SELECT_BASE = {
  id: true,
  eventId: true,
  content: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      name: true,
      image: true,
    },
  },
} as const;

const COMMENT_SELECT_EXTENDED = {
  ...COMMENT_SELECT_BASE,
  parentCommentId: true,
  updatedAt: true,
} as const;

function isUnknownFieldError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : "";
  return msg.includes("Unknown field") || msg.includes("Unknown argument");
}

function withCompatDefaults<T extends { createdAt: Date }>(comment: T) {
  return {
    ...comment,
    parentCommentId: (comment as T & { parentCommentId?: number | null }).parentCommentId ?? null,
    updatedAt: (comment as T & { updatedAt?: Date }).updatedAt ?? comment.createdAt,
  };
}

export async function GET(req: NextRequest) {
  try {
    const eventId = req.nextUrl.searchParams.get("eventId")?.trim() || "";
    if (!eventId) {
      return NextResponse.json({ error: "eventId is required" }, { status: 400 });
    }

    let comments: Array<ReturnType<typeof withCompatDefaults>> = [] as Array<ReturnType<typeof withCompatDefaults>>;
    try {
      const rows = await prisma.polyEventComment.findMany({
        where: { eventId },
        orderBy: { createdAt: "asc" },
        take: 100,
        select: COMMENT_SELECT_EXTENDED,
      });
      comments = rows.map(withCompatDefaults);
    } catch (error) {
      if (!isUnknownFieldError(error)) throw error;
      const rows = await prisma.polyEventComment.findMany({
        where: { eventId },
        orderBy: { createdAt: "asc" },
        take: 100,
        select: COMMENT_SELECT_BASE,
      });
      comments = rows.map(withCompatDefaults);
    }

    return NextResponse.json({ comments });
  } catch (error) {
    console.error("Event comments GET error:", error);
    return NextResponse.json({ error: "Failed to load comments" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const userExists = await prisma.user.findUnique({
      where: { id: authUser.userId },
      select: { id: true },
    });
    if (!userExists) {
      return NextResponse.json({ error: "Session expired. Please login again." }, { status: 401 });
    }

    const body = await req.json();
    const eventId = typeof body?.eventId === "string" ? body.eventId.trim() : "";
    const content = normalizeContent(body?.content);
    const parentCommentId = Number.isInteger(body?.parentCommentId) ? Number(body.parentCommentId) : null;

    if (!eventId) {
      return NextResponse.json({ error: "eventId is required" }, { status: 400 });
    }
    if (!content) {
      return NextResponse.json({ error: "Comment cannot be empty" }, { status: 400 });
    }
    if (content.length > 500) {
      return NextResponse.json({ error: "Comment is too long (max 500 chars)" }, { status: 400 });
    }

    if (parentCommentId != null) {
      const parent = await prisma.polyEventComment.findUnique({
        where: { id: parentCommentId },
        select: { id: true, eventId: true },
      });
      if (!parent || parent.eventId !== eventId) {
        return NextResponse.json({ error: "Invalid parent comment" }, { status: 400 });
      }
    }

    const createData: { userId: number; eventId: string; content: string; parentCommentId?: number } = {
      userId: authUser.userId,
      eventId,
      content,
    };
    if (parentCommentId != null) {
      createData.parentCommentId = parentCommentId;
    }

    let created: ReturnType<typeof withCompatDefaults>;
    try {
      const row = await prisma.polyEventComment.create({
        data: createData,
        select: COMMENT_SELECT_EXTENDED,
      });
      created = withCompatDefaults(row);
    } catch (error) {
      if (!isUnknownFieldError(error)) throw error;
      try {
        const row = await prisma.polyEventComment.create({
          data: createData,
          select: COMMENT_SELECT_BASE,
        });
        created = withCompatDefaults(row);
      } catch (retryError) {
        if (!isUnknownFieldError(retryError)) throw retryError;
        if (parentCommentId != null) {
          return NextResponse.json({ error: "Reply is temporarily unavailable. Please refresh/restart dev server." }, { status: 503 });
        }
        const row = await prisma.polyEventComment.create({
          data: {
            userId: authUser.userId,
            eventId,
            content,
          },
          select: COMMENT_SELECT_BASE,
        });
        created = withCompatDefaults(row);
      }
    }

    return NextResponse.json({ comment: created }, { status: 201 });
  } catch (error) {
    console.error("Event comments POST error:", error);
    const message = error instanceof Error ? error.message : "";
    if (message.toLowerCase().includes("foreign key constraint")) {
      return NextResponse.json({ error: "Session expired. Please login again." }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to post comment", detail: message || "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const commentId = Number(body?.commentId);
    const content = normalizeContent(body?.content);

    if (!Number.isInteger(commentId) || commentId <= 0) {
      return NextResponse.json({ error: "commentId is required" }, { status: 400 });
    }
    if (!content) {
      return NextResponse.json({ error: "Comment cannot be empty" }, { status: 400 });
    }
    if (content.length > 500) {
      return NextResponse.json({ error: "Comment is too long (max 500 chars)" }, { status: 400 });
    }

    const existing = await prisma.polyEventComment.findUnique({
      where: { id: commentId },
      select: { id: true, userId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }
    if (existing.userId !== authUser.userId) {
      return NextResponse.json({ error: "You can only edit your own comments" }, { status: 403 });
    }

    let updated: ReturnType<typeof withCompatDefaults>;
    try {
      const row = await prisma.polyEventComment.update({
        where: { id: commentId },
        data: { content },
        select: COMMENT_SELECT_EXTENDED,
      });
      updated = withCompatDefaults(row);
    } catch (error) {
      if (!isUnknownFieldError(error)) throw error;
      const row = await prisma.polyEventComment.update({
        where: { id: commentId },
        data: { content },
        select: COMMENT_SELECT_BASE,
      });
      updated = withCompatDefaults(row);
    }

    return NextResponse.json({ comment: updated });
  } catch (error) {
    console.error("Event comments PATCH error:", error);
    return NextResponse.json({ error: "Failed to edit comment" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const commentId = Number(body?.commentId);
    if (!Number.isInteger(commentId) || commentId <= 0) {
      return NextResponse.json({ error: "commentId is required" }, { status: 400 });
    }

    const existing = await prisma.polyEventComment.findUnique({
      where: { id: commentId },
      select: { id: true, userId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }
    if (existing.userId !== authUser.userId) {
      return NextResponse.json({ error: "You can only delete your own comments" }, { status: 403 });
    }

    try {
      await prisma.$transaction([
        prisma.polyEventComment.updateMany({
          where: { parentCommentId: commentId },
          data: { parentCommentId: null },
        }),
        prisma.polyEventComment.delete({ where: { id: commentId } }),
      ]);
    } catch (error) {
      if (!isUnknownFieldError(error)) throw error;
      await prisma.polyEventComment.delete({ where: { id: commentId } });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Event comments DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete comment" }, { status: 500 });
  }
}
