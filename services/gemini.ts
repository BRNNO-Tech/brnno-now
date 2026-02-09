
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function getDetailingRecommendation(carInfo: string, condition: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Suggest a car detailing service from these options: Quick Shine ($45), Deep Reset ($120), Ceramic Shield ($350). 
      Car: ${carInfo}. Condition: ${condition}. 
      Return a short helpful advice and the recommended package name.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            recommendation: { type: Type.STRING },
            reasoning: { type: Type.STRING }
          },
          required: ["recommendation", "reasoning"]
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Gemini Error:", error);
    return { recommendation: "Deep Reset", reasoning: "Based on common needs for car care." };
  }
}
