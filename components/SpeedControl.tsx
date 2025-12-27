'use client';

import styles from './SpeedControl.module.css';

interface SpeedControlProps {
    speed: number;
    onSpeedChange: (speed: number) => void;
}

const PRESETS = [
    { label: 'Slow', value: 0.75 },
    { label: 'Normal', value: 1.0 },
    { label: 'Fast', value: 1.25 },
    { label: 'Very Fast', value: 1.5 },
];

export default function SpeedControl({ speed, onSpeedChange }: SpeedControlProps) {
    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <label className={styles.label}>Speed</label>
                <span className={styles.value}>{speed.toFixed(2)}x</span>
            </div>

            <div className={styles.sliderContainer}>
                <span className={styles.sliderLabel}>0.5x</span>
                <input
                    type="range"
                    className={styles.slider}
                    min="0.5"
                    max="2"
                    step="0.05"
                    value={speed}
                    onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
                />
                <span className={styles.sliderLabel}>2.0x</span>
            </div>

            <div className={styles.presets}>
                {PRESETS.map((preset) => (
                    <button
                        key={preset.value}
                        type="button"
                        className={`${styles.presetButton} ${Math.abs(speed - preset.value) < 0.01 ? styles.active : ''}`}
                        onClick={() => onSpeedChange(preset.value)}
                    >
                        {preset.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
