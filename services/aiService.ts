import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize the Google Generative AI SDK with the API key from environment variables
// It falls back to empty string if not found, though we should handle the error if it's missing.
const genAI = new GoogleGenerativeAI(process.env.EXPO_PUBLIC_GEMINI_API_KEY || '');

export interface ParsedTransaction {
  title: string;
  amount: number;
  category: string;
  type: 'spending' | 'earning';
}

export async function parseTransactionFromText(text: string): Promise<ParsedTransaction> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
You are a strict financial transaction parser. Extract the transaction details from the user's input text.
Return ONLY a valid JSON object, without any markdown formatting, backticks, or extra text.

The JSON object must have exactly these keys:
- "title": A short, clear description of the transaction in Indonesian.
- "amount": An integer representing the amount in Rupiah. (e.g. 50k or 50 ribu = 50000).
- "category": Must be one of ["transfer", "shopping", "food", "deposit", "salary", "other"]. Determine the closest match based on the text.
- "type": Must be either "spending" or "earning".

User text: "${text}"
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let jsonString = response.text().trim();

    // Clean up potential markdown formatting (e.g., ```json ... ```)
    if (jsonString.startsWith('```json')) {
      jsonString = jsonString.slice(7);
    }
    if (jsonString.startsWith('```')) {
      jsonString = jsonString.slice(3);
    }
    if (jsonString.endsWith('```')) {
      jsonString = jsonString.slice(0, -3);
    }

    const parsed = JSON.parse(jsonString.trim());

    // Basic validation
    if (!parsed.title || typeof parsed.amount !== 'number' || !parsed.category || !parsed.type) {
        throw new Error('AI returned an incomplete JSON format.');
    }

    return {
      title: parsed.title,
      amount: parsed.amount,
      category: parsed.category,
      type: parsed.type,
    };
  } catch (error) {
    console.error('AI Parsing Error:', error);
    throw new Error('Gagal memproses teks dengan AI. Pastikan format teks jelas.');
  }
}
