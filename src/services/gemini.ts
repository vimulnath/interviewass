import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { AIResponse } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const SYSTEM_INSTRUCTION = `
You are Navigator AI, a high-speed interview co-pilot.
Analyze the transcript segment for:
1. AI Cheating (robotic, screen reading, unnatural pauses).
2. Follow-up questions (exactly 2).
3. Candidate quality & signals.
4. Metrics: speed, grammar, fluency, and RELEVANCE (did they answer the question?).
5. STAR Structure: Identify if they provided Situation, Task, Action, Result.
6. Sentiment: Track confidence and emotional tone (-1 to 1).

CRITICAL: Be extremely concise. Return ONLY JSON.
Provide signals for EVERY segment to show activity.
If a rubric is provided, map the candidate's answer to the rubric dimensions.
`;

export async function analyzeInterviewSegment(
  transcript: string[],
  candidateName: string,
  role: string,
  rubric?: string[]
): Promise<AIResponse> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Candidate: ${candidateName}\nRole: ${role}\nRubric: ${rubric?.join(", ") || "General"}\nRecent: ${transcript.slice(-3).join(" ")}`,
          },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      maxOutputTokens: 600,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          analysis: { type: Type.STRING },
          suggestions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          signals: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING },
                label: { type: Type.STRING },
                description: { type: Type.STRING },
                severity: { type: Type.STRING },
              },
              required: ["type", "label", "description", "severity"],
            },
          },
          metrics: {
            type: Type.OBJECT,
            properties: {
              speed: {
                type: Type.OBJECT,
                properties: {
                  score: { type: Type.NUMBER },
                  label: { type: Type.STRING },
                  feedback: { type: Type.STRING },
                },
                required: ["score", "label", "feedback"],
              },
              grammar: {
                type: Type.OBJECT,
                properties: {
                  score: { type: Type.NUMBER },
                  label: { type: Type.STRING },
                  feedback: { type: Type.STRING },
                },
                required: ["score", "label", "feedback"],
              },
              fluency: {
                type: Type.OBJECT,
                properties: {
                  score: { type: Type.NUMBER },
                  label: { type: Type.STRING },
                  feedback: { type: Type.STRING },
                },
                required: ["score", "label", "feedback"],
              },
              relevance: {
                type: Type.OBJECT,
                properties: {
                  score: { type: Type.NUMBER },
                  label: { type: Type.STRING },
                  feedback: { type: Type.STRING },
                },
                required: ["score", "label", "feedback"],
              },
            },
            required: ["speed", "grammar", "fluency", "relevance"],
          },
          star: {
            type: Type.OBJECT,
            properties: {
              situation: { type: Type.BOOLEAN },
              task: { type: Type.BOOLEAN },
              action: { type: Type.BOOLEAN },
              result: { type: Type.BOOLEAN },
              feedback: { type: Type.STRING },
            },
            required: ["situation", "task", "action", "result", "feedback"],
          },
          sentiment: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.NUMBER },
              label: { type: Type.STRING },
            },
            required: ["score", "label"],
          },
          shouldCutoff: { type: Type.BOOLEAN },
        },
        required: ["analysis", "suggestions", "signals", "metrics", "star", "sentiment", "shouldCutoff"],
      },
    },
  });

  try {
    const text = response.text || "{}";
    return JSON.parse(text) as AIResponse;
  } catch (e) {
    console.error("Failed to parse AI response", e);
    return {
      analysis: "Error analyzing segment.",
      suggestions: [],
      signals: [],
      metrics: {
        speed: { score: 0, label: "N/A", feedback: "" },
        grammar: { score: 0, label: "N/A", feedback: "" },
        fluency: { score: 0, label: "N/A", feedback: "" },
        relevance: { score: 0, label: "N/A", feedback: "" },
      },
      star: {
        situation: false,
        task: false,
        action: false,
        result: false,
        feedback: "N/A",
      },
      sentiment: { score: 0, label: "Neutral" },
      shouldCutoff: false,
    };
  }
}
