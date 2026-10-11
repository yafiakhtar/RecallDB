import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/mongodb";

export async function GET() {
  try {
    const database = await getDatabase();
    await database.command({ ping: 1 });

    return NextResponse.json({
      status: "ok",
      database: database.databaseName,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("MongoDB health check failed", error);

    return NextResponse.json(
      { status: "error", message: "Database unavailable" },
      { status: 503 },
    );
  }
}
