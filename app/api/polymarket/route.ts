import { NextRequest, NextResponse } from "next/server";
import { recordPull } from "@/lib/pullMetrics";

// Proxy to Polymarket gamma API to avoid CORS issues
export async function GET(req: NextRequest) {
  recordPull("poly_probe");
  const { searchParams } = new URL(req.url);

  const id = searchParams.get("id");
  const limit = searchParams.get("limit") || "10";
  const offset = searchParams.get("offset") || "0";
  const tag = searchParams.get("tag") || "";

  // If an event id is provided, fetch that specific event
  let upstream: URL;
  if (id) {
    upstream = new URL(`https://gamma-api.polymarket.com/events/${encodeURIComponent(id)}`);
  } else {
    // Build upstream URL with allowed params only
    upstream = new URL("https://gamma-api.polymarket.com/events");
    upstream.searchParams.set("limit", limit);
    upstream.searchParams.set("offset", offset);
    upstream.searchParams.set("active", "true");
    upstream.searchParams.set("closed", "false");
    if (tag) {
      upstream.searchParams.set("tag", tag);
    }
  }

  try {
    const res = await fetch(upstream.toString(), {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 }, // cache for 60s
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Upstream API error" },
        { status: res.status }
      );
    }

    const data = await res.json();
    // When fetching by id, wrap in array under 'events' key for consistency
    if (id) {
      return NextResponse.json({ events: [data] });
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("Polymarket proxy error:", error);
    return NextResponse.json(
      { error: "Failed to fetch from Polymarket" },
      { status: 500 }
    );
  }
}
