import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { Voice } from '@/types';

// Cache for voices list
let voicesCache: Voice[] | null = null;

// Maximum characters per chunk (to avoid 10 minute limit per request)
const MAX_CHARS_PER_CHUNK = 3000;

// Words per subtitle line
const WORDS_PER_SUBTITLE = 10;

// Type for MsEdgeTTS voice
interface MsEdgeVoice {
    Name: string;
    ShortName: string;
    Locale: string;
    Gender: string;
    FriendlyName: string;
}

// Word boundary metadata from TTS
export interface WordBoundary {
    Type: string;
    Data: {
        Offset: number;      // Time offset in ticks (100ns units)
        Duration: number;    // Duration in ticks
        text: {
            Text: string;
            Length: number;
            BoundaryType: string;
        };
    };
}

// Progress callback type
export interface ProgressInfo {
    current: number;
    total: number;
    percent: number;
}

// Result with audio and SRT
export interface SynthesisResult {
    audio: Buffer;
    srt: string;
}

export type ProgressCallback = (progress: ProgressInfo) => void;

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
    const percentage = Math.round((speed - 1) * 100);
    return percentage >= 0 ? `+${percentage}%` : `${percentage}%`;
}

/**
 * Convert ticks (100ns) to milliseconds
 */
function ticksToMs(ticks: number): number {
    return ticks / 10000;
}

/**
 * Format milliseconds to SRT timestamp (HH:MM:SS,mmm)
 */
