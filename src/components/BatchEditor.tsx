/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { ProcessedImage, ImageProcessingSettings } from "@/lib/types";

interface BatchEditorProps {
  images: ProcessedImage[];
}

export function BatchEditor({ images: initialImages }: BatchEditorProps) {
  const [images, setImages] = useState<ProcessedImage[]>(initialImages);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // Settings applied to ALL images
  const [settings, setSettings] = useState<ImageProcessingSettings>({
    crop: { top: 0, bottom: 0, left: 0, right: 0 },
    whiteThreshold: 200,
  });

  const [isErasing, setIsErasing] = useState(false);
  const [eraserSize, setEraserSize] = useState(20);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Image objects cache to avoid reloading base64
  const imageElementsRef = useRef<{ [key: string]: HTMLImageElement }>({});

  useEffect(() => {
    // Preload images
    images.forEach(img => {
      if (!imageElementsRef.current[img.id]) {
        const image = new Image();
        image.src = img.processedBase64 || img.originalBase64;
        imageElementsRef.current[img.id] = image;
      }
    });
  }, [images]);

  const currentImage = images[currentIndex];

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!canvas || !overlayCanvas || !currentImage) return;
    
    const ctx = canvas.getContext("2d");
    const overlayCtx = overlayCanvas.getContext("2d");
    if (!ctx || !overlayCtx) return;

    const img = imageElementsRef.current[currentImage.id];
    if (!img || !img.complete) {
        img.onload = () => drawCanvas();
        return;
    }

    // Eredeti méret megtartása a szerkesztőben
    canvas.width = img.width;
    canvas.height = img.height;
    overlayCanvas.width = img.width;
    overlayCanvas.height = img.height;

    // Kép kirajzolása teljesen
    ctx.drawImage(img, 0, 0, img.width, img.height);

    const crop = settings.crop;
    const cw = Math.max(1, img.width - crop.left - crop.right);
    const ch = Math.max(1, img.height - crop.top - crop.bottom);

    // Küszöbérték alkalmazása csak a kivágott területen
    if (cw > 0 && ch > 0 && crop.left >= 0 && crop.top >= 0) {
      const imageData = ctx.getImageData(crop.left, crop.top, cw, ch);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        if (brightness > settings.whiteThreshold) {
          data[i] = 255;
          data[i + 1] = 255;
          data[i + 2] = 255;
        }
      }
      ctx.putImageData(imageData, crop.left, crop.top);
    }

    // --- OVERLAY RAJZOLÁSA ---
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    
    // Sötétítés a levágott részekre
    overlayCtx.fillStyle = "rgba(0, 0, 0, 0.7)";
    overlayCtx.fillRect(0, 0, img.width, crop.top); // Fent
    overlayCtx.fillRect(0, img.height - crop.bottom, img.width, crop.bottom); // Lent
    overlayCtx.fillRect(0, crop.top, crop.left, img.height - crop.top - crop.bottom); // Bal
    overlayCtx.fillRect(img.width - crop.right, crop.top, crop.right, img.height - crop.top - crop.bottom); // Jobb

    // Kék keret a vágás mentén
    overlayCtx.strokeStyle = "#3b82f6";
    overlayCtx.lineWidth = Math.max(2, img.width / 400); // Dinamikus vonalvastagság
    overlayCtx.strokeRect(crop.left, crop.top, cw, ch);
  }, [currentImage, settings]);

  useEffect(() => {
    const timer = setTimeout(() => {
      drawCanvas();
    }, 50);
    return () => clearTimeout(timer);
  }, [currentIndex, settings, currentImage, drawCanvas]);

  // Eraser functionality
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsErasing(true);
    eraseAt(e);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isErasing) return;
    eraseAt(e);
  };

  const handleMouseUp = () => {
    setIsErasing(false);
    saveCurrentCanvasState();
  };

  const eraseAt = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(x, y, eraserSize, 0, Math.PI * 2);
    ctx.fill();
  };

  const saveCurrentCanvasState = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const type = currentImage.originalFile.type || "image/jpeg";
    const newBase64 = canvas.toDataURL(type, 1.0);
    
    // Update the image cache and state
    const img = new Image();
    img.src = newBase64;
    img.onload = () => {
        imageElementsRef.current[currentImage.id] = img;
        const newImages = [...images];
        newImages[currentIndex] = { ...currentImage, processedBase64: newBase64 };
        setImages(newImages);
    }
  };

  const handleDownloadAll = async () => {
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      
      const finalBase64 = await new Promise<string>((resolve) => {
        const imageObj = new Image();
        imageObj.onload = () => {
            // Ha a kép már meg van vágva (mert kisebb, mint az eredeti), egyből letölthetjük
            const isAlreadyCropped = imageObj.width < img.width;
            if (isAlreadyCropped) {
                resolve(img.processedBase64!);
                return;
            }

            // Ha még nincs megvágva (teljes méretű radírozott, vagy eredeti), akkor vágjuk és fehéritjük menet közben
            const canvas = document.createElement('canvas');
            const crop = settings.crop;
            const cw = Math.max(1, imageObj.width - crop.left - crop.right);
            const ch = Math.max(1, imageObj.height - crop.top - crop.bottom);
            
            canvas.width = cw;
            canvas.height = ch;
            const ctx = canvas.getContext('2d');
            if(ctx) {
                ctx.drawImage(imageObj, crop.left, crop.top, cw, ch, 0, 0, cw, ch);
                const imageData = ctx.getImageData(0, 0, cw, ch);
                const data = imageData.data;
                for (let j = 0; j < data.length; j += 4) {
                    const brightness = (data[j] * 299 + data[j + 1] * 587 + data[j + 2] * 114) / 1000;
                    if (brightness > settings.whiteThreshold) {
                        data[j] = 255;
                        data[j + 1] = 255;
                        data[j + 2] = 255;
                    }
                }
                ctx.putImageData(imageData, 0, 0);
                const type = img.originalFile.type || "image/jpeg";
                resolve(canvas.toDataURL(type, 1.0));
            } else {
                resolve(imageObj.src);
            }
        };
        // A radírozott verziót használjuk ha van, különben az eredetit
        imageObj.src = img.processedBase64 || img.originalBase64;
      });
      
      const link = document.createElement("a");
      link.href = finalBase64;
      link.download = `processed_${img.name}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Késleltetés a böngésző fagyásának elkerülésére
      await new Promise(r => setTimeout(r, 100));
    }
  };

  const handleProcessAll = () => {
    // Process all images
    const newImages = [...images];
    let count = 0;
    
    images.forEach((img, idx) => {
        const imageObj = new Image();
        imageObj.onload = () => {
            const isFullSizeProcessed = img.processedBase64 && imageObj.width === img.width && imageObj.height === img.height;
            
            const finalSourceImg = new Image();
            finalSourceImg.onload = () => {
                const canvas = document.createElement('canvas');
                const crop = settings.crop;
                const cw = Math.max(1, finalSourceImg.width - crop.left - crop.right);
                const ch = Math.max(1, finalSourceImg.height - crop.top - crop.bottom);
                
                canvas.width = cw;
                canvas.height = ch;
                const ctx = canvas.getContext('2d');
                if(ctx) {
                    ctx.drawImage(finalSourceImg, crop.left, crop.top, cw, ch, 0, 0, cw, ch);
                    const imageData = ctx.getImageData(0, 0, cw, ch);
                    const data = imageData.data;
                    for (let i = 0; i < data.length; i += 4) {
                        const brightness = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
                        if (brightness > settings.whiteThreshold) {
                            data[i] = 255;
                            data[i + 1] = 255;
                            data[i + 2] = 255;
                        }
                    }
                    ctx.putImageData(imageData, 0, 0);
                    const type = img.originalFile.type || "image/jpeg";
                    newImages[idx].processedBase64 = canvas.toDataURL(type, 1.0);
                }
                
                count++;
                if(count === images.length) {
                    setImages(newImages);
                    alert("Minden kép feldolgozva a globális beállításokkal!");
                }
            };
            // Ha van teljes méretű feldolgozott kép (radírozás), akkor azt használjuk forrásként, hogy ne vesszen el!
            finalSourceImg.src = isFullSizeProcessed ? img.processedBase64! : img.originalBase64;
        };
        // Csak a dimenziók ellenőrzéséhez töltjük be először
        imageObj.src = img.processedBase64 || img.originalBase64;
    });
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 w-full max-w-[1600px] mx-auto text-gray-200">
      {/* Sidebar Controls */}
      <div className="w-full lg:w-80 bg-gray-800 p-6 rounded-xl flex flex-col gap-6 shrink-0 h-fit">
        <div>
          <h3 className="text-xl font-bold text-white mb-4">Beállítások</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Vágás Fent (px): {settings.crop.top}</label>
              <input type="range" min="0" max={Math.max(0, currentImage.height - settings.crop.bottom - 10)} value={settings.crop.top} onChange={(e) => setSettings({...settings, crop: {...settings.crop, top: parseInt(e.target.value)}})} className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Vágás Lent (px): {settings.crop.bottom}</label>
              <input type="range" min="0" max={Math.max(0, currentImage.height - settings.crop.top - 10)} value={settings.crop.bottom} onChange={(e) => setSettings({...settings, crop: {...settings.crop, bottom: parseInt(e.target.value)}})} className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Vágás Balról (px): {settings.crop.left}</label>
              <input type="range" min="0" max={Math.max(0, currentImage.width - settings.crop.right - 10)} value={settings.crop.left} onChange={(e) => setSettings({...settings, crop: {...settings.crop, left: parseInt(e.target.value)}})} className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Vágás Jobbról (px): {settings.crop.right}</label>
              <input type="range" min="0" max={Math.max(0, currentImage.width - settings.crop.left - 10)} value={settings.crop.right} onChange={(e) => setSettings({...settings, crop: {...settings.crop, right: parseInt(e.target.value)}})} className="w-full" />
            </div>
            
            <div className="pt-4 border-t border-gray-700">
              <label className="block text-sm font-medium text-gray-400 mb-1">Fehérségi Küszöb (0-255)</label>
              <input type="range" min="0" max="255" value={settings.whiteThreshold} onChange={(e) => setSettings({...settings, whiteThreshold: parseInt(e.target.value)})} className="w-full" />
              <p className="text-xs text-gray-500 mt-1">Ettől világosabb pixelek tisztán fehérek lesznek.</p>
            </div>
            
            <div className="pt-4 border-t border-gray-700">
              <label className="block text-sm font-medium text-gray-400 mb-1">Radír méret (px)</label>
              <input type="range" min="5" max="100" value={eraserSize} onChange={(e) => setEraserSize(parseInt(e.target.value))} className="w-full" />
              <p className="text-xs text-gray-500 mt-1">Használd a képen a kötél és súly törlésére.</p>
            </div>
          </div>
        </div>
        
        <div className="flex flex-col gap-3 pt-4 border-t border-gray-700">
          <button onClick={handleProcessAll} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded transition-colors">
            Feldolgozás Minden Képre
          </button>
          <button onClick={handleDownloadAll} className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 rounded transition-colors">
            Összes Letöltése
          </button>
        </div>
      </div>

      {/* Main View */}
      <div className="flex-1 flex flex-col gap-4">
        {/* Thumbnails */}
        <div className="flex gap-2 overflow-x-auto p-2 bg-gray-800 rounded-xl h-24">
          {images.map((img, idx) => (
            <button 
              key={img.id}
              onClick={() => setCurrentIndex(idx)}
              className={`relative h-full shrink-0 border-2 rounded overflow-hidden transition-colors ${idx === currentIndex ? 'border-blue-500' : 'border-transparent hover:border-gray-500'}`}
            >
              <img src={img.processedBase64 || img.originalBase64} alt={img.name} className="h-full object-cover w-16" />
              <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-[10px] text-center text-white">{idx + 1}</span>
            </button>
          ))}
        </div>
        
        {/* Canvas Editor */}
        <div className="flex-1 bg-gray-800 rounded-xl p-4 flex flex-col overflow-hidden">
            <h2 className="text-lg font-semibold mb-2">Szerkesztő: {currentImage.name}</h2>
            <div className="flex-1 overflow-hidden bg-gray-900 rounded border border-gray-700 relative" ref={containerRef}>
              <canvas
                ref={canvasRef}
                className="max-w-full max-h-full object-contain cursor-crosshair shadow-lg bg-white absolute inset-0 m-auto"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              />
              <canvas
                ref={overlayCanvasRef}
                className="max-w-full max-h-full object-contain pointer-events-none absolute inset-0 m-auto"
              />
            </div>
            <p className="text-sm text-gray-400 mt-2 text-center">Húzd az egeret a vásznon a kötél/súly kiradírozásához (fehérre festés).</p>
        </div>
      </div>
    </div>
  );
}
