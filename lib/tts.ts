import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { Voice } from '@/types';

// Cache for voices list
let voicesCache: Voice[] | null = null;

// Maximum characters per chunk (to avoid 10 minute limit per request)
const MAX_CHARS_PER_CHUNK = 3000;

// Words per subtitle line
const WORDS_PER_SUBTITLE = 8;

// Average speaking rate: ~150 words per minute = 2.5 words per second
const WORDS_PER_SECOND = 2.5;

// Type for MsEdgeTTS voice
interface MsEdgeVoice {
    Name: string;
    ShortName: string;
    Locale: string;
    Gender: string;
    FriendlyName: string;
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
 * Generate SRT from text with estimated timing based on audio duration
 */
function generateSRTFromText(text: string, audioDurationMs: number, speed: number = 1.0): string {
    // Split text into words
    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) return '';

    // Calculate time per word based on actual audio duration
    const adjustedDuration = audioDurationMs / speed;
    const msPerWord = adjustedDuration / words.length;

    const subtitles: string[] = [];
    let subtitleIndex = 1;
    let currentTimeMs = 0;

    for (let i = 0; i < words.length; i += WORDS_PER_SUBTITLE) {
        const lineWords = words.slice(i, i + WORDS_PER_SUBTITLE);
        const lineText = lineWords.join(' ');
        const lineDurationMs = lineWords.length * msPerWord;

        const startTime = currentTimeMs;
        const endTime = currentTimeMs + lineDurationMs;

        subtitles.push(
            `${subtitleIndex}\n${formatSrtTime(startTime)} --> ${formatSrtTime(endTime)}\n${lineText}\n`
        );

        subtitleIndex++;
        currentTimeMs = endTime;
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
 * Synthesize a single chunk to audio
 */
async function synthesizeChunk(text: string, voice: string): Promise<Buffer> {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const audioChunks: Buffer[] = [];
    const result = tts.toStream(text);
    const audioStream = result.audioStream;

    return new Promise((resolve, reject) => {
        audioStream.on('data', (chunk: Buffer) => {
            audioChunks.push(chunk);
        });

        audioStream.on('end', () => {
            resolve(Buffer.concat(audioChunks));
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
 * Estimate audio duration in milliseconds from buffer size
 * For MP3 48kbps: 6000 bytes per second
 */
function estimateAudioDuration(audioBuffer: Buffer): number {
    return (audioBuffer.length / 6000) * 1000;
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
    const chunkDurations: number[] = [];

    for (let i = 0; i < textChunks.length; i++) {
        const audio = await synthesizeChunk(textChunks[i], voice);
        audioBuffers.push(audio);
        chunkDurations.push(estimateAudioDuration(audio));

        const progress: ProgressInfo = {
            current: i + 1,
            total,
            percent: Math.round(((i + 1) / total) * 100)
        };
        onProgress?.(progress);
    }

    const audioBuffer = Buffer.concat(audioBuffers);
    const totalDuration = chunkDurations.reduce((a, b) => a + b, 0);

    // Parse speed from rate string (e.g., "+25%" -> 1.25)
    const speedMatch = rate.match(/([+-]?\d+)%/);
    const speedModifier = speedMatch ? parseInt(speedMatch[1]) / 100 : 0;
    const speed = 1 + speedModifier;

    // Generate SRT from full text with estimated timing
    const srt = generateSRTFromText(text, totalDuration, speed);

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
