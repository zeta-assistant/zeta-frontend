import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY, // This MUST be in your .env.local
});

export async function POST(req: Request) {
  console.log("🧪 ENV:", process.env.OPENAI_KEY?.slice(0, 8)); // Test if key loaded

  const { message } = await req.json();

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4", // or "gpt-3.5-turbo"
      messages: [
        {
          role: "system",
          content: "You are Zeta, a confident assistant that answers clearly.",
        },
        { role: "user", content: message },
      ],
    });

    const reply = completion.choices[0].message.content;
    return NextResponse.json({ reply });
  } catch (error) {
    console.error("❌ Zeta GPT error:", error);
    return NextResponse.json({ reply: "⚠️ Zeta had a GPT issue." });
  }
}