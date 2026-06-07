export interface ProcessedImage {
  id: string;
  originalFile: File;
  originalBase64: string;
  processedBase64: string | null;
  name: string;
  width: number;
  height: number;
}

export interface CropSettings {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface ImageProcessingSettings {
  crop: CropSettings;
  whiteThreshold: number; // For turning background to pure white
}
