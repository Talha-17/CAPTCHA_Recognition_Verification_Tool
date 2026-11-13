
const { performance } = require('perf_hooks');
const { upload, recognizeImage } = require('./ocr');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { chromium } = require('playwright');
const { db, initializeDatabase } = require('./database');


require('dotenv').config();
const app = express();
const PORT = process.env.PORT || 5000;


app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173']
}));

app.use(express.json({ limit: '10mb' }));

let websiteRecords = [];
let processingRuns = [];

// High-resolution duration measurement.
// Uses a monotonic clock and preserves fractional milliseconds.
function getDurationMs(started) {
  return Number(
    Math.max(0, performance.now() - started).toFixed(3)
  );
}

const csvFilePath = path.join(
  __dirname,
  'USA_Ecommerce_Platforms_200_Contact_Pages.csv'
);

// Load CSV records.
const csvLoadPromise = new Promise(resolve => {
  if (!fs.existsSync(csvFilePath)) {
    console.warn('CSV not found beside server.js:', csvFilePath);
    return resolve([]);
  }

  const rows = [];

  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', row => rows.push(row))
    .on('end', () => {
      websiteRecords = rows;
      console.log(`Loaded ${rows.length} website records from CSV.`);
      resolve(rows);
    })
    .on('error', err => {
      console.error('CSV load error:', err.message);
      resolve([]);
    });
});

// Convert database records into the existing API response format.
function formatRun(row) {
  return {
    id: row.id,
    timestamp: row.timestamp,
    category: row.category,
    challengeType: row.challenge_type,
    status: row.status,
    durationMs: Number(row.duration_ms || 0),
    confidence: row.confidence ?? null,
    costUsd: Number(row.cost_usd || 0),
    safeMessage: row.safe_message || ''
  };
}

// Load the latest 500 runs from persistent storage.
function loadRecentRuns() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT *
       FROM processing_runs
       ORDER BY timestamp DESC, rowid DESC
       LIMIT 500`,
      [],
      (error, rows) => {
        if (error) {
          return reject(error);
        }

        processingRuns = rows.map(formatRun);
        console.log(`Restored ${processingRuns.length} runs from SQLite.`);
        resolve();
      }
    );
  });
}

// Save an activity record to SQLite.
function recordRun(data) {
  const run = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    category: data.category,
    challengeType: data.challengeType,
    status: data.status,
    durationMs: Number(data.durationMs || 0),
    confidence: data.confidence ?? null,
    costUsd: Number(data.costUsd || 0),
    safeMessage: data.safeMessage || ''
  };

  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO processing_runs (
        id,
        timestamp,
        category,
        challenge_type,
        status,
        duration_ms,
        confidence,
        cost_usd,
        safe_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        run.id,
        run.timestamp,
        run.category,
        run.challengeType,
        run.status,
        run.durationMs,
        run.confidence,
        run.costUsd,
        run.safeMessage
      ],
      error => {
        if (error) {
          return reject(error);
        }

        processingRuns.unshift(run);

        if (processingRuns.length > 500) {
          processingRuns.pop();
        }

        resolve(run);
      }
    );
  });
}

// Calculate metrics from ALL persistent database records.
function getMetricsSummary() {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT
        COUNT(*) AS totalRuns,

        SUM(
          CASE WHEN category = 'detection'
          THEN 1 ELSE 0 END
        ) AS detectedCount,

        SUM(
          CASE WHEN category = 'solve' AND status = 'Solved'
          THEN 1 ELSE 0 END
        ) AS solvedCount,

        SUM(
          CASE WHEN category = 'verification' AND status = 'Success'
          THEN 1 ELSE 0 END
        ) AS verifiedCount,

        SUM(
          CASE WHEN category = 'verification' AND status = 'Failed'
          THEN 1 ELSE 0 END
        ) AS failedVerifications,

        AVG(duration_ms) AS avgDurationMs,
        COALESCE(SUM(cost_usd), 0) AS totalCostUsd

       FROM processing_runs`,
      [],
      (error, row) => {
        if (error) {
          return reject(error);
        }

        const totalRuns = Number(row.totalRuns || 0);
        const totalCostUsd = Number(row.totalCostUsd || 0);

        resolve({
          detectedCount: Number(row.detectedCount || 0),
          solvedCount: Number(row.solvedCount || 0),
          verifiedCount: Number(row.verifiedCount || 0),
          failedVerifications: Number(row.failedVerifications || 0),
          totalRuns,

          // Preserve fractional milliseconds in the average.
          avgDurationMs: Number(
            Number(row.avgDurationMs || 0).toFixed(3)
          ),

          totalCostUsd: Number(totalCostUsd.toFixed(4)),

          avgCostPerChallengeUsd: totalRuns
            ? Number((totalCostUsd / totalRuns).toFixed(4))
            : 0
        });
      }
    );
  });
}

