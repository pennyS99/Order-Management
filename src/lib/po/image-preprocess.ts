import sharp from "sharp";

const MIN_WIDTH_FOR_UPSCALE = 1200;
const UPSCALE_FACTOR = 2;

export interface PreprocessOptions {
  /** Rotation angle in degrees (from OSD). 0 = no rotation. */
  rotate?: number;
}

/**
 * Preprocess low-quality scanned document images for OCR.
 * Pipeline: denoise → deskew (rotate) → upscale → sharpen
 * Matches workflow: OpenCV denoise/deskew/upscale equivalent using sharp.
 */
export async function preprocessForOcr(
  imageBuffer: Buffer,
  options: PreprocessOptions = {}
): Promise<Buffer> {
  try {
    let pipeline = sharp(imageBuffer);
    const meta = await pipeline.metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;

    // 1. Denoise: median filter to reduce speckle/noise (OpenCV-style)
    pipeline = pipeline.median(3);

    // 2. Deskew: rotate if OSD detected non-upright orientation
    const rotate = options.rotate ?? 0;
    if (rotate !== 0) {
      pipeline = pipeline.rotate(rotate);
    }

    // 3. Upscale: small images hurt OCR; scale up for better recognition
    const needsUpscale = width > 0 && width < MIN_WIDTH_FOR_UPSCALE;
    if (needsUpscale) {
      const newWidth = Math.min(width * UPSCALE_FACTOR, 2400);
      pipeline = pipeline.resize(newWidth, undefined, {
        fit: "inside",
        kernel: sharp.kernel.lanczos3,
      });
    }

    // 4. Sharpen + contrast
    pipeline = pipeline
      .normalize()
      .sharpen({ sigma: 1.5, m1: 1.0, m2: 0.5 })
      .modulate({ brightness: 1.02, saturation: 0 })
      .png({ quality: 95 });

    return pipeline.toBuffer();
  } catch (err) {
    return imageBuffer;
  }
}
