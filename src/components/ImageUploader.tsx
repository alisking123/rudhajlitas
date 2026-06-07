"use client";

import React, { useCallback } from "react";
import { ProcessedImage } from "@/lib/types";

interface ImageUploaderProps {
  onImagesLoaded: (images: ProcessedImage[]) => void;
}

export function ImageUploader({ onImagesLoaded }: ImageUploaderProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [loadingProgress, setLoadingProgress] = React.useState({ current: 0, total: 0 });

  const processFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    setIsLoading(true);
    setLoadingProgress({ current: 0, total: files.length });

    const loadedImages: ProcessedImage[] = [];

    // Szorosan egymás után (szekvenciálisan) dolgozzuk fel, hogy ne fogyjon el a memória
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = base64;
        });

        let finalBase64 = base64;
        let finalWidth = img.width;
        let finalHeight = img.height;

        const MAX_DIM = 1920;
        if (img.width > MAX_DIM || img.height > MAX_DIM) {
          const ratio = Math.min(MAX_DIM / img.width, MAX_DIM / img.height);
          finalWidth = Math.round(img.width * ratio);
          finalHeight = Math.round(img.height * ratio);

          const canvas = document.createElement("canvas");
          canvas.width = finalWidth;
          canvas.height = finalHeight;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0, finalWidth, finalHeight);
            // Kisebb fájlméret és gyorsabb feldolgozás érdekében WEBP vagy PNG, 
            // a WEBP sokkal gyorsabb a toDataURL-nél, de a PNG a biztonságos a transzparenciához
            finalBase64 = canvas.toDataURL("image/png");
          }
        }

        loadedImages.push({
          id: Math.random().toString(36).substring(7),
          originalFile: file,
          originalBase64: finalBase64,
          processedBase64: null,
          name: file.name,
          width: finalWidth,
          height: finalHeight,
        });

        setLoadingProgress({ current: i + 1, total: files.length });
      } catch (err) {
        console.error("Hiba a kép betöltésekor:", file.name, err);
      }
    }

    setIsLoading(false);
    onImagesLoaded(loadedImages);
  }, [onImagesLoaded]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      processFiles(files);
    },
    [processFiles]
  );

  const [isDragging, setIsDragging] = React.useState(false);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []).filter(file => file.type.startsWith('image/'));
    processFiles(files);
  };

  return (
    <div 
      className={`w-full p-16 border-4 border-dashed rounded-xl text-center flex flex-col items-center justify-center transition-all ${isDragging ? 'border-blue-500 bg-gray-700' : 'border-gray-600 bg-gray-800 hover:border-blue-400'}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <h2 className="text-2xl font-bold text-white mb-4">Képek feltöltése (Drag & Drop)</h2>
      
      {isLoading ? (
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-blue-400 font-medium text-lg mb-2">Képek feldolgozása...</p>
          <p className="text-gray-400">{loadingProgress.current} / {loadingProgress.total} kép betöltve</p>
        </div>
      ) : (
        <>
          <p className="text-gray-400 mb-6">Húzd be ide a képeket, vagy kattints a gombra a tallózáshoz.</p>
          
          <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors inline-block">
            <span>Fájlok kiválasztása</span>
            <input
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
              disabled={isLoading}
            />
          </label>
        </>
      )}
    </div>
  );
}
