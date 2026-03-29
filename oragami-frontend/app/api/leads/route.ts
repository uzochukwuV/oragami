import { NextRequest, NextResponse } from "next/server";
import { getLeads } from "@/lib/mongodb";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "100");

  try {
    const leads = await getLeads(limit);
    return NextResponse.json({ leads });
  } catch (error) {
    console.error("Failed to fetch leads:", error);
    return NextResponse.json(
      { error: "Failed to fetch leads", leads: [] },
      { status: 500 }
    );
  }
}
