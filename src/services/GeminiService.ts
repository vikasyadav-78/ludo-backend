import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env';
import { logger } from '../config/logger';

export interface GeminiAnalysisResult {
  isLudoKing: boolean;
  winner: string;
  loser: string;
  roomCode: string;
  editedImage: boolean;
  blurredImage: boolean;
  confidence: number;
  reason: string;
}

export class GeminiService {
  private genAI: GoogleGenerativeAI | null = null;

  constructor() {
    const apiKey = env.GEMINI_API_KEY;
    if (apiKey && apiKey !== 'YOUR_GEMINI_API_KEY' && apiKey !== 'placeholder_gemini_key') {
      this.genAI = new GoogleGenerativeAI(apiKey);
    } else {
      logger.warn('Gemini API Key is not configured. AI verification will operate in mock mode.');
    }
  }

  /**
   * Helper to download an image from a URL and convert it to a base64 Generative Part
   */
  private async downloadImageAsGenerativePart(url: string): Promise<{ inlineData: { data: string; mimeType: string } }> {
    try {
      logger.info(`Downloading screenshot for AI verification from: ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download image from URL. Status: ${response.status}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const mimeType = response.headers.get('content-type') || 'image/jpeg';
      
      return {
        inlineData: {
          data: buffer.toString('base64'),
          mimeType
        }
      };
    } catch (error: any) {
      logger.error(`Error downloading image from URL ${url}:`, error);
      throw error;
    }
  }

  /**
   * Send both screenshot URLs to Gemini for Ludo King analysis
   */
  async analyzeScreenshots(
    playerAScreenshotUrl: string,
    playerBScreenshotUrl: string
  ): Promise<GeminiAnalysisResult> {
    const prompt = `
Analyze the two uploaded screenshots from a Ludo King mobile game session. 
They are submitted by two players in a match.
You must verify the details and return a structured JSON response only.

Instructions:
1. Determine if these are genuine, unaltered Ludo King game results screens.
2. Look at the player names and scores on the screens. Identify the winner (the player with the rank 1, or declared as winner) and the loser.
3. Detect the game room code (typically a 6-to-8 digit number, e.g. "0425607" or "LK425607" or similar Ludo King room codes) if visible on either screen.
4. Inspect the image for obvious visual anomalies, edits, photoshop, cropped layers, overlay text, or any form of digital manipulation. Set "editedImage" to true if you suspect editing.
5. Check if the image is too blurry, low quality, dark, or cropped to read. Set "blurredImage" to true if it is unreadable.
6. Provide a confidence score (from 0 to 100) indicating how certain you are of the winner and the authenticity of the screenshots.
7. Provide a short, direct explanation of your findings in the "reason" field.

You MUST strictly return your response in the following JSON format without markdown wrapping, and it must contain ONLY the valid JSON object:
{
  "isLudoKing": true,
  "winner": "PLAYER_NAME_HERE",
  "loser": "PLAYER_NAME_HERE",
  "roomCode": "ROOM_CODE_HERE",
  "editedImage": false,
  "blurredImage": false,
  "confidence": 98,
  "reason": "Explanation description here"
}
`;

    // Attempt the API call (with 1 retry)
    let attempt = 0;
    const maxAttempts = 2;

    while (attempt < maxAttempts) {
      attempt++;
      try {
        if (!this.genAI) {
          // If no API key, return a mock response for fallback/testing
          logger.warn('Gemini API is not initialized. Returning mock analysis result.');
          return {
            isLudoKing: true,
            winner: 'MOCK_WINNER',
            loser: 'MOCK_LOSER',
            roomCode: 'LK123456',
            editedImage: false,
            blurredImage: false,
            confidence: 99,
            reason: 'Mock verification: Gemini API Key is missing. Settle this match manually or configure GEMINI_API_KEY in .env.'
          };
        }

        const imagePartA = await this.downloadImageAsGenerativePart(playerAScreenshotUrl);
        const imagePartB = await this.downloadImageAsGenerativePart(playerBScreenshotUrl);

        logger.info(`Sending screenshots to Gemini (Attempt ${attempt}/${maxAttempts})...`);
        const model = this.genAI.getGenerativeModel({
          model: 'gemini-1.5-flash',
          generationConfig: { responseMimeType: 'application/json' }
        });

        const result = await model.generateContent([
          prompt,
          imagePartA,
          imagePartB
        ]);

        const responseText = result.response.text();
        logger.info(`Received response from Gemini: ${responseText}`);

        const parsed: GeminiAnalysisResult = JSON.parse(responseText.trim());
        
        // Basic validation of fields
        if (typeof parsed.isLudoKing !== 'boolean' || typeof parsed.confidence !== 'number') {
          throw new Error('Invalid JSON format returned from Gemini');
        }

        return parsed;

      } catch (error: any) {
        logger.error(`Error on Gemini analysis attempt ${attempt}:`, error);
        if (attempt >= maxAttempts) {
          throw error; // Re-throw if all attempts failed
        }
        logger.info('Retrying Gemini Vision API call...');
      }
    }

    throw new Error('Failed to analyze screenshots after multiple attempts');
  }
}

export const geminiService = new GeminiService();
export default geminiService;
