/**
 * TinyFish Web Agent API Client
 * 
 * Handles communication with the TinyFish API for web automation.
 * Uses SSE streaming for real-time progress updates.
 */

const TINYFISH_API_URL = "https://agent.tinyfish.ai/v1/automation/run-sse";

export interface TinyFishEvent {
  type: "STARTED" | "PROGRESS" | "STREAMING_URL" | "COMPLETE" | "ERROR";
  message?: string;
  url?: string;
  data?: unknown;
}

export interface TinyFishRequest {
  url: string;
  goal: string;
  maxSteps?: number;
}

export interface TinyFishResult {
  success: boolean;
  data?: {
    companyName?: string;
    description?: string;
    industry?: string;
    contacts?: Array<{
      name: string;
      title: string;
      email?: string;
      linkedin?: string;
    }>;
    funding?: string;
    technologies?: string[];
    sourceUrls?: string[];
    rawContent?: string;
  };
  error?: string;
}

/**
 * Creates a goal prompt for lead research
 */
export function createLeadResearchGoal(domain: string, customGoal?: string): string {
  const baseGoal = customGoal || `Visit ${domain} and extract the following information:
1. Company name and description
2. Industry/sector
3. Key decision-makers (look for About, Team, or Leadership pages) - get names, titles, and LinkedIn URLs if visible
4. Recent news, funding announcements, or press releases
5. Contact information (emails, contact forms, phone numbers)
6. Technologies or tools mentioned on the site

Return all information as structured JSON.`;

  return baseGoal;
}

/**
 * Calls the TinyFish API and yields SSE events
 */
export async function* streamTinyFishResearch(
  request: TinyFishRequest,
  apiKey: string
): AsyncGenerator<TinyFishEvent> {
  const url = request.url.startsWith("http") ? request.url : `https://${request.url}`;
  
  const response = await fetch(TINYFISH_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      url,
      goal: request.goal,
      max_steps: request.maxSteps || 20,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    yield {
      type: "ERROR",
      message: `API Error: ${response.status} - ${error}`,
    };
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    yield { type: "ERROR", message: "No response body" };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data:")) {
          const dataStr = line.slice(5).trim();
          
          if (dataStr === "[DONE]") {
            continue;
          }
          
          try {
            const data = JSON.parse(dataStr);
            
            // Normalize event type to uppercase for consistent matching
            const eventType = (data.type || data.event || "").toUpperCase();
            
            switch (eventType) {
              case "STARTED":
                yield { type: "STARTED", message: "Agent started" };
                break;
                
              case "PROGRESS":
                // TinyFish uses 'purpose' field for progress messages
                const progressMsg = data.purpose || data.message || data.step || "Processing...";
                yield { 
                  type: "PROGRESS", 
                  message: progressMsg
                };
                break;
                
              case "HEARTBEAT":
                // Don't yield heartbeats to client, just keep connection alive
                break;
                
              case "STREAMING_URL":
                yield { 
                  type: "STREAMING_URL", 
                  url: data.streaming_url || data.url 
                };
                break;
                
              case "COMPLETE":
                // TinyFish sends result in the 'result' field
                yield { 
                  type: "COMPLETE", 
                  data: data.result || data.data || data 
                };
                break;
                
              case "ERROR":
                yield { 
                  type: "ERROR", 
                  message: data.message || data.error || "Unknown error" 
                };
                break;
                
              default:
                if (data.message) {
                  yield { type: "PROGRESS", message: data.message };
                }
            }
          } catch {
            // Not JSON, skip
          }
        }
      }
    }
  } catch (streamErr) {
    yield { 
      type: "ERROR", 
      message: `Stream error: ${streamErr instanceof Error ? streamErr.message : String(streamErr)}` 
    };
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parses the raw TinyFish result into a structured lead format
 */
export function parseLeadFromResult(domain: string, result: unknown): TinyFishResult["data"] {
  const data = result as Record<string, unknown>;
  
  // Handle various response formats from TinyFish
  const extracted = data.extracted || data.result || data.data || data;
  
  return {
    companyName: (extracted as Record<string, unknown>).companyName as string || 
                 (extracted as Record<string, unknown>).company_name as string || 
                 (extracted as Record<string, unknown>).name as string || 
                 domain.replace(/\.(com|io|co|ai|app)$/, ""),
    description: (extracted as Record<string, unknown>).description as string || 
                 (extracted as Record<string, unknown>).about as string || "",
    industry: (extracted as Record<string, unknown>).industry as string || 
              (extracted as Record<string, unknown>).sector as string || "Technology",
    contacts: parseContacts((extracted as Record<string, unknown>).contacts || 
                            (extracted as Record<string, unknown>).team || 
                            (extracted as Record<string, unknown>).people || []),
    funding: (extracted as Record<string, unknown>).funding as string || 
             (extracted as Record<string, unknown>).funding_news as string || undefined,
    technologies: parseTechnologies((extracted as Record<string, unknown>).technologies || 
                                    (extracted as Record<string, unknown>).tech_stack || []),
    sourceUrls: parseSourceUrls((extracted as Record<string, unknown>).source_urls || 
                                (extracted as Record<string, unknown>).urls || []),
    rawContent: typeof (extracted as Record<string, unknown>).raw === "string" 
                ? (extracted as Record<string, unknown>).raw as string 
                : JSON.stringify(extracted),
  };
}

function parseContacts(contacts: unknown): Array<{ name: string; title: string; email?: string; linkedin?: string }> {
  if (!Array.isArray(contacts)) return [];
  
  return contacts.map((c: unknown) => {
    const contact = c as Record<string, unknown>;
    return {
      name: (contact.name as string) || "Unknown",
      title: (contact.title as string) || (contact.role as string) || (contact.position as string) || "",
      email: contact.email as string | undefined,
      linkedin: (contact.linkedin as string) || (contact.linkedin_url as string) || undefined,
    };
  }).filter((c) => c.name !== "Unknown");
}

function parseTechnologies(tech: unknown): string[] {
  if (Array.isArray(tech)) {
    return tech.map((t) => String(t));
  }
  if (typeof tech === "string") {
    return tech.split(",").map((t) => t.trim());
  }
  return [];
}

function parseSourceUrls(urls: unknown): string[] {
  if (Array.isArray(urls)) {
    return urls.map((u) => String(u));
  }
  return [];
}