const challengeMap = {
  recaptcha: 'Google reCAPTCHA',
  'google recaptcha': 'Google reCAPTCHA',
  'invisible recaptcha': 'Invisible reCAPTCHA',
  hcaptcha: 'hCaptcha',
  turnstile: 'Cloudflare Turnstile',
  synthetic_text: 'Synthetic Text CAPTCHA'
};

// Health check.
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'running',
    message: 'CAPTCHA Tool Backend is running.'
  });
});

// Website dataset.
app.get('/api/websites', async (req, res) => {
  await csvLoadPromise;

  res.json({
    success: true,
    total: websiteRecords.length,
    records: websiteRecords
  });
});

// Challenge classification only.
app.post('/api/challenges/detect', async (req, res) => {
  const started = performance.now();

  const raw = String(req.body.challengeType || '').trim();

  const detectedType = challengeMap[raw.toLowerCase()] || null;
  const isSupported = Boolean(detectedType);

  const durationMs = getDurationMs(started);

  const message = isSupported
    ? `${detectedType} recognized. Recognition does not mean it has been solved.`
    : 'This challenge type is not supported by the current demonstration.';

  await recordRun({
    category: 'detection',
    challengeType: detectedType || raw || 'Unknown',
    status: isSupported ? 'Detected' : 'Unsupported',
    durationMs,
    confidence: isSupported ? 0.98 : 0.2,
    costUsd: 0,
    safeMessage: message
  });

  res.json({
    success: true,
    isSupported,
    detectedType: detectedType || raw || 'Unknown',
    confidence: isSupported ? 0.98 : 0.2,
    method: 'Controlled type classification',
    durationMs,
    message
  });
});

// Signature-based classification only, not actual image recognition.
app.post('/api/challenges/detect-image', async (req, res) => {
  const started = performance.now();

  const signature = String(
    req.body.imageContent || req.body.imageInputTag || ''
  ).toLowerCase();

  let type = 'unknown_custom_puzzle';

  if (signature.includes('hcaptcha')) {
    type = 'hCaptcha';
  } else if (signature.includes('turnstile')) {
    type = 'Turnstile';
  } else if (signature.includes('recaptcha')) {
    type = 'reCAPTCHA';
  } else if (signature.includes('text')) {
    type = 'synthetic_text';
  }

  const detectedType = challengeMap[type.toLowerCase()] || null;
  const isSupported = Boolean(detectedType);

  const durationMs = getDurationMs(started);

  const message = isSupported
    ? `${detectedType} signature recognized; classification only.`
    : 'No supported signature detected.';

  await recordRun({
    category: 'detection',
    challengeType: detectedType || 'Unknown',
    status: isSupported ? 'Detected' : 'Unsupported',
    durationMs,
    confidence: isSupported ? 0.95 : 0.2,
    costUsd: 0,
    safeMessage: message
  });

  res.json({
    success: true,
    isSupported,
    detectedType: detectedType || 'Unknown',
    confidence: isSupported ? 0.95 : 0.2,
    method: 'Signature classification',
    durationMs,
    message
  });
});


// Actual OCR processing for uploaded synthetic or authorized test images.
app.post(
  '/api/solver/ocr',
  (req, res, next) => {
    upload.single('image')(req, res, error => {
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.message || 'Image upload failed.'
        });
      }

      next();
    });
  },
  async (req, res) => {
    const started = performance.now();

    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Please upload an image using the image field.'
        });
      }

      const result = await recognizeImage(req.file.buffer);
      const durationMs = getDurationMs(started);

      // expectedText is optional and intended for controlled
      // synthetic-image accuracy testing only.
      const expectedText = String(
        req.body.expectedText || ''
      ).trim();

      const hasExpectedText = expectedText.length > 0;

      const matches = hasExpectedText
        ? result.text.replace(/\s/g, '').toUpperCase() ===
          expectedText.replace(/\s/g, '').toUpperCase()
        : null;

      const status = matches === true
        ? 'Solved'
        : matches === false
          ? 'Failed'
          : 'Processed';

      const message = hasExpectedText
        ? matches
          ? 'OCR output matches the expected synthetic CAPTCHA text.'
          : 'OCR completed, but the output does not match the expected text.'
        : 'OCR completed. Supply expectedText with a synthetic test image to measure accuracy.';

      await recordRun({
        category: 'solve',
        challengeType: 'Synthetic Text CAPTCHA',
        status,
        durationMs,
        confidence: result.confidence,
        costUsd: 0,
        safeMessage: message
      });

      return res.json({
        success: true,
        challengeType: 'Synthetic Text CAPTCHA',
        extractedText: result.text,
        confidence: result.confidence,
        method: result.method,
        engine: result.engine,
        durationMs,
        expectedTextProvided: hasExpectedText,
        matches,
        status,
        costUsd: 0,
        message
      });
    } catch (error) {
      console.error('OCR processing failed:', error.message);

      return res.status(500).json({
        success: false,
        message: 'OCR processing failed. Please check the image and try again.',
        durationMs: getDurationMs(started)
      });
    }
  }
);


