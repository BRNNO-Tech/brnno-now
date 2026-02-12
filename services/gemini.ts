import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SERVICE_OPTIONS = "Interior Detail (deep vacuum, steam clean, upholstery), Exterior Detail (wash, wax, wheels and trim), Full Detail (interior + exterior).";

export type SuggestedCondition = "light" | "normal" | "heavy" | "extreme";

export interface DetailingRecommendation {
  recommendation: string;
  serviceId: "interior-detail" | "exterior-detail" | "full-detail";
  reasoning: string;
  suggestedCondition?: SuggestedCondition;
}

export async function getDetailingRecommendation(carInfo: string, condition: string): Promise<DetailingRecommendation> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: `You are a car detailing advisor. Suggest exactly ONE of these services: Interior Detail, Exterior Detail, Full Detail.
Services: ${SERVICE_OPTIONS}
Customer's car: ${carInfo}. They describe condition as: ${condition}.
Return the exact service name (one of: Interior Detail, Exterior Detail, Full Detail), the matching serviceId (one of: interior-detail, exterior-detail, full-detail), short reasoning, and optionally suggestedCondition (one of: light, normal, heavy, extreme) if their description suggests extra-dirty or light use.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            recommendation: { type: Type.STRING },
            serviceId: { type: Type.STRING },
            reasoning: { type: Type.STRING },
            suggestedCondition: { type: Type.STRING }
          },
          required: ["recommendation", "serviceId", "reasoning"]
        }
      }
    });

    const parsed = JSON.parse(response.text) as DetailingRecommendation;
    const validIds = ["interior-detail", "exterior-detail", "full-detail"];
    if (!validIds.includes(parsed.serviceId)) {
      parsed.serviceId = "full-detail";
      parsed.recommendation = "Full Detail";
    }
    const validConditions: SuggestedCondition[] = ["light", "normal", "heavy", "extreme"];
    if (parsed.suggestedCondition && !validConditions.includes(parsed.suggestedCondition as SuggestedCondition)) {
      delete parsed.suggestedCondition;
    }
    return parsed;
  } catch (error) {
    console.error("Gemini Error:", error);
    return {
      recommendation: "Full Detail",
      serviceId: "full-detail",
      reasoning: "Based on common needs for car care.",
    };
  }
}
