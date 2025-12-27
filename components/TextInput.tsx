'use client';

import { useState, useRef, useCallback } from 'react';
import styles from './TextInput.module.css';

interface TextInputProps {
    value: string;
    onChange: (value: string) => void;
    maxLength?: number;
}

export default function TextInput({ value, onChange, maxLength = 10000 }: TextInputProps) {
    const [isDragOver, setIsDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileRead = useCallback((file: File) => {
        if (file.type !== 'text/plain' && !file.name.endsWith('.txt')) {
            alert('Please upload a .txt file');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            onChange(text.slice(0, maxLength));
        };
        reader.readAsText(file);
    }, [onChange, maxLength]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);

        const file = e.dataTransfer.files[0];
        if (file) {
            handleFileRead(file);
        }
    }, [handleFileRead]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback(() => {
        setIsDragOver(false);
    }, []);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            handleFileRead(file);
        }
    }, [handleFileRead]);

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <label className={styles.label}>Text to Convert</label>
                <span className={styles.charCount}>
                    {value.length.toLocaleString()} / {maxLength.toLocaleString()}
                </span>
            </div>

            <div
                className={`${styles.dropZone} ${isDragOver ? styles.dragOver : ''}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
            >
                <textarea
                    className={styles.textarea}
                    value={value}
                    onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
                    placeholder="Enter your text here or drag & drop a .txt file..."
                    rows={8}
                />

                <div className={styles.uploadOverlay}>
                    <div className={styles.uploadIcon}>📄</div>
                    <p>Drop your .txt file here</p>
                </div>
            </div>

            <div className={styles.actions}>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,text/plain"
                    onChange={handleFileChange}
                    className={styles.fileInput}
                />
                <button
                    type="button"
                    className={styles.uploadButton}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <span className={styles.uploadButtonIcon}>📁</span>
                    Upload .txt file
                </button>

                {value && (
                    <button
                        type="button"
                        className={styles.clearButton}
                        onClick={() => onChange('')}
                    >
                        Clear
                    </button>
                )}
            </div>
        </div>
    );
}
