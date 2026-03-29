import { NextResponse } from "next/server";
import { MongoClient } from "mongodb";

export async function GET() {
  const uri = process.env.MONGODB_URI;
  
  if (!uri) {
    return NextResponse.json({
      success: false,
      error: "MONGODB_URI environment variable is not set",
      details: null,
    });
  }

  // Log URI format (hide password)
  const sanitizedUri = uri.replace(/:([^@]+)@/, ":****@");
  console.log("[v0] Testing MongoDB connection to:", sanitizedUri);

  let client: MongoClient | null = null;
  
  try {
    // Try different connection options
    client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 10000,
      // Try with TLS settings for Atlas
      tls: true,
      tlsAllowInvalidCertificates: false,
    });

    console.log("[v0] Attempting to connect...");
    await client.connect();
    console.log("[v0] Connected successfully!");

    // Test the connection
    const db = client.db("leadvault");
    const result = await db.command({ ping: 1 });
    console.log("[v0] Ping result:", result);

    // Get database info
    const collections = await db.listCollections().toArray();
    
    return NextResponse.json({
      success: true,
      message: "MongoDB connection successful!",
      database: "leadvault",
      collections: collections.map(c => c.name),
      ping: result,
    });
  } catch (error) {
    console.log("[v0] MongoDB connection error:", error);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorName = error instanceof Error ? error.name : "Unknown";
    
    // Provide helpful debugging info
    let suggestion = "";
    if (errorMessage.includes("SSL") || errorMessage.includes("TLS") || errorMessage.includes("tlsv1")) {
      suggestion = "SSL/TLS error detected. Try adding '?tls=true&tlsInsecure=true' to your connection string, or check if your MongoDB Atlas cluster is running.";
    } else if (errorMessage.includes("ENOTFOUND") || errorMessage.includes("getaddrinfo")) {
      suggestion = "DNS resolution failed. Check your MongoDB Atlas cluster hostname.";
    } else if (errorMessage.includes("authentication") || errorMessage.includes("auth")) {
      suggestion = "Authentication failed. Check your username and password in the connection string.";
    } else if (errorMessage.includes("network") || errorMessage.includes("timeout")) {
      suggestion = "Network error. Ensure your IP is whitelisted in MongoDB Atlas Network Access settings.";
    }

    return NextResponse.json({
      success: false,
      error: errorMessage,
      errorType: errorName,
      suggestion,
      connectionString: uri.replace(/:([^@]+)@/, ":****@"),
    });
  } finally {
    if (client) {
      await client.close();
    }
  }
}
