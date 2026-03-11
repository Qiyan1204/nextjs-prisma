import { NextRequest, NextResponse } from "next/server";

const GNEWS_API_KEY = "fa7ea8f27870b6fa788cb28a9d818241";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") || "general";
  const max = searchParams.get("max") || "10";

  const upstream = new URL("https://gnews.io/api/v4/top-headlines");
  upstream.searchParams.set("category", category);
  upstream.searchParams.set("max", max);
  upstream.searchParams.set("lang", "en");
  upstream.searchParams.set("apikey", GNEWS_API_KEY);

  try {
    const res = await fetch(upstream.toString(), {
      next: { revalidate: 300 }, // cache 5 min
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "GNews API error" },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("News proxy error:", error);
    return NextResponse.json(
      { error: "Failed to fetch news" },
      { status: 500 }
    );
  }
}
