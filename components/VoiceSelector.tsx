'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Voice } from '@/types';
import styles from './VoiceSelector.module.css';

interface VoiceSelectorProps {
    selectedVoice: string;
    onVoiceChange: (voice: string) => void;
}

export default function VoiceSelector({ selectedVoice, onVoiceChange }: VoiceSelectorProps) {
    const [voices, setVoices] = useState<Voice[]>([]);
    const [languages, setLanguages] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [languageFilter, setLanguageFilter] = useState<string>('');
    const [genderFilter, setGenderFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        fetchVoices();
    }, []);

    const fetchVoices = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/voices');
            const data = await res.json();
            setVoices(data.voices);
            setLanguages(data.languages);
        } catch (error) {
            console.error('Failed to fetch voices:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredVoices = useMemo(() => {
        return voices.filter((voice) => {
            const matchLang = !languageFilter || voice.locale.startsWith(languageFilter);
            const matchGender = genderFilter === 'all' || voice.gender.toLowerCase() === genderFilter;
            const matchSearch = !searchQuery ||
                voice.friendlyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                voice.locale.toLowerCase().includes(searchQuery.toLowerCase());
            return matchLang && matchGender && matchSearch;
        });
    }, [voices, languageFilter, genderFilter, searchQuery]);

    const languageOptions = useMemo(() => {
        const uniqueLangs = new Map<string, string>();
        languages.forEach((locale) => {
            const langCode = locale.split('-')[0];
            if (!uniqueLangs.has(langCode)) {
                uniqueLangs.set(langCode, locale);
            }
        });
        return Array.from(uniqueLangs.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    }, [languages]);

    const handlePreview = async (voiceName: string) => {
        if (previewingVoice === voiceName) {
            audioRef.current?.pause();
            setPreviewingVoice(null);
            return;
        }

        setPreviewingVoice(voiceName);

        try {
            if (audioRef.current) {
                audioRef.current.pause();
            }

            const audio = new Audio(`/api/preview?voice=${encodeURIComponent(voiceName)}`);
            audioRef.current = audio;

            audio.onended = () => setPreviewingVoice(null);
            audio.onerror = () => setPreviewingVoice(null);

            await audio.play();
        } catch (error) {
            console.error('Preview failed:', error);
            setPreviewingVoice(null);
        }
    };

    const getLanguageName = (locale: string): string => {
        try {
            const displayNames = new Intl.DisplayNames(['en'], { type: 'language' });
            return displayNames.of(locale.split('-')[0]) || locale;
        } catch {
            return locale;
        }
    };

    const getRegionName = (locale: string): string => {
        const parts = locale.split('-');
        if (parts.length < 2) return '';
        try {
            const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
            return displayNames.of(parts[1]) || parts[1];
        } catch {
            return parts[1];
        }
    };

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.loading}>
                    <div className={styles.spinner}></div>
                    <span>Loading voices...</span>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <label className={styles.label}>Voice Selection</label>

            <div className={styles.filters}>
                <div className={styles.filterGroup}>
                    <select
                        className={styles.select}
                        value={languageFilter}
                        onChange={(e) => setLanguageFilter(e.target.value)}
                    >
                        <option value="">All Languages</option>
                        {languageOptions.map(([code, locale]) => (
                            <option key={code} value={code}>
                                {getLanguageName(locale)}
                            </option>
                        ))}
                    </select>
                </div>

                <div className={styles.genderToggle}>
                    {['all', 'female', 'male'].map((gender) => (
                        <button
                            key={gender}
                            type="button"
                            className={`${styles.genderButton} ${genderFilter === gender ? styles.active : ''}`}
                            onClick={() => setGenderFilter(gender)}
                        >
                            {gender === 'all' ? 'All' : gender === 'female' ? '♀ Female' : '♂ Male'}
                        </button>
                    ))}
                </div>

                <input
                    type="text"
                    className={styles.searchInput}
                    placeholder="Search voices..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>

            <div className={styles.voiceCount}>
                {filteredVoices.length} voice{filteredVoices.length !== 1 ? 's' : ''} available
            </div>

            <div className={styles.voiceList}>
                {filteredVoices.map((voice) => (
                    <div
                        key={voice.shortName}
                        className={`${styles.voiceCard} ${selectedVoice === voice.shortName ? styles.selected : ''}`}
                        onClick={() => onVoiceChange(voice.shortName)}
                    >
                        <div className={styles.voiceInfo}>
                            <span className={styles.voiceName}>{voice.friendlyName.split(' - ')[0]}</span>
                            <div className={styles.voiceMeta}>
                                <span className={styles.locale}>
                                    {getLanguageName(voice.locale)} ({getRegionName(voice.locale)})
                                </span>
                                <span className={`${styles.gender} ${styles[voice.gender.toLowerCase()]}`}>
                                    {voice.gender === 'Female' ? '♀' : '♂'} {voice.gender}
                                </span>
                            </div>
                        </div>

                        <button
                            type="button"
                            className={`${styles.previewButton} ${previewingVoice === voice.shortName ? styles.playing : ''}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                handlePreview(voice.shortName);
                            }}
                        >
                            {previewingVoice === voice.shortName ? '⏹' : '▶'}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