// Synthetic benchmark only. This is NOT actual image OCR.
app.post('/api/solver/batch-synthetic', async (req, res) => {
  const started = performance.now();

  const batchSize = Math.max(
    1,
    Math.min(Number(req.body.batchSize) || 10, 50)
  );

  const pool = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const results = [];
  let correct = 0;

  for (let i = 0; i < batchSize; i++) {
    let targetText = '';

    for (let j = 0; j < 5; j++) {
      targetText += pool[
        Math.floor(Math.random() * pool.length)
      ];
    }

    const match = Math.random() < 0.9;

    const extractedText = match
      ? targetText
      : `${targetText.slice(0, 4)}X`;

    if (targetText === extractedText) {
      correct++;
    }

    results.push({
      id: i + 1,
      targetText,
      extractedText,
      success: targetText === extractedText,
      confidence: Number(
        (0.88 + Math.random() * 0.11).toFixed(2)
      )
    });
  }

  const accuracyPercentage = Number(
    (correct / batchSize * 100).toFixed(1)
  );

  const durationMs = getDurationMs(started);

  const message =
    `Synthetic benchmark completed: ${accuracyPercentage}% ` +
    `simulated match rate across ${batchSize} samples. No image was processed.`;

  await recordRun({
    category: 'solve',
    challengeType: 'Synthetic CAPTCHA benchmark',
    status: correct === batchSize ? 'Solved' : 'Partial',
    durationMs,
    confidence: accuracyPercentage / 100,
    costUsd: 0,
    safeMessage: message
  });

  res.json({
    success: true,
    batchSize,
    accuracyPercentage,
    results,
    durationMs,
    method: 'Synthetic benchmark simulation (not real OCR)',
    message
  });
});

// Demo verification only. No real provider API is contacted.
app.post('/api/verification/verify', async (req, res) => {
  const started = performance.now();

  const provider = String(
    req.body.provider || 'Google reCAPTCHA test flow'
  );

  const tokenType = String(
    req.body.tokenType || 'invalid_response'
  );

  const success = tokenType === 'passing';

  const errorCodes = success
    ? []
    : [
        tokenType === 'invalid_secret'
          ? 'invalid-input-secret'
          : tokenType === 'timeout_or_duplicate'
            ? 'timeout-or-duplicate'
            : 'invalid-input-response'
      ];

  const durationMs = getDurationMs(started);
  const status = success ? 'verified_demo' : 'failed_demo';

  const message = success
    ? `Demo success simulated for ${provider}; no provider API was contacted.`
    : `Demo failure simulated: ${errorCodes[0]}; no provider API was contacted.`;

  await recordRun({
    category: 'verification',
    challengeType: `${provider} (${tokenType})`,
    status: success ? 'Success' : 'Failed',
    durationMs,
    costUsd: 0,
    safeMessage: message
  });

  res.json({
    success,
    provider,
    status,
    errorCodes,
    durationMs,
    message,
    simulated: true,
    timestamp: new Date().toISOString()
  });
});


