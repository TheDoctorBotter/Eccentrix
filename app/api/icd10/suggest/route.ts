import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface ICD10Code {
  code: string;
  description: string;
}

export async function POST(request: NextRequest) {
  try {
    const { diagnosis } = await request.json();

    if (!diagnosis || typeof diagnosis !== 'string' || diagnosis.trim().length === 0) {
      return NextResponse.json(
        { error: 'Diagnosis description is required' },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    // Use OpenAI to suggest ICD-10 codes
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a medical coding expert specializing in ICD-10 codes for physical therapy.
Given a diagnosis description, suggest up to 5 relevant ICD-10 codes.
Return ONLY a valid JSON array of objects with "code" and "description" fields.
Format: [{"code": "M54.5", "description": "Low back pain"}, ...]
Use the most specific and appropriate codes for physical therapy documentation.`,
        },
        {
          role: 'user',
          content: `Suggest ICD-10 codes for: ${diagnosis}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    // Parse the JSON response
    let codes: ICD10Code[];
    try {
      codes = JSON.parse(content);
    } catch (parseError) {
      // If JSON parsing fails, try to extract JSON from the response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        codes = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse ICD-10 codes from response');
      }
    }

    // Validate the response structure
    if (!Array.isArray(codes)) {
      throw new Error('Invalid response format: expected array');
    }

    // Ensure each code has the required fields
    codes = codes
      .filter((code) => code.code && code.description)
      .slice(0, 5); // Limit to 5 codes

    if (codes.length === 0) {
      throw new Error('No valid ICD-10 codes returned');
    }

    return NextResponse.json({ codes });
  } catch (error) {
    console.error('Error suggesting ICD-10 codes:', error);
    return NextResponse.json(
      {
        error: 'Failed to suggest ICD-10 codes',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
