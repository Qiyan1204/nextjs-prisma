import { NextRequest, NextResponse } from "next/server";

// Proxy to Polymarket CLOB API for order book data
// Docs: https://docs.polymarket.com/#get-order-book
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tokenId = searchParams.get("token_id");

  if (!tokenId) {
    return NextResponse.json({ error: "token_id is required" }, { status: 400 });
  }

  try {
    const upstream = new URL("https://clob.polymarket.com/book");
    upstream.searchParams.set("token_id", tokenId);

    const res = await fetch(upstream.toString(), {
      headers: { Accept: "application/json" },
      next: { revalidate: 15 }, // cache for 15s — order book updates frequently
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Upstream CLOB API error" },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Order book proxy error:", error);
    return NextResponse.json(
      { error: "Failed to fetch order book" },
      { status: 500 }
    );
  }
}
