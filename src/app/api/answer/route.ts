import { NextResponse } from "next/server";

import { generateGroundedAnswer } from "@/lib/luminal";
import { semanticSearch } from "@/lib/search";

interface AnswerRequest {
  question?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AnswerRequest;
    const question =
      typeof body.question === "string" ? body.question.trim() : "";

    if (question.length < 3 || question.length > 500) {
      return NextResponse.json(
        { error: "Question must be between 3 and 500 characters." },
        { status: 400 },
      );
    }

    const results = await semanticSearch(question, 6);
    if (results.length === 0) {
      return NextResponse.json({
        answer: "I could not find relevant memories to answer that question.",
        references: [],
      });
    }

    const generated = await generateGroundedAnswer(
      question,
      results.map((result) => ({
        title: result.title,
        content: result.content,
        sourceExcerpt: result.sourceExcerpt,
        sourceTitle: result.source?.title ?? null,
      })),
    );
    const citationNumbers =
      generated.citations.length > 0
        ? generated.citations
        : results.map((_, index) => index + 1);

    return NextResponse.json({
      answer: generated.answer,
      references: citationNumbers.map((number) => {
        const result = results[number - 1];
        return {
          number,
          memoryId: result.id,
          memoryTitle: result.title,
          memoryContent: result.content,
          sourceExcerpt: result.sourceExcerpt,
          sourceId: result.source?.id ?? null,
          sourceTitle: result.source?.title ?? null,
          score: result.score,
        };
      }),
    });
  } catch (error) {
    console.error("Grounded answer failed", error);
    return NextResponse.json(
      { error: "Could not answer from your memories." },
      { status: 500 },
    );
  }
}
