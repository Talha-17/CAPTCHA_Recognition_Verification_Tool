

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const TEST_DIR = path.join(__dirname, 'test-data');
const API_URL = 'http://localhost:5000/api/solver/ocr';

async function runBenchmark() {
  const files = fs.readdirSync(TEST_DIR)
    .filter(file => /^captcha-\d+\.png$/i.test(file))
    .sort();

  if (files.length === 0) {
    console.log('No benchmark images found.');
    return;
  }

  const results = [];

  console.log(`Starting OCR benchmark: ${files.length} images\n`);

  for (const file of files) {
    const expectedText = path.basename(file, '.png')
      .replace('captcha-', '');

    // Expected text is stored in the generator's known test cases.
    const expectedTexts = [
      'TEST7', 'ABC23', 'K9M4P', 'X7R2Q',
      'HELLO8', 'PYTHON5', 'N8T4W', 'CLOUD9',
      'DEVOPS6', 'AI2026', 'M7K2B', 'R4X9P',
      'CODE88', 'Z5Q3L', 'NODE24', 'V8D2F',
      'GITHUB7', 'T3P9N', 'W6Y2K', 'OCR2026'
    ];

    const index = Number(file.match(/\d+/)[0]) - 1;
    const expected = expectedTexts[index];

    const form = new FormData();
    form.append('image', fs.createReadStream(path.join(TEST_DIR, file)));
    form.append('expectedText', expected);

    try {
      const response = await axios.post(API_URL, form, {
        headers: form.getHeaders(),
        timeout: 60000
      });

      const data = response.data;

      results.push({
        file,
        expected,
        extracted: data.extractedText,
        correct: data.matches === true,
        confidence: data.confidence,
        durationMs: data.durationMs
      });

      console.log(
        `${file}: ${data.matches ? 'PASS' : 'FAIL'} | ` +
        `Expected: ${expected} | Extracted: ${data.extractedText || '(empty)'}`
      );
    } catch (error) {
      console.log(`${file}: ERROR | ${error.message}`);

      results.push({
        file,
        expected,
        extracted: '',
        correct: false,
        confidence: 0,
        durationMs: 0,
        error: error.message
      });
    }
  }

  const successful = results.filter(result => result.correct).length;
  const failed = results.length - successful;

  const confidenceValues = results
    .filter(result => !result.error)
    .map(result => result.confidence);

  const durationValues = results
    .filter(result => !result.error)
    .map(result => result.durationMs);

  const average = values => values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;

  const report = {
    totalImages: results.length,
    successful,
    failed,
    accuracyPercent: Number(
      (successful / results.length * 100).toFixed(2)
    ),
    averageConfidence: Number(average(confidenceValues).toFixed(4)),
    averageProcessingTimeMs: Number(average(durationValues).toFixed(2)),
    costUsd: 0,
    results
  };

  const reportPath = path.join(TEST_DIR, 'benchmark-report.json');

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('\n========== BENCHMARK SUMMARY ==========');
  console.log(`Total images: ${report.totalImages}`);
  console.log(`Correct: ${report.successful}`);
  console.log(`Incorrect/errors: ${report.failed}`);
  console.log(`Accuracy: ${report.accuracyPercent}%`);
  console.log(`Average confidence: ${(report.averageConfidence * 100).toFixed(2)}%`);
  console.log(`Average processing time: ${report.averageProcessingTimeMs} ms`);
  console.log(`Cost: $${report.costUsd.toFixed(4)}`);
  console.log(`\nReport saved to: ${reportPath}`);
}

runBenchmark();
