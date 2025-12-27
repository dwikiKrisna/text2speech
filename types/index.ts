export interface Voice {
    name: string;
    shortName: string;
    locale: string;
    language: string;
    gender: 'Male' | 'Female';
    friendlyName: string;
}

export interface TTSRequest {
    text: string;
    voice: string;
    rate: string;
}

export interface VoicesResponse {
    voices: Voice[];
    languages: string[];
}
