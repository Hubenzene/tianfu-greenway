// 前端图片压缩：长边 1600px、JPEG 0.82，降低局域网弱网下的上传耗时
import { IMAGE_MAX_EDGE, IMAGE_QUALITY } from '../config.js';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片读取失败，请换一张图片'));
    };
    image.src = url;
  });
}

export async function compressImage(file, { maxEdge = IMAGE_MAX_EDGE, quality = IMAGE_QUALITY } = {}) {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error('仅支持 JPG / PNG / WebP 图片');
  }

  let source;
  let width;
  let height;
  let release = null;
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' });
    width = source.width;
    height = source.height;
    release = () => source.close?.();
  } catch {
    source = await loadImage(file);
    width = source.naturalWidth || source.width;
    height = source.naturalHeight || source.height;
  }

  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器不支持图片处理');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.drawImage(source, 0, 0, targetWidth, targetHeight);
  if (release) release();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('图片压缩失败，请换一张图片');

  const baseName = (file.name || 'photo').replace(/\.[^.]+$/, '');
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
}
