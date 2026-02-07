import React, { useState, useRef, useCallback } from 'react';
import { Upload, X, Image as ImageIcon } from 'lucide-react';

export default function ImageUpload({ onImageSelect, currentImage, accept = "image/*", maxSizeKB = 500 }) {
    const [preview, setPreview] = useState(currentImage || null);
    const [dragActive, setDragActive] = useState(false);
    const [error, setError] = useState('');
    const inputRef = useRef(null);

    const compressImage = async (file) => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new window.Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    // Max dimensions
                    const MAX_SIZE = 800;
                    if (width > height && width > MAX_SIZE) {
                        height *= MAX_SIZE / width;
                        width = MAX_SIZE;
                    } else if (height > MAX_SIZE) {
                        width *= MAX_SIZE / height;
                        height = MAX_SIZE;
                    }

                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    // Compress quality - start at 0.9 and reduce if needed
                    let quality = 0.9;
                    let dataUrl = canvas.toDataURL('image/jpeg', quality);

                    // Keep reducing quality until under max size
                    while (dataUrl.length > maxSizeKB * 1024 && quality > 0.1) {
                        quality -= 0.1;
                        dataUrl = canvas.toDataURL('image/jpeg', quality);
                    }

                    resolve(dataUrl);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    };

    const handleFile = useCallback(async (file) => {
        setError('');

        if (!file.type.startsWith('image/')) {
            setError('Please select an image file');
            return;
        }

        try {
            const compressed = await compressImage(file);
            setPreview(compressed);
            onImageSelect(compressed);
        } catch (err) {
            setError('Failed to process image');
        }
    }, [onImageSelect, maxSizeKB]);

    const handleDrag = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    }, []);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    }, [handleFile]);

    const handleChange = useCallback((e) => {
        if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
        }
    }, [handleFile]);

    const handleRemove = () => {
        setPreview(null);
        onImageSelect(null);
        if (inputRef.current) {
            inputRef.current.value = '';
        }
    };

    return (
        <div className="w-full">
            {preview ? (
                <div className="relative inline-block">
                    <img
                        src={preview}
                        alt="Preview"
                        className="max-h-48 rounded-lg border border-zinc-200 dark:border-zinc-700 object-cover"
                    />
                    <button
                        type="button"
                        onClick={handleRemove}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center hover:bg-rose-600 transition-colors"
                    >
                        <X size={14} />
                    </button>
                </div>
            ) : (
                <div
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => inputRef.current?.click()}
                    className={`
            border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
            ${dragActive
                            ? 'border-primary bg-primary/5'
                            : 'border-zinc-300 dark:border-zinc-700 hover:border-primary hover:bg-zinc-50 dark:hover:bg-zinc-800'
                        }
          `}
                >
                    <div className="flex flex-col items-center gap-2">
                        {dragActive ? (
                            <Upload size={32} className="text-primary" />
                        ) : (
                            <ImageIcon size={32} className="text-zinc-400" />
                        )}
                        <p className="text-sm text-zinc-500">
                            {dragActive ? 'Drop image here' : 'Drag & drop or click to upload'}
                        </p>
                        <p className="text-xs text-zinc-400">Max {maxSizeKB}KB after compression</p>
                    </div>
                </div>
            )}

            <input
                ref={inputRef}
                type="file"
                accept={accept}
                onChange={handleChange}
                className="hidden"
            />

            {error && (
                <p className="mt-2 text-sm text-rose-500">{error}</p>
            )}
        </div>
    );
}
