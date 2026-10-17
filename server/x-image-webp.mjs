// Lazy Node-only encoder: workers without native sharp keep serving the original.
// Never resize: the signed source explicitly requests X's original pixel size.
export async function encodeOriginalWebp(image) {
  const { default: sharp } = await import("sharp");
  const pipeline = sharp(image, { limitInputPixels: 40_000_000 });
  const metadata = await pipeline.metadata();
  if (metadata.pages > 1) return null;
  return pipeline
    .autoOrient()
    .keepIccProfile()
    .webp({ quality: 90, effort: 4, smartSubsample: true })
    .timeout({ seconds: 8 })
    .toBuffer();
}
