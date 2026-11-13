# CAPTCHA Recognition & Verification Tool

A full-stack CAPTCHA recognition, verification, and analytics platform developed for technical evaluation. The application combines image-based OCR, CAPTCHA detection, Google reCAPTCHA v2 test-token verification, automated browser inspection, and performance reporting.

## 🚀 Key Features

1. CSV Data Ingestion: Parses a dataset containing 200 U.S. e-commerce contact-page records.
2. CAPTCHA Detection Engine: Rules-based identification of supported CAPTCHA providers, including reCAPTCHA, hCaptcha, and Cloudflare Turnstile.
3. Image Recognition & OCR: Uses Tesseract.js 7.0.0 to extract text from uploaded images, with confidence scoring and processing-time measurement.
4. Google reCAPTCHA v2 Verification: Performs server-side token verification through Google's official siteverify API using test credentials.
5. Playwright Browser Inspection: Uses Playwright for automated browser-based CAPTCHA widget inspection.
6. Analytics Dashboard: Displays processing history, success and failure counts, average processing time, confidence scores, and estimated costs.
7. Synthetic OCR Benchmarking Includes a 20-image test dataset for measuring OCR accuracy.

## 🛠️ Technology Stack

| Component | Technologies |
|---|---|
| Frontend | React.js |
| Backend | Node.js, Express.js |
| OCR | Tesseract.js |
| Database | SQLite |
| Browser Automation | Playwright |
| File Upload | Multer |
| Data Processing | CSV Parser |
| CAPTCHA Verification | Google reCAPTCHA v2 API |
| Testing | PowerShell, API testing, synthetic OCR benchmark |

## 📁 Project Structure

Text
captcha-tool/
├── backend/
│   ├── data/
│   ├── test-data/
│   ├── database.js
│   ├── ocr.js
│   ├── server.js
│   ├── run_ocr_benchmark.js
│   ├── generate_test_image.py
│   ├── package.json
│   └── .env
│
├── frontend/
│   ├── public/
│   ├── src/
│   └── package.json
│
└── README.md
```

## ⚙️ Prerequisites

1. Node.js
2. npm
3. Git (optional, for cloning the repository)

## 💻 Installation & Execution

### 1. Clone the Repository
Bash
git clone
cd captcha-tool
```

Alternatively, open the downloaded project folder directly.

### 2. Backend Setup

Bash
cd backend
npm install
```

Configure the backend `.env` file:

```env
PORT=5000
RECAPTCHA_SECRET_KEY=YOUR_GOOGLE_RECAPTCHA_TEST_SECRET
```

Never commit your actual secret key to GitHub.

Start the backend:

Bash
npm start
```

Backend address:

`http://localhost:5000`

### 3. Frontend Setup

Open a second terminal:

Bash
cd frontend
npm install
npm start
```

Frontend address:

`http://localhost:3000`

## 🧪 OCR Benchmark Results

The application includes 20 synthetic CAPTCHA images for controlled OCR evaluation.

Metric                                  Result
 
Total images                            20

Correct recognition                     17

Incorrect recognition                   3

Accuracy                                85%

Average confidence                      69.75%

Average processing time                 79.62 ms

Estimated processing cost               $0.00

Note: These results apply only to the included synthetic test dataset. They do not represent accuracy on arbitrary or real-world CAPTCHA challenges.

Run the benchmark:

cd backend
node run_ocr_benchmark.js

The benchmark report is saved to:

backend/test-data/benchmark-report.json


🔐 Google reCAPTCHA Verification

The application integrates with Google's official reCAPTCHA v2 siteverify endpoint.

The integration demonstrates:

Server-side token verification.

Successful token validation.

Invalid-token rejection.

Duplicate or previously used token rejection.

Token expiration handling in the frontend.

Verification status and response reporting.

Important: Google reCAPTCHA test credentials are used for controlled testing. They are not production credentials and must not be represented as a production security deployment.


🧪 Validation & Testing

Tests performed during development include:

Successful Google reCAPTCHA token verification.

Invalid token rejection.

Duplicate token rejection.

Missing image upload validation.

Unsupported file-type rejection.

OCR benchmark execution using 20 synthetic images.

Frontend production build verification.


🏗️ Production Build

To generate the frontend production build:

cd frontend
npm run build

The optimized frontend files are generated in:

frontend/build/


⚠️ Scope & Limitations

OCR benchmarking uses a controlled synthetic image dataset.

CAPTCHA provider detection is rules-based.

Google reCAPTCHA verification uses official test credentials.

The application is designed for authorized testing and technical evaluation, not bypassing third-party security controls.


👨‍💻 Project Purpose

This project demonstrates full-stack development, REST API integration, OCR processing, database operations, browser automation, testing, and application analytics in one integrated application.