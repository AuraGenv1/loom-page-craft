import type { PixelCrop } from "react-image-crop";

const TO_RADIANS = Math.PI / 180;

type CropToJpegOptions = {
  scale?: number;
  rotate?: number;
  quality?: number;
};

/**
 * Crops the image to `crop` while honoring the UI `scale` (zoom) and optional rotation.
 * Returns a JPEG blob suitable for uploading.
 */
export async function cropImageToJpegBlob(
  image: HTMLImageElement,
  crop: PixelCrop,
  options: CropToJpegOptions = {}
): Promise<Blob> {
  const { scale = 1, rotate = 0, quality = 0.92 } = options;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2d context");

  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  // Keep output aligned to the source image's natural resolution.
  // (Using devicePixelRatio would upscale beyond natural size.)
  const pixelRatio = 1;

  canvas.width = Math.floor(crop.width * scaleX * pixelRatio);
  canvas.height = Math.floor(crop.height * scaleY * pixelRatio);

  ctx.scale(pixelRatio, pixelRatio);
  ctx.imageSmoothingQuality = "high";

  // IMPORTANT: JPEG has no alpha channel.
  // If any part of the canvas is left transparent (e.g., user zooms out), it will export as black.
  // Fill with white to avoid black bars.
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  const cropX = crop.x * scaleX;
  const cropY = crop.y * scaleY;
  const rotateRads = rotate * TO_RADIANS;
  const centerX = image.naturalWidth / 2;
  const centerY = image.naturalHeight / 2;

  ctx.save();
  // 5) Move the crop origin to the canvas origin (0,0)
  ctx.translate(-cropX, -cropY);
  // 4) Move the origin to the center of the original position
  ctx.translate(centerX, centerY);
  // 3) Rotate around the origin
  ctx.rotate(rotateRads);
  // 2) Scale the image (zoom)
  ctx.scale(scale, scale);
  // 1) Move the center of the image to the origin (0,0)
  ctx.translate(-centerX, -centerY);

  ctx.drawImage(
    image,
    0,
    0,
    image.naturalWidth,
    image.naturalHeight,
    0,
    0,
    image.naturalWidth,
    image.naturalHeight
  );

  ctx.restore();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to create JPEG blob"))),
      "image/jpeg",
      quality
    );
  });

  return blob;
}
