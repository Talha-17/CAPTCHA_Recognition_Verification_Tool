

const { createWorker, PSM } = require('tesseract.js');
const multer = require('multer');

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const allowedMimeTypes = [
  'image/png',
  'image/jpeg',
  'image/webp'
];

// Store uploaded images in memory instead of saving them permanently.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_SIZE,
    files: 1
  },
  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return callback(
        new Error('Only PNG, JPEG, and WebP images are supported.')
      );
    }

    callback(null, true);
  }
});

// Initialize the OCR worker only when it is first needed.
let workerPromise = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker('eng', 1, {
      langPath: __dirname,
      gzip: false
});

      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_LINE,
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
      });

      return worker;
    })().catch(error => {
      workerPromise = null;
      throw error;
    });
  }

  return workerPromise;
}

// Perform actual OCR on an uploaded image buffer.
async function recognizeImage(imageBuffer) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw new Error('A valid image buffer is required.');
  }

  const worker = await getWorker();
  const result = await worker.recognize(imageBuffer);

  return {
    text: result.data.text.trim(),
    confidence: Number(
      (result.data.confidence / 100).toFixed(4)
    ),
    method: 'Tesseract.js OCR',
    engine: 'Tesseract.js',
    language: 'English'
  };
}

module.exports = {
  upload,
  recognizeImage
};
