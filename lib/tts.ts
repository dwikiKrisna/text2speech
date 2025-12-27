import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { Voice } from '@/types';

// Cache for voices list
let voicesCache: Voice[] | null = null;

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

export async function synthesizeSpeech(
    text: string,
    voice: string,
    rate: string = '+0%'
): Promise<Buffer> {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    // Collect all audio chunks
    const chunks: Buffer[] = [];

    // toStream returns an object with audioStream property
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
