/**
 * MongoDB Atlas Integration with Vector Search
 * 
 * Handles lead storage and semantic search using MongoDB Atlas Vector Search.
 */

import { MongoClient, Db, Collection, ObjectId } from "mongodb";
import { generateEmbedding } from "./embeddings";

const MONGODB_URI = process.env.MONGODB_URI || "";
const DB_NAME = "leadvault";
const COLLECTION_NAME = "leads";

let client: MongoClient | null = null;
let db: Db | null = null;

export interface LeadDocument {
  _id?: ObjectId;
  domain: string;
  companyName: string;
  description: string;
  industry: string;
  contacts: {
    name: string;
    title: string;
    email?: string;
    linkedin?: string;
  }[];
  funding?: string;
  technologies: string[];
  rawContent: string;
  embedding?: number[];
  researchedAt: Date;
  sourceUrls: string[];
}

export interface LeadResponse {
  id: string;
  domain: string;
  companyName: string;
  description: string;
  industry: string;
  contacts: {
    name: string;
    title: string;
    email?: string;
    linkedin?: string;
  }[];
  funding?: string;
  technologies: string[];
  researchedAt: string;
  sourceUrls: string[];
  similarity?: number;
}

/**
 * Connect to MongoDB Atlas
 */
async function getDb(): Promise<Db> {
  if (db) return db;

  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI environment variable is not set");
  }

  client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db(DB_NAME);

  return db;
}

/**
 * Get the leads collection
 */
async function getLeadsCollection(): Promise<Collection<LeadDocument>> {
  const database = await getDb();
  return database.collection<LeadDocument>(COLLECTION_NAME);
}

/**
 * Save a new lead to MongoDB with embedding for vector search
 */
export async function saveLead(lead: Omit<LeadDocument, "_id" | "researchedAt" | "embedding">): Promise<LeadResponse> {
  const collection = await getLeadsCollection();

  // Generate embedding for semantic search
  const textForEmbedding = [
    lead.companyName,
    lead.description,
    lead.industry,
    lead.funding || "",
    lead.technologies.join(", "),
    lead.contacts.map((c) => `${c.name} ${c.title}`).join(", "),
  ].join(" ");

  let embedding: number[] | undefined;
  try {
    embedding = await generateEmbedding(textForEmbedding);
  } catch (error) {
    console.error("Failed to generate embedding:", error);
    // Continue without embedding - search will still work via text
  }

  const document: LeadDocument = {
    ...lead,
    embedding,
    researchedAt: new Date(),
  };

  const result = await collection.insertOne(document);

  return {
    id: result.insertedId.toString(),
    domain: lead.domain,
    companyName: lead.companyName,
    description: lead.description,
    industry: lead.industry,
    contacts: lead.contacts,
    funding: lead.funding,
    technologies: lead.technologies,
    researchedAt: document.researchedAt.toISOString(),
    sourceUrls: lead.sourceUrls,
  };
}

/**
 * Get all leads from MongoDB
 */
export async function getLeads(limit = 100): Promise<LeadResponse[]> {
  const collection = await getLeadsCollection();

  const leads = await collection
    .find({})
    .sort({ researchedAt: -1 })
    .limit(limit)
    .toArray();

  return leads.map((lead) => ({
    id: lead._id!.toString(),
    domain: lead.domain,
    companyName: lead.companyName,
    description: lead.description,
    industry: lead.industry,
    contacts: lead.contacts,
    funding: lead.funding,
    technologies: lead.technologies,
    researchedAt: lead.researchedAt.toISOString(),
    sourceUrls: lead.sourceUrls,
  }));
}

/**
 * Search leads using MongoDB Atlas Vector Search
 * 
 * Requires a vector search index named "lead_vector_index" on the collection:
 * {
 *   "name": "lead_vector_index",
 *   "type": "vectorSearch",
 *   "fields": [{
 *     "type": "vector",
 *     "path": "embedding",
 *     "numDimensions": 1536,
 *     "similarity": "cosine"
 *   }]
 * }
 */
export async function searchLeads(query: string, limit = 20): Promise<LeadResponse[]> {
  const collection = await getLeadsCollection();

  // Generate embedding for the search query
  let queryEmbedding: number[];
  try {
    queryEmbedding = await generateEmbedding(query);
  } catch (error) {
    console.error("Failed to generate query embedding:", error);
    // Fall back to text search
    return textSearchLeads(query, limit);
  }

  try {
    // Use MongoDB Atlas Vector Search
    const results = await collection
      .aggregate([
        {
          $vectorSearch: {
            index: "lead_vector_index",
            path: "embedding",
            queryVector: queryEmbedding,
            numCandidates: limit * 10,
            limit: limit,
          },
        },
        {
          $project: {
            _id: 1,
            domain: 1,
            companyName: 1,
            description: 1,
            industry: 1,
            contacts: 1,
            funding: 1,
            technologies: 1,
            researchedAt: 1,
            sourceUrls: 1,
            score: { $meta: "vectorSearchScore" },
          },
        },
      ])
      .toArray();

    return results.map((lead) => ({
      id: lead._id!.toString(),
      domain: lead.domain,
      companyName: lead.companyName,
      description: lead.description,
      industry: lead.industry,
      contacts: lead.contacts,
      funding: lead.funding,
      technologies: lead.technologies,
      researchedAt: lead.researchedAt.toISOString(),
      sourceUrls: lead.sourceUrls,
      similarity: lead.score,
    }));
  } catch (error) {
    console.error("Vector search failed, falling back to text search:", error);
    return textSearchLeads(query, limit);
  }
}

/**
 * Fallback text search when vector search is not available
 */
async function textSearchLeads(query: string, limit: number): Promise<LeadResponse[]> {
  const collection = await getLeadsCollection();

  // Simple text matching as fallback
  const regex = new RegExp(query.split(" ").join("|"), "i");

  const leads = await collection
    .find({
      $or: [
        { companyName: regex },
        { description: regex },
        { industry: regex },
        { funding: regex },
        { technologies: regex },
      ],
    })
    .limit(limit)
    .toArray();

  return leads.map((lead) => ({
    id: lead._id!.toString(),
    domain: lead.domain,
    companyName: lead.companyName,
    description: lead.description,
    industry: lead.industry,
    contacts: lead.contacts,
    funding: lead.funding,
    technologies: lead.technologies,
    researchedAt: lead.researchedAt.toISOString(),
    sourceUrls: lead.sourceUrls,
  }));
}

/**
 * Get a single lead by ID
 */
export async function getLeadById(id: string): Promise<LeadResponse | null> {
  const collection = await getLeadsCollection();

  const lead = await collection.findOne({ _id: new ObjectId(id) });
  if (!lead) return null;

  return {
    id: lead._id!.toString(),
    domain: lead.domain,
    companyName: lead.companyName,
    description: lead.description,
    industry: lead.industry,
    contacts: lead.contacts,
    funding: lead.funding,
    technologies: lead.technologies,
    researchedAt: lead.researchedAt.toISOString(),
    sourceUrls: lead.sourceUrls,
  };
}
