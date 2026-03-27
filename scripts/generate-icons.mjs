import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const sizes = [16, 32, 48, 128];
const projectRoot = process.cwd();
const logoSvgPath = path.join(projectRoot, 'public', 'icons', 'logo.svg');
const outDir = path.join(projectRoot, 'public', 'icons');

const run = async () => {
  const svgBuffer = await readFile(logoSvgPath);
  await mkdir(outDir, { recursive: true });

  await Promise.all(
    sizes.map(async (size) => {
      const pngBuffer = await sharp(svgBuffer)
        .resize(size, size, { fit: 'contain' })
        .png()
        .toBuffer();

      await writeFile(path.join(outDir, `icon-${size}.png`), pngBuffer);
    }),
  );
};

run().catch((error) => {
  console.error('Failed to generate icons:', error);
  process.exit(1);
});

