import { NextRequest, NextResponse } from 'next/server';
import { filterVoices, getLanguages } from '@/lib/tts';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const lang = searchParams.get('lang') || undefined;
        const gender = searchParams.get('gender') || undefined;

        const voices = await filterVoices(lang, gender);
        const languages = await getLanguages();

        return NextResponse.json({
            voices,
            languages,
            total: voices.length,
        });
    } catch (error) {
        console.error('Error fetching voices:', error);
        return NextResponse.json(
            { error: 'Failed to fetch voices' },
            { status: 500 }
        );
    }
}
