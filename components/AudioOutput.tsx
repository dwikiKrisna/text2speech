'use client';

import { useState, useRef } from 'react';
import styles from './AudioOutput.module.css';

interface AudioOutputProps {
    text: string;
    voice: string;
    speed: number;
}

type Status = 'idle' | 'generating' | 'ready' | 'error';

export default function AudioOutput({ text, voice, speed }: AudioOutputProps) {
    const [status, setStatus] = useState<Status>('idle');
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string>('');
    const audioRef = useRef<HTMLAudioElement>(null);

    const handleGenerate = async () => {
        if (!text.trim()) {
            setErrorMessage('Please enter some text first');
            setStatus('error');
            return;
        }

        if (!voice) {
            setErrorMessage('Please select a voice');
            setStatus('error');
            return;
        }

        setStatus('generating');
        setErrorMessage('');

        // Revoke previous URL
        if (audioUrl) {
            URL.revokeObjectURL(audioUrl);
            setAudioUrl(null);
        }

        try {
            const response = await fetch('/api/tts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text, voice, speed }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to generate speech');
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            setAudioUrl(url);
            setStatus('ready');
        } catch (error) {
            console.error('Generation failed:', error);
            setErrorMessage(error instanceof Error ? error.message : 'An error occurred');
            setStatus('error');
        }
    };

    const handleDownload = () => {
        if (!audioUrl) return;

        const link = document.createElement('a');
        link.href = audioUrl;
        link.download = `speech-${Date.now()}.mp3`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const canGenerate = text.trim() && voice;

    return (
        <div className={styles.container}>
            <label className={styles.label}>Output</label>

            <div className={styles.content}>
                {status === 'idle' && (
                    <div className={styles.placeholder}>
                        <span className={styles.placeholderIcon}>🎵</span>
                        <p>Click &quot;Generate&quot; to convert your text to speech</p>
                    </div>
                )}

                {status === 'generating' && (
                    <div className={styles.generating}>
                        <div className={styles.spinner}></div>
                        <p>Generating audio...</p>
                    </div>
                )}

                {status === 'error' && (
                    <div className={styles.error}>
                        <span className={styles.errorIcon}>⚠️</span>
                        <p>{errorMessage}</p>
                    </div>
                )}

                {status === 'ready' && audioUrl && (
                    <div className={styles.player}>
                        <audio
                            ref={audioRef}
                            src={audioUrl}
                            controls
                            className={styles.audio}
                        />
                    </div>
                )}
            </div>

            <div className={styles.actions}>
                <button
                    type="button"
                    className={styles.generateButton}
                    onClick={handleGenerate}
                    disabled={!canGenerate || status === 'generating'}
                >
                    {status === 'generating' ? (
                        <>
                            <span className={styles.buttonSpinner}></span>
                            Generating...
                        </>
                    ) : (
                        <>
                            <span className={styles.buttonIcon}>✨</span>
                            Generate Speech
                        </>
                    )}
                </button>

                {status === 'ready' && audioUrl && (
                    <button
                        type="button"
                        className={styles.downloadButton}
                        onClick={handleDownload}
                    >
                        <span className={styles.buttonIcon}>⬇️</span>
                        Download MP3
                    </button>
                )}
            </div>
        </div>
    );
}
