"use client";

import { useState } from "react";
import { ImageUploader } from "@/components/ImageUploader";
import { BatchEditor } from "@/components/BatchEditor";
import { ProcessedImage } from "@/lib/types";

export default function Home() {
  const [images, setImages] = useState<ProcessedImage[]>([]);

  return (
    <main className="min-h-screen bg-gray-950 p-4 md:p-8">
      <div className="max-w-[1600px] mx-auto space-y-8">
        <header className="mb-8">
          <h1 className="text-3xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
            Rúd Hajlítás Képfeldolgozó
          </h1>
          <p className="text-gray-400 mt-2">
            Vágd körbe a képeket, távolítsd el a hátteret, és töröld ki a kötelet pillanatok alatt a böngésződben.
          </p>
        </header>

        {images.length === 0 ? (
          <ImageUploader onImagesLoaded={setImages} />
        ) : (
          <BatchEditor images={images} />
        )}
      </div>
    </main>
  );
}
