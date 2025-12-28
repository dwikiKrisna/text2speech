'use client';

import { useState, useRef } from 'react';
import styles from './AudioOutput.module.css';

interface AudioOutputProps {
    text: string;
    voice: string;
    speed: number;
}

type Status = 'idle' | 'generating' | 'ready' | 'error';

interface Progress {
    current: number;
    total: number;
    percent: number;
}

export default function AudioOutput({ text, voice, speed }: AudioOutputProps) {
    const [status, setStatus] = useState<Status>('idle');
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [srtContent, setSrtContent] = useState<string>('');
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [progress, setProgress] = useState<Progress>({ current: 0, total: 0, percent: 0 });
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
        setProgress({ current: 0, total: 0, percent: 0 });
        setSrtContent('');

        // Revoke previous URL
        if (audioUrl) {
            URL.revokeObjectURL(audioUrl);
            setAudioUrl(null);
        }

        try {
            const response = await fetch('/api/tts-stream', {
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

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('No response body');
            }

            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const jsonStr = line.slice(6);
                        try {
                            const data = JSON.parse(jsonStr);

                            if (data.type === 'start') {
                                setProgress({ current: 0, total: data.totalChunks, percent: 0 });
                            } else if (data.type === 'progress') {
                                setProgress({
                                    current: data.current,
                                    total: data.total,
                                    percent: data.percent
                                });
                            } else if (data.type === 'complete') {
                                // Convert base64 to blob
                                const binaryString = atob(data.audio);
                                const bytes = new Uint8Array(binaryString.length);
                                for (let i = 0; i < binaryString.length; i++) {
                                    bytes[i] = binaryString.charCodeAt(i);
                                }
                                const blob = new Blob([bytes], { type: 'audio/mpeg' });
                                const url = URL.createObjectURL(blob);
                                setAudioUrl(url);

                                // Save SRT content
                                if (data.srt) {
                                    setSrtContent(data.srt);
                                }

                                setStatus('ready');
                            } else if (data.type === 'error') {
                                throw new Error(data.message);
                            }
                        } catch (e) {
                            console.error('Error parsing SSE data:', e);
                        }
                    }
                }
            }
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

    const handleDownloadSRT = () => {
        if (!srtContent) return;

        const blob = new Blob([srtContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `speech-${Date.now()}.srt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
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
                        <div className={styles.progressContainer}>
                            <div className={styles.progressHeader}>
                                <span>Generating audio...</span>
                                <span className={styles.progressPercent}>{progress.percent}%</span>
                            </div>
                            <div className={styles.progressBar}>
                                <div
                                    className={styles.progressFill}
                                    style={{ width: `${progress.percent}%` }}
                                />
                            </div>
                            {progress.total > 1 && (
                                <p className={styles.progressDetail}>
                                    Processing chunk {progress.current} of {progress.total}
                                </p>
                            )}
                        </div>
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
                            {progress.percent}% Processing...
                        </>
                    ) : (
                        <>
                            <span className={styles.buttonIcon}>✨</span>
                            Generate Speech
                        </>
                    )}
                </button>

                {status === 'ready' && audioUrl && (
                    <>
                        <button
                            type="button"
                            className={styles.downloadButton}
                            onClick={handleDownload}
                        >
                            <span className={styles.buttonIcon}>⬇️</span>
                            Download MP3
                        </button>

                        {srtContent && (
                            <button
                                type="button"
                                className={styles.srtButton}
                                onClick={handleDownloadSRT}
                            >
                                <span className={styles.buttonIcon}>📝</span>
                                Download SRT
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
