import { NextRequest, NextResponse } from "next/server";
import { searchLeads } from "@/lib/mongodb";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const { query, limit = 20 } = await request.json();

  if (!query || typeof query !== "string") {
    return NextResponse.json(
      { error: "Query is required", leads: [] },
      { status: 400 }
    );
  }

  try {
    const leads = await searchLeads(query, limit);
    return NextResponse.json({ leads });
  } catch (error) {
    console.error("Search failed:", error);
    return NextResponse.json(
      { error: "Search failed", leads: [] },
      { status: 500 }
    );
  }
}
