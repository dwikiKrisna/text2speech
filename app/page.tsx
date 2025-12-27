'use client';

import { useState } from 'react';
import TextInput from '@/components/TextInput';
import VoiceSelector from '@/components/VoiceSelector';
import SpeedControl from '@/components/SpeedControl';
import AudioOutput from '@/components/AudioOutput';
import styles from './page.module.css';

export default function Home() {
  const [text, setText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('');
  const [speed, setSpeed] = useState(1.0);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.logo}>
            <span className={styles.logoIcon}>🔊</span>
            <h1 className={styles.title}>Text to Speech</h1>
          </div>
          <p className={styles.subtitle}>
            Convert text to natural-sounding speech using AI voices
          </p>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.container}>
          <section className={styles.section}>
            <TextInput value={text} onChange={setText} />
          </section>

          <div className={styles.columns}>
            <section className={styles.section}>
              <VoiceSelector
                selectedVoice={selectedVoice}
                onVoiceChange={setSelectedVoice}
              />
            </section>

            <section className={styles.section}>
              <SpeedControl speed={speed} onSpeedChange={setSpeed} />
            </section>
          </div>

          <section className={styles.section}>
            <AudioOutput text={text} voice={selectedVoice} speed={speed} />
          </section>
        </div>
      </main>

      <footer className={styles.footer}>
        <p>
          Powered by{' '}
          <a
            href="https://github.com/rany2/edge-tts"
            target="_blank"
            rel="noopener noreferrer"
          >
            Edge TTS
          </a>
          {' '}• No data stored on server
        </p>
      </footer>
    </div>
  );
}
