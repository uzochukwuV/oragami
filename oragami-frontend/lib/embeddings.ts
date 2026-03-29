/**
 * Embeddings Generation
 * 
 * Generates vector embeddings for semantic search using OpenRouter's free model.
 * Uses a simple hash-based approach for embedding generation compatible with vector search.
 */

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Generate a simple hash-based embedding vector for text
 * This creates a deterministic 256-dimensional vector based on text content.
 * For production, you'd want to use a proper embedding model, but this works
 * for basic semantic similarity with MongoDB's vector search.
 */
export function generateSimpleEmbedding(text: string): number[] {
  const dimensions = 256;
  const embedding = new Array(dimensions).fill(0);
  
  // Normalize text
  const normalized = text.toLowerCase().trim();
  const words = normalized.split(/\s+/);
  
  // Hash each word and accumulate into embedding dimensions
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    for (let j = 0; j < word.length; j++) {
      const charCode = word.charCodeAt(j);
      const dimIndex = (charCode * (i + 1) * (j + 1)) % dimensions;
      embedding[dimIndex] += 1 / (1 + Math.log(1 + i));
    }
  }
  
  // Normalize the vector
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < dimensions; i++) {
      embedding[i] /= magnitude;
    }
  }
  
  return embedding;
}

/**
 * Generate embedding vector for text
 * Uses simple hash-based embedding for now (no external API needed)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // Use simple embedding - no API key required
  return generateSimpleEmbedding(text);
}

/**
 * Generate embeddings for multiple texts in batch
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  return texts.map(text => generateSimpleEmbedding(text));
}

/**
 * Use OpenRouter free model for text analysis/summarization
 */
export async function analyzeWithOpenRouter(text: string, prompt: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }
  
  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://leadvault.app",
      "X-Title": "LeadVault"
    },
    body: JSON.stringify({
      model: "openrouter/auto",
      messages: [
        { role: "system", content: "You are a helpful assistant that analyzes business information." },
        { role: "user", content: `${prompt}\n\nText to analyze:\n${text}` }
      ],
      max_tokens: 1000
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
  }
  
  const data = await response.json();
  return data.choices[0]?.message?.content || "";
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same length");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
