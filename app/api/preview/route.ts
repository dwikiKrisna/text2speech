import { NextRequest, NextResponse } from 'next/server';
import { synthesizeSpeech, getPreviewText, getVoices } from '@/lib/tts';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const voiceName = searchParams.get('voice');

        if (!voiceName) {
            return NextResponse.json(
                { error: 'Voice parameter is required' },
                { status: 400 }
            );
        }

        // Get the voice locale to determine preview text language
        const voices = await getVoices();
        const voice = voices.find((v) => v.shortName === voiceName);
        const locale = voice?.locale || 'en-US';

        const previewText = await getPreviewText(locale);
        const audioBuffer = await synthesizeSpeech(previewText, voiceName, '+0%');

        return new NextResponse(new Uint8Array(audioBuffer), {
            status: 200,
            headers: {
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'public, max-age=86400', // Cache preview for 1 day
            },
        });
    } catch (error) {
        console.error('Error generating preview:', error);
        return NextResponse.json(
            { error: 'Failed to generate preview' },
            { status: 500 }
        );
    }
}