// Real Google reCAPTCHA v2 server-side verification.
app.post('/api/verification/google', async (req, res) => {
  const started = performance.now();

  try {
    const secret = process.env.RECAPTCHA_SECRET_KEY;
    const token = String(req.body.token || '').trim();

    if (!secret) {
      return res.status(500).json({
        success: false,
        provider: 'Google reCAPTCHA v2',
        status: 'configuration_error',
        message: 'Google verification is not configured on the server.'
      });
    }

    if (!token) {
      return res.status(400).json({
        success: false,
        provider: 'Google reCAPTCHA v2',
        status: 'missing_token',
        errorCodes: ['missing-input-response'],
        message: 'A reCAPTCHA response token is required.'
      });
    }

    const formData = new URLSearchParams({
      secret,
      response: token
    });

    const googleResponse = await fetch(
      'https://www.google.com/recaptcha/api/siteverify',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData,
        signal: AbortSignal.timeout(8000)
      }
    );

    if (!googleResponse.ok) {
      throw new Error('Google verification service returned an HTTP error.');
    }

    const verification = await googleResponse.json();

    const success = verification.success === true;
    const errorCodes = verification['error-codes'] || [];
    const durationMs = getDurationMs(started);

    const status = success ? 'verified' : 'rejected';

    const message = success
      ? 'Google successfully verified the reCAPTCHA response token.'
      : 'Google rejected the reCAPTCHA response token.';

    await recordRun({
      category: 'verification',
      challengeType: 'Google reCAPTCHA v2',
      status: success ? 'Success' : 'Failed',
      durationMs,
      costUsd: 0,
      safeMessage: message
    });

    return res.status(200).json({
      success,
      provider: 'Google reCAPTCHA v2',
      status,
      errorCodes,
      hostname: verification.hostname || null,
      challengeTimestamp: verification.challenge_ts || null,
      durationMs,
      simulated: false,
      message,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const durationMs = getDurationMs(started);

    console.error('Google verification request failed:', error.message);

    return res.status(502).json({
      success: false,
      provider: 'Google reCAPTCHA v2',
      status: 'provider_error',
      errorCodes: [],
      durationMs,
      message: 'Unable to contact Google verification service. Please try again.'
    });
  }
});


// Approved inspection hosts only.
// Keep this endpoint restricted to authorized test environments.
const ALLOWED_INSPECTION_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  'www.google.com'
]);

app.post('/api/browser/inspect', async (req, res) => {
  const started = performance.now();

  const targetUrl = String(req.body.targetUrl || '').trim();

  let parsed;

  try {
    parsed = new URL(targetUrl);
  } catch {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid URL.'
    });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({
      success: false,
      message: 'Only HTTP and HTTPS URLs are allowed.'
    });
  }

  if (!ALLOWED_INSPECTION_HOSTS.has(parsed.hostname)) {
    return res.status(403).json({
      success: false,
      message:
        `Host ${parsed.hostname} is not allowlisted. ` +
        'Use an approved test page or add an authorized host to ALLOWED_INSPECTION_HOSTS.'
    });
  }

  let browser;

  try {
    browser = await chromium.launch({ headless: true });

    const page = await browser.newPage();

    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });

    const finalHost = new URL(page.url()).hostname;

    if (!ALLOWED_INSPECTION_HOSTS.has(finalHost)) {
      throw new Error(
        'Page redirected to a host that is not allowlisted.'
      );
    }

    const html = (await page.content()).toLowerCase();

    let detectedProvider = 'No known CAPTCHA provider detected';

    if (html.includes('hcaptcha')) {
      detectedProvider = 'hCaptcha';
    } else if (
      html.includes('challenges.cloudflare.com') ||
      html.includes('cf-turnstile') ||
      html.includes('turnstile')
    ) {
      detectedProvider = 'Cloudflare Turnstile';
    } else if (
      html.includes('google.com/recaptcha') ||
      html.includes('g-recaptcha') ||
      html.includes('recaptcha')
    ) {
      detectedProvider = 'Google reCAPTCHA';
    }

    const durationMs = getDurationMs(started);

    const message =
      detectedProvider === 'No known CAPTCHA provider detected'
        ? 'Page inspected; no known provider marker was found.'
        : `Detected ${detectedProvider}. Inspection only; no CAPTCHA was solved and no form was submitted.`;

    await recordRun({
      category: 'detection',
      challengeType: `Browser inspection (${detectedProvider})`,
      status: detectedProvider.startsWith('No known')
        ? 'Unsupported'
        : 'Detected',
      durationMs,
      costUsd: 0,
      safeMessage: message
    });

    res.json({
      success: true,
      url: targetUrl,
      detectedProvider,
      durationMs,
      message
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      url: targetUrl,
      durationMs: getDurationMs(started),
      message:
        err.message ||
        'Browser inspection failed or timed out.'
    });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
});

// Return persistent metrics and the latest 500 activity records.
app.get('/api/runs', async (req, res) => {
  try {
    const summary = await getMetricsSummary();

    res.json({
      success: true,
      summary,
      runs: processingRuns
    });
  } catch (error) {
    console.error('Failed to retrieve processing history:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to retrieve processing history.'
    });
  }
});

// Initialize the database and restore history before accepting requests.
async function startServer() {
  try {
    await initializeDatabase();
    await loadRecentRuns();
    await csvLoadPromise;

    app.listen(PORT, () => {
      console.log(
        `CAPTCHA Tool Backend running at http://localhost:${PORT}`
      );
    });
  } catch (error) {
    console.error('Backend startup failed:', error);
    process.exit(1);
  }
}

startServer();
