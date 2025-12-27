import { NextRequest, NextResponse } from 'next/server';
import { synthesizeSpeech, mapSpeedToRate } from '@/lib/tts';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { text, voice, speed = 1.0 } = body;

        if (!text || !voice) {
            return NextResponse.json(
                { error: 'Text and voice are required' },
                { status: 400 }
            );
        }

        if (text.length > 50000) {
            return NextResponse.json(
                { error: 'Text too long. Maximum 50000 characters.' },
                { status: 400 }
            );
        }

        const rate = mapSpeedToRate(parseFloat(speed));
        const audioBuffer = await synthesizeSpeech(text, voice, rate);

        return new NextResponse(new Uint8Array(audioBuffer), {
            status: 200,
            headers: {
                'Content-Type': 'audio/mpeg',
                'Content-Disposition': 'attachment; filename="speech.mp3"',
                'Content-Length': audioBuffer.length.toString(),
            },
        });
    } catch (error) {
        console.error('Error synthesizing speech:', error);
        return NextResponse.json(
            { error: 'Failed to synthesize speech' },
            { status: 500 }
        );
    }
}
