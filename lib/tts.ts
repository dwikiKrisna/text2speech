import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { Voice } from '@/types';

// Cache for voices list
let voicesCache: Voice[] | null = null;

// Maximum characters per chunk (to avoid 10 minute limit per request)
const MAX_CHARS_PER_CHUNK = 3000;

// Type for MsEdgeTTS voice
interface MsEdgeVoice {
    Name: string;
    ShortName: string;
    Locale: string;
    Gender: string;
    FriendlyName: string;
}

export async function getVoices(): Promise<Voice[]> {
    if (voicesCache) {
        return voicesCache;
    }

    const tts = new MsEdgeTTS();
    const rawVoices = await tts.getVoices() as MsEdgeVoice[];

    voicesCache = rawVoices.map((v) => ({
        name: v.Name,
        shortName: v.ShortName,
        locale: v.Locale,
        language: v.Locale.split('-')[0],
        gender: v.Gender as 'Male' | 'Female',
        friendlyName: v.FriendlyName,
    }));

    return voicesCache;
}

export async function filterVoices(
    lang?: string,
    gender?: string
): Promise<Voice[]> {
    const voices = await getVoices();

    return voices.filter((voice) => {
        const matchLang = !lang || voice.locale.toLowerCase().startsWith(lang.toLowerCase());
        const matchGender = !gender || gender === 'all' || voice.gender.toLowerCase() === gender.toLowerCase();
        return matchLang && matchGender;
    });
}

export async function getLanguages(): Promise<string[]> {
    const voices = await getVoices();
    const locales = [...new Set(voices.map((v) => v.locale))];
    return locales.sort();
}

export function mapSpeedToRate(speed: number): string {
    // speed: 0.5 to 2.0 -> rate: -50% to +100%
    const percentage = Math.round((speed - 1) * 100);
    return percentage >= 0 ? `+${percentage}%` : `${percentage}%`;
}

/**
 * Split text into chunks at sentence boundaries
 * This helps avoid cutting words/sentences in the middle
 */
function splitTextIntoChunks(text: string, maxCharsPerChunk: number = MAX_CHARS_PER_CHUNK): string[] {
    const chunks: string[] = [];
    let remainingText = text.trim();

    while (remainingText.length > 0) {
        if (remainingText.length <= maxCharsPerChunk) {
            chunks.push(remainingText);
            break;
        }

        // Find the best split point (end of sentence) within the limit
        let splitIndex = maxCharsPerChunk;

        // Look for sentence endings: . ! ? followed by space or end
        const sentenceEnders = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];
        let bestSplit = -1;

        for (const ender of sentenceEnders) {
            const lastIndex = remainingText.lastIndexOf(ender, maxCharsPerChunk);
            if (lastIndex > bestSplit) {
                bestSplit = lastIndex + ender.length - 1; // Include the punctuation
            }
        }

        // If we found a sentence boundary, use it
        if (bestSplit > maxCharsPerChunk * 0.5) {
            splitIndex = bestSplit;
        } else {
            // Fallback: try to split at newline
            const newlineIndex = remainingText.lastIndexOf('\n', maxCharsPerChunk);
            if (newlineIndex > maxCharsPerChunk * 0.5) {
                splitIndex = newlineIndex;
            } else {
                // Last resort: split at space
                const spaceIndex = remainingText.lastIndexOf(' ', maxCharsPerChunk);
                if (spaceIndex > maxCharsPerChunk * 0.5) {
                    splitIndex = spaceIndex;
                }
            }
        }

        chunks.push(remainingText.slice(0, splitIndex).trim());
        remainingText = remainingText.slice(splitIndex).trim();
    }

    return chunks;
}

/**
 * Synthesize a single chunk of text to audio
 */
async function synthesizeChunk(
    text: string,
    voice: string
): Promise<Buffer> {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const chunks: Buffer[] = [];
    const result = tts.toStream(text);
    const audioStream = result.audioStream;

    return new Promise((resolve, reject) => {
        audioStream.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
        });

        audioStream.on('end', () => {
            resolve(Buffer.concat(chunks));
        });

        audioStream.on('error', (err: Error) => {
            reject(err);
        });
    });
}

/**
 * Synthesize speech with automatic text chunking for long texts
 * This allows audio output longer than the 10-minute API limit
 */
export async function synthesizeSpeech(
    text: string,
    voice: string,
    rate: string = '+0%'
): Promise<Buffer> {
    // Split text into manageable chunks
    const textChunks = splitTextIntoChunks(text);

    // If only one chunk, process directly
    if (textChunks.length === 1) {
        return synthesizeChunk(textChunks[0], voice);
    }

    // Process all chunks and concatenate audio
    console.log(`Processing ${textChunks.length} text chunks...`);

    const audioBuffers: Buffer[] = [];

    for (let i = 0; i < textChunks.length; i++) {
        console.log(`Processing chunk ${i + 1}/${textChunks.length} (${textChunks[i].length} chars)`);
        const audioBuffer = await synthesizeChunk(textChunks[i], voice);
        audioBuffers.push(audioBuffer);
    }

    // Concatenate all audio buffers
    // Since MP3 is a streaming format, we can simply concatenate the buffers
    return Buffer.concat(audioBuffers);
}

export async function getPreviewText(locale: string): Promise<string> {
    const previewTexts: Record<string, string> = {
        'id': 'Halo, ini adalah contoh suara saya.',
        'en': 'Hello, this is a sample of my voice.',
        'ja': 'こんにちは、これは私の声のサンプルです。',
        'ko': '안녕하세요, 이것은 제 목소리 샘플입니다.',
        'zh': '你好，这是我的声音样本。',
        'es': 'Hola, esta es una muestra de mi voz.',
        'fr': 'Bonjour, ceci est un échantillon de ma voix.',
        'de': 'Hallo, dies ist eine Probe meiner Stimme.',
        'pt': 'Olá, esta é uma amostra da minha voz.',
        'ar': 'مرحباً، هذا نموذج لصوتي.',
        'hi': 'नमस्ते, यह मेरी आवाज़ का नमूना है।',
        'ru': 'Привет, это образец моего голоса.',
    };

    const langCode = locale.split('-')[0].toLowerCase();
    return previewTexts[langCode] || previewTexts['en'];
}
