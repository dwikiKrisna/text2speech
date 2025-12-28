import { NextRequest } from 'next/server';
import { synthesizeSpeechWithSRT, mapSpeedToRate, getChunkCount } from '@/lib/tts';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { text, voice, speed = 1.0 } = body;

        if (!text || !voice) {
            return new Response(
                JSON.stringify({ error: 'Text and voice are required' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        if (text.length > 50000) {
            return new Response(
                JSON.stringify({ error: 'Text too long. Maximum 50000 characters.' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const rate = mapSpeedToRate(parseFloat(speed));
        const totalChunks = getChunkCount(text);

        // Create a readable stream for SSE
        const encoder = new TextEncoder();

        const stream = new ReadableStream({
            async start(controller) {
                try {
                    // Send initial info
                    controller.enqueue(encoder.encode(
                        `data: ${JSON.stringify({ type: 'start', totalChunks })}\n\n`
                    ));

                    const result = await synthesizeSpeechWithSRT(
                        text,
                        voice,
                        rate,
                        (progress) => {
                            // Send progress update
                            controller.enqueue(encoder.encode(
                                `data: ${JSON.stringify({ type: 'progress', ...progress })}\n\n`
                            ));
                        }
                    );

                    // Send complete event with audio and SRT
                    const audioBase64 = result.audio.toString('base64');
                    controller.enqueue(encoder.encode(
                        `data: ${JSON.stringify({
                            type: 'complete',
                            audio: audioBase64,
                            srt: result.srt
                        })}\n\n`
                    ));

                    controller.close();
                } catch (error) {
                    console.error('Error in SSE stream:', error);
                    controller.enqueue(encoder.encode(
                        `data: ${JSON.stringify({ type: 'error', message: 'Failed to generate speech' })}\n\n`
                    ));
                    controller.close();
                }
            }
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });
    } catch (error) {
        console.error('Error synthesizing speech:', error);
        return new Response(
            JSON.stringify({ error: 'Failed to synthesize speech' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}