function formatSrtTime(ms: number): string {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const milliseconds = Math.floor(ms % 1000);

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

/**
 * Generate SRT content from word boundaries
 */
function generateSRT(boundaries: WordBoundary[], timeOffset: number = 0): string {
    if (boundaries.length === 0) return '';

    const subtitles: string[] = [];
    let subtitleIndex = 1;
    let currentWords: { text: string; startMs: number; endMs: number }[] = [];

    for (const boundary of boundaries) {
        // Skip non-word boundaries (punctuation only)
        const text = boundary.Data?.text?.Text?.trim();
        if (!text || boundary.Data?.text?.BoundaryType === 'PunctuationBoundary') continue;

        const startMs = ticksToMs(boundary.Data.Offset) + timeOffset;
        const endMs = startMs + ticksToMs(boundary.Data.Duration);

        currentWords.push({ text, startMs, endMs });

        // Create subtitle when we have enough words or at sentence end
        const isEndOfSentence = text.match(/[.!?]$/);
        if (currentWords.length >= WORDS_PER_SUBTITLE || isEndOfSentence) {
            const lineText = currentWords.map(w => w.text).join(' ');
            const lineStart = currentWords[0].startMs;
            const lineEnd = currentWords[currentWords.length - 1].endMs;

            subtitles.push(
                `${subtitleIndex}\n${formatSrtTime(lineStart)} --> ${formatSrtTime(lineEnd)}\n${lineText}\n`
            );

            subtitleIndex++;
            currentWords = [];
        }
    }

    // Handle remaining words
    if (currentWords.length > 0) {
        const lineText = currentWords.map(w => w.text).join(' ');
        const lineStart = currentWords[0].startMs;
        const lineEnd = currentWords[currentWords.length - 1].endMs;

        subtitles.push(
            `${subtitleIndex}\n${formatSrtTime(lineStart)} --> ${formatSrtTime(lineEnd)}\n${lineText}\n`
        );
    }

    return subtitles.join('\n');
}

/**
 * Split text into chunks at sentence boundaries
 */
function splitTextIntoChunks(text: string, maxCharsPerChunk: number = MAX_CHARS_PER_CHUNK): string[] {
    const chunks: string[] = [];
    let remainingText = text.trim();

    while (remainingText.length > 0) {
        if (remainingText.length <= maxCharsPerChunk) {
            chunks.push(remainingText);
            break;
        }

        let splitIndex = maxCharsPerChunk;
        const sentenceEnders = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];
        let bestSplit = -1;

        for (const ender of sentenceEnders) {
            const lastIndex = remainingText.lastIndexOf(ender, maxCharsPerChunk);
            if (lastIndex > bestSplit) {
                bestSplit = lastIndex + ender.length - 1;
            }
        }

        if (bestSplit > maxCharsPerChunk * 0.5) {
            splitIndex = bestSplit;
        } else {
            const newlineIndex = remainingText.lastIndexOf('\n', maxCharsPerChunk);
            if (newlineIndex > maxCharsPerChunk * 0.5) {
                splitIndex = newlineIndex;
            } else {
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
 * Synthesize a single chunk with metadata for SRT
 */
async function synthesizeChunkWithMetadata(
    text: string,
    voice: string
): Promise<{ audio: Buffer; boundaries: WordBoundary[] }> {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const audioChunks: Buffer[] = [];
    const boundaries: WordBoundary[] = [];

    const result = tts.toStream(text);
    const audioStream = result.audioStream;
    const metadataStream = result.metadataStream;

    return new Promise((resolve, reject) => {
        audioStream.on('data', (chunk: Buffer) => {
            audioChunks.push(chunk);
        });

        if (metadataStream) {
            metadataStream.on('data', (data: Buffer) => {
                try {
                    const metadata = JSON.parse(data.toString()) as WordBoundary;
                    if (metadata.Type === 'WordBoundary') {
                        boundaries.push(metadata);
                    }
                } catch {
                    // Ignore parse errors
                }
            });
        }

        audioStream.on('end', () => {
            resolve({
                audio: Buffer.concat(audioChunks),
                boundaries
            });
        });

        audioStream.on('error', (err: Error) => {
            reject(err);
        });
    });
}

/**
 * Get total number of chunks for a given text
 */
export function getChunkCount(text: string): number {
    return splitTextIntoChunks(text).length;
}

/**
 * Synthesize speech with progress and SRT generation
 */
export async function synthesizeSpeechWithSRT(
    text: string,
    voice: string,
    rate: string = '+0%',
    onProgress?: ProgressCallback
): Promise<SynthesisResult> {
    const textChunks = splitTextIntoChunks(text);
    const total = textChunks.length;

    const audioBuffers: Buffer[] = [];
    const allBoundaries: WordBoundary[] = [];
    let timeOffset = 0;

    for (let i = 0; i < textChunks.length; i++) {
        const { audio, boundaries } = await synthesizeChunkWithMetadata(textChunks[i], voice);
        audioBuffers.push(audio);

        // Adjust boundary offsets for multi-chunk
        for (const boundary of boundaries) {
            const adjustedBoundary = { ...boundary };
            adjustedBoundary.Data = {
                ...boundary.Data,
                Offset: boundary.Data.Offset + (timeOffset * 10000) // Convert ms to ticks
            };
            allBoundaries.push(adjustedBoundary);
        }

        // Estimate duration based on audio size (48kbps = 6000 bytes/sec)
        const estimatedDurationMs = (audio.length / 6000) * 1000;
        timeOffset += estimatedDurationMs;

        const progress: ProgressInfo = {
            current: i + 1,
            total,
            percent: Math.round(((i + 1) / total) * 100)
        };
        onProgress?.(progress);
    }

    const audioBuffer = Buffer.concat(audioBuffers);
    const srt = generateSRT(allBoundaries);

    return { audio: audioBuffer, srt };
}

/**
 * Synthesize speech with progress callback (backward compatible)
 */
export async function synthesizeSpeechWithProgress(
    text: string,
    voice: string,
    rate: string = '+0%',
    onProgress?: ProgressCallback
): Promise<Buffer> {
    const result = await synthesizeSpeechWithSRT(text, voice, rate, onProgress);
    return result.audio;
}

/**
 * Synthesize speech (backward compatible)
 */
export async function synthesizeSpeech(
    text: string,
    voice: string,
    rate: string = '+0%'
): Promise<Buffer> {
    return synthesizeSpeechWithProgress(text, voice, rate);
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
