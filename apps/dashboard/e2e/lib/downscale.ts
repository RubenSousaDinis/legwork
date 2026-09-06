import type { BrowserContext } from '@playwright/test';

/**
 * The 1280x720 delivery frame, made by resampling the 1920x1080 shot.
 *
 * It has to be the *same frame*, scaled. Taking a second screenshot at a smaller
 * viewport, or at `deviceScaleFactor: 2/3`, re-lays out the text: line breaks move,
 * hinting changes, and the PNG T-47 reads at arm's length is no longer the one the
 * floors were measured in. So the shot is taken once and downscaled here.
 *
 * The resampler is the browser already running the test — a canvas with
 * `imageSmoothingQuality = 'high'`. No image library, no new dependency.
 */
export async function downscalePng(
  context: BrowserContext,
  png: Buffer,
  w = 1280,
  h = 720,
): Promise<Buffer> {
  const page = await context.newPage();
  try {
    await page.goto('about:blank');
    const source = `data:image/png;base64,${png.toString('base64')}`;
    const dataUrl = await page.evaluate(
      async ({ source, w, h }) => {
        const image = new Image();
        image.src = source;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no 2d canvas context in the downscale page');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(image, 0, 0, w, h);
        return canvas.toDataURL('image/png');
      },
      { source, w, h },
    );
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    return Buffer.from(base64, 'base64');
  } finally {
    await page.close();
  }
}
