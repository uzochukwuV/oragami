import { NextRequest } from "next/server";
import { streamTinyFishResearch, createLeadResearchGoal, parseLeadFromResult } from "@/lib/tinyfish";
import { saveLead } from "@/lib/mongodb";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes max for research

export async function POST(request: NextRequest) {
  const { domain, goal } = await request.json();

  if (!domain) {
    return new Response(
      JSON.stringify({ error: "Domain is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const apiKey = process.env.TINYFISH_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "TinyFish API key not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        sendEvent({ type: "progress", message: `Starting research on ${domain}...` });

        const researchGoal = createLeadResearchGoal(domain, goal);
        
        let resultData: unknown = null;
        
        for await (const event of streamTinyFishResearch(
          { url: domain, goal: researchGoal },
          apiKey
        )) {
          switch (event.type) {
            case "STARTED":
              sendEvent({ type: "progress", message: "Agent initialized" });
              break;
              
            case "PROGRESS":
              sendEvent({ type: "progress", message: event.message || "Processing..." });
              break;
              
            case "STREAMING_URL":
              sendEvent({ type: "stream_url", url: event.url });
              break;
              
            case "COMPLETE":
              resultData = event.data;
              sendEvent({ type: "progress", message: "Processing results..." });
              break;
              
            case "ERROR":
              sendEvent({ type: "error", message: event.message || "Research failed" });
              controller.close();
              return;
          }
        }

        if (resultData) {
          const leadData = parseLeadFromResult(domain, resultData);
          
          // Save to MongoDB
          let savedLead = null;
          try {
            savedLead = await saveLead({
              domain,
              companyName: leadData?.companyName || domain,
              description: leadData?.description || "",
              industry: leadData?.industry || "Technology",
              contacts: leadData?.contacts || [],
              funding: leadData?.funding,
              technologies: leadData?.technologies || [],
              rawContent: leadData?.rawContent || "",
              sourceUrls: leadData?.sourceUrls || [`https://${domain}`],
            });
          } catch (dbError) {
            console.error("Failed to save to MongoDB:", dbError);
            // Continue without saving - still return the lead data
          }

          sendEvent({
            type: "complete",
            lead: savedLead || {
              id: crypto.randomUUID(),
              domain,
              companyName: leadData?.companyName || domain,
              description: leadData?.description || "",
              industry: leadData?.industry || "Technology",
              contacts: leadData?.contacts || [],
              funding: leadData?.funding,
              technologies: leadData?.technologies || [],
              researchedAt: new Date().toISOString(),
              sourceUrls: leadData?.sourceUrls || [`https://${domain}`],
            },
          });
        } else {
          sendEvent({ type: "error", message: "No data extracted from website" });
        }

        controller.close();
      } catch (error) {
        sendEvent({
          type: "error",
          message: error instanceof Error ? error.message : "Research failed",
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
