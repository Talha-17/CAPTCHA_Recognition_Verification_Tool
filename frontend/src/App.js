
import React, {
  useState,
  useEffect,
  useCallback,
  useRef
} from 'react';
import axios from 'axios';

const API_URL =
  process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 60000
});

// Google's official public reCAPTCHA v2 test site key.
// The corresponding secret key must remain in backend/.env.

const initialStats = {
  detectedCount: 0,
  solvedCount: 0,
  verifiedCount: 0,
  failedVerifications: 0,
  totalRuns: 0,
  avgDurationMs: 0,
  totalCostUsd: 0,
  avgCostPerChallengeUsd: 0
};

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState(initialStats);
  const [websites, setWebsites] = useState([]);
  const [runs, setRuns] = useState([]);
  const [connectionError, setConnectionError] = useState('');

  const [challengeType, setChallengeType] = useState('reCAPTCHA');
  const [detectResult, setDetectResult] = useState(null);

  // Existing simulated verification state
  const [verifyResult, setVerifyResult] = useState(null);

  // Real Google reCAPTCHA v2 state
  const [googleToken, setGoogleToken] = useState('');
  const [googleVerifyResult, setGoogleVerifyResult] = useState(null);
  const [googleVerifying, setGoogleVerifying] = useState(false);
  const [recaptchaReady, setRecaptchaReady] = useState(false);

  // Stores the Google widget ID so it can be reset after verification.
  const recaptchaWidgetId = useRef(null);

  const [targetUrl, setTargetUrl] = useState(
    'https://www.google.com/recaptcha/api2/demo'
  );
  const [inspectResult, setInspectResult] = useState(null);
  const [inspecting, setInspecting] = useState(false);

  // Actual OCR state
  const [selectedImage, setSelectedImage] = useState(null);
  const [expectedText, setExpectedText] = useState('');
  const [ocrResult, setOcrResult] = useState(null);
  const [solvingOcr, setSolvingOcr] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [webRes, runRes] = await Promise.all([
        api.get('/websites'),
        api.get('/runs')
      ]);

      setWebsites(
        Array.isArray(webRes.data.records)
          ? webRes.data.records
          : []
      );

      setStats({
        ...initialStats,
        ...(runRes.data.summary || {})
      });

      setRuns(
        Array.isArray(runRes.data.runs)
          ? runRes.data.runs
          : []
      );

      setConnectionError('');
    } catch (err) {
      console.error('Backend connection error:', err);

      setConnectionError(
        err.response?.data?.message ||
        'Cannot connect to backend. Make sure server.js is running on port 5000.'
      );
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData, activeTab]);

  // Load the official Google reCAPTCHA v2 script.
  useEffect(() => {
    let mounted = true;

    const handleLoad = () => {
      if (mounted) {
        setRecaptchaReady(true);
      }
    };

    const handleError = () => {
      if (mounted) {
        setGoogleVerifyResult({
          success: false,
          status: 'script_error',
          message: 'Google reCAPTCHA could not be loaded. Check your internet connection or browser settings.'
        });
      }
    };

    if (window.grecaptcha) {
      setRecaptchaReady(true);
      return () => {
        mounted = false;
      };
    }

    let script = document.getElementById(
      'google-recaptcha-script'
    );

    if (!script) {
      script = document.createElement('script');
      script.id = 'google-recaptcha-script';
      script.src =
        'https://www.google.com/recaptcha/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    script.addEventListener('load', handleLoad);
    script.addEventListener('error', handleError);

    return () => {
      mounted = false;
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
    };
  }, []);

  
  // Render the Google reCAPTCHA Enterprise checkbox.
  useEffect(() => {
    if (
      !recaptchaReady ||
      activeTab !== 'lab' ||
      !window.grecaptcha
    ) {
      return;
    }

    let cancelled = false;

    window.grecaptcha.ready(() => {
      if (cancelled) return;

      const container = document.getElementById(
        'google-recaptcha-container'
      );

      if (!container || container.dataset.rendered === 'true') {
        return;
      }

      try {
        const widgetId = window.grecaptcha.render(
          container,
          {
            sitekey: '6Lf4pRsuAAAAAOIvmyYI639qEHnd8YlJZNNyL8Su',

            callback: token => {
              setGoogleToken(token);
              setGoogleVerifyResult(null);
            },

            'expired-callback': () => {
              setGoogleToken('');
              setGoogleVerifyResult({
                success: false,
                status: 'expired_token',
                message: 'The reCAPTCHA token expired. Please complete the checkbox again.'
              });
            },

            'error-callback': () => {
              setGoogleToken('');
              setGoogleVerifyResult({
                success: false,
                status: 'widget_error',
                message: 'Google reCAPTCHA encountered an error. Please try again.'
              });
            }
          }
        );

        recaptchaWidgetId.current = widgetId;
        container.dataset.rendered = 'true';

      } catch (error) {
        console.error(
          'Google reCAPTCHA widget rendering failed:',
          error.message
        );

        setGoogleVerifyResult({
          success: false,
          status: 'widget_error',
          message: 'The Google reCAPTCHA widget could not be rendered.'
        });
      }
    });

    return () => {
      cancelled = true;
      recaptchaWidgetId.current = null;
    };
  }, [recaptchaReady, activeTab]);
const handleDetect = async () => {
  try {
    const { data } = await api.post(
      '/challenges/detect',
      { challengeType }
    );

    setDetectResult(data);
    await fetchData();
  } catch (err) {
    setDetectResult({
      success: false,
      message:
        err.response?.data?.message ||
        'Detection request failed.'
    });
  }
};

  // Existing simulated verification workflow.
  const handleVerify = async tokenType => {
    try {
      const { data } = await api.post(
        '/verification/verify',
        {
          provider: 'Google reCAPTCHA test flow',
          tokenType
        }
      );

      setVerifyResult(data);
      await fetchData();
    } catch (err) {
      setVerifyResult(
        err.response?.data || {
          success: false,
          status: 'error',
          message: 'Verification demonstration failed.'
        }
      );
    }
  };

  // Real Google reCAPTCHA server-side verification.
  const handleGoogleVerify = async () => {
    if (!googleToken) {
      setGoogleVerifyResult({
        success: false,
        status: 'missing_token',
        message: 'Please complete the Google reCAPTCHA checkbox first.'
      });
      return;
    }

    setGoogleVerifying(true);
    setGoogleVerifyResult(null);

    try {
      const { data } = await api.post(
        '/verification/google',
        {
          token: googleToken
        }
      );

      setGoogleVerifyResult(data);

      // Refresh dashboard metrics and activity history.
      await fetchData();
    } catch (err) {
      setGoogleVerifyResult(
        err.response?.data || {
          success: false,
          status: 'request_error',
          message: 'Could not complete Google verification. Check the backend connection and try again.'
        }
      );
    } finally {
      setGoogleVerifying(false);
      setGoogleToken('');

      // Google response tokens are one-time use.
      // Reset the widget so another test can be performed.
      if (
        window.grecaptcha &&
        recaptchaWidgetId.current !== null
      ) {
        try {
          window.grecaptcha.reset(recaptchaWidgetId.current);
        } catch (error) {
          console.error(
            'Could not reset Google reCAPTCHA:',
            error.message
          );
        }
      }
    }
  };

  // Actual image-based OCR processing.
  const handleOcrSolve = async () => {
    if (!selectedImage) {
      setOcrResult({
        success: false,
        message: 'Please select a CAPTCHA image first.'
      });
      return;
    }

    const allowedTypes = [
      'image/png',
      'image/jpeg',
      'image/webp'
    ];

    if (!allowedTypes.includes(selectedImage.type)) {
      setOcrResult({
        success: false,
        message: 'Only PNG, JPEG, and WebP images are supported.'
      });
      return;
    }

    if (selectedImage.size > 5 * 1024 * 1024) {
      setOcrResult({
        success: false,
        message: 'Image size must not exceed 5 MB.'
      });
      return;
    }

    setSolvingOcr(true);
    setOcrResult(null);

    try {
      const formData = new FormData();

      formData.append('image', selectedImage);

      if (expectedText.trim()) {
        formData.append('expectedText', expectedText.trim());
      }

      const { data } = await api.post(
        '/solver/ocr',
        formData
      );

      setOcrResult(data);
      await fetchData();
    } catch (err) {
      setOcrResult({
        success: false,
        message:
          err.response?.data?.message ||
          'OCR processing failed. Please try another image.'
      });
    } finally {
      setSolvingOcr(false);
    }
  };

  const handleInspect = async () => {
    setInspecting(true);
    setInspectResult(null);

    try {
      const { data } = await api.post(
        '/browser/inspect',
        { targetUrl }
      );

      setInspectResult(data);
      await fetchData();
    } catch (err) {
      setInspectResult({
        success: false,
        url: targetUrl,
        message:
          err.response?.data?.message ||
          'Inspection failed or timed out.'
      });
    } finally {
      setInspecting(false);
    }
  };

  return (
    <div
      style={{
        fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
        backgroundColor: '#f4f7f6',
        minHeight: '100vh',
        padding: '20px'
      }}
    >
      <header
        style={{
          backgroundColor: '#2c3e50',
          color: 'white',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '15px'
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '24px' }}>
            🛡️ CAPTCHA Recognition & Verification Tool
          </h1>

          <p
            style={{
              margin: '5px 0 0',
              color: '#bdc3c7',
              fontSize: '14px'
            }}
          >
            AI Automation & Full-Stack Assessment Dashboard
          </p>
        </div>

        <nav
          style={{
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap'
          }}
        >
          {[
            ['dashboard', 'Dashboard'],
            ['ocr', 'Synthetic Solver'],
            ['lab', 'Challenge & Token Lab'],
            ['browser', 'Playwright Browser'],
            ['dataset', 'CSV Dataset']
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              style={btnStyle(activeTab === key)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      {connectionError && (
        <div
          style={{
            background: '#fdedec',
            color: '#922b21',
            padding: '12px 16px',
            borderRadius: '6px',
            marginBottom: '16px'
          }}
        >
          <b>Backend connection:</b> {connectionError}
        </div>
      )}

      
{/* DASHBOARD */}
{activeTab === 'dashboard' && (
  <div>
    {/* Live application statistics */}
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '15px',
        marginBottom: '25px'
      }}
    >
      <Card
        title="Detected Count"
        value={stats.detectedCount}
        color="#3498db"
      />

      <Card
        title="Successful Solves"
        value={stats.solvedCount}
        color="#8e44ad"
      />

      <Card
        title="Demo Verified"
        value={stats.verifiedCount}
        color="#2ecc71"
      />

      <Card
        title="Avg Duration"
        value={`${stats.avgDurationMs} ms`}
        color="#f39c12"
      />

      <Card
        title="Recorded Cost"
        value={`$${Number(stats.totalCostUsd || 0).toFixed(4)}`}
        color="#e74c3c"
      />
    </div>

    {/* Actual OCR benchmark results */}
    <Panel>
      <h3 style={{ marginTop: 0 }}>
        OCR Benchmark Results
      </h3>

      <p style={{ color: '#7f8c8d', fontSize: '13px' }}>
        Actual results from the 20-image synthetic CAPTCHA test
        using Tesseract.js OCR.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
          gap: '15px',
          marginTop: '20px'
        }}
      >
        <Card
          title="Accuracy"
          value="80%"
          color="#2ecc71"
        />

        <Card
          title="Successful"
          value="16 / 20"
          color="#3498db"
        />

        <Card
          title="Failed"
          value="4"
          color="#e74c3c"
        />

        <Card
          title="Avg Confidence"
          value="76.75%"
          color="#8e44ad"
        />

        <Card
          title="Avg Processing"
          value="20.6 ms"
          color="#f39c12"
        />

        <Card
          title="Processing Cost"
          value="$0.00"
          color="#16a085"
        />
      </div>

      <div style={{ marginTop: '20px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: '8px',
            fontSize: '13px'
          }}
        >
          <b>Recognition accuracy</b>
          <b>80%</b>
        </div>

        <div
          style={{
            height: '12px',
            background: '#e5e7eb',
            borderRadius: '10px',
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              width: '80%',
              height: '100%',
              background: '#2ecc71',
              borderRadius: '10px'
            }}
          />
        </div>
      </div>

      <div
        style={{
          marginTop: '20px',
          padding: '15px',
          background: 'rgba(127, 140, 141, 0.08)',
          borderRadius: '8px'
        }}
      >
        <b style={{ fontSize: '14px' }}>
          Benchmark observations
        </b>

        <ul style={{ fontSize: '13px', lineHeight: 1.8 }}>
          <li>
            16 out of 20 synthetic CAPTCHA images were
            recognized correctly.
          </li>
          <li>
            Four errors involved visually similar characters,
            including 5/S, 9/Y and I/l.
          </li>
          <li>
            Processing used local Tesseract.js OCR with
            no per-image API charge.
          </li>
        </ul>

        <p style={{ fontSize: '12px', color: '#7f8c8d', marginBottom: 0 }}>
          Dataset: 20 synthetic images. Results are a small
          controlled benchmark, not a general CAPTCHA accuracy guarantee.
        </p>
      </div>
    </Panel>

    {/* Recent activity */}
    <Panel>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px'
        }}
      >
        <h3 style={{ marginTop: 0 }}>
          Recent Processing & Verification Activity
        </h3>

        <b
          style={{
            fontSize: '13px',
            color: '#7f8c8d'
          }}
        >
          Recorded cost: $
          {Number(stats.totalCostUsd || 0).toFixed(4)} USD
        </b>
      </div>

      {runs.length === 0 ? (
        <p style={{ color: '#7f8c8d' }}>
          No runs executed yet.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr style={headRowStyle}>
                {[
                  'Timestamp',
                  'Engine / Provider',
                  'Status',
                  'Duration',
                  'Cost',
                  'Message'
                ].map(x => (
                  <th key={x} style={thStyle}>
                    {x}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {runs.map(r => (
                <tr
                  key={r.id}
                  style={{
                    borderBottom: '1px solid #ecf0f1',
                    fontSize: '13px'
                  }}
                >
                  <td style={tdStyle}>
                    {new Date(r.timestamp).toLocaleString()}
                  </td>

                  <td style={tdStyle}>
                    <b>{r.challengeType}</b>
                  </td>

                  <td style={tdStyle}>
                    <Status value={r.status} />
                  </td>

                  <td style={tdStyle}>
                    {Number(r.durationMs || 0).toFixed(2)} ms
                  </td>

                  <td style={tdStyle}>
                    ${Number(r.costUsd || 0).toFixed(4)}
                  </td>

                  <td style={tdStyle}>
                    {r.safeMessage}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  </div>
)}

      {/* ACTUAL OCR SOLVER */}
      {activeTab === 'ocr' && (
        <div
          style={{
            maxWidth: '850px',
            margin: '0 auto',
            display: 'grid',
            gap: '20px'
          }}
        >
          <Panel>
            <h3>🧪 Synthetic CAPTCHA OCR Solver</h3>

            <p style={helpText}>
              Upload a synthetic or authorized CAPTCHA test image.
              The backend uses Tesseract.js to extract text locally.
              No third-party CAPTCHA-solving API is used.
            </p>

            <div
              style={{
                border: '2px dashed #bdc3c7',
                borderRadius: '8px',
                padding: '25px',
                textAlign: 'center',
                background: '#fafbfc',
                marginTop: '18px'
              }}
            >
              <div style={{ fontSize: '38px' }}>📁</div>

              <h4>Select a CAPTCHA Image</h4>

              <p style={helpText}>
                Supported formats: PNG, JPEG, WebP. Maximum size: 5 MB.
              </p>

              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={e => {
                  const file = e.target.files?.[0] || null;
                  setSelectedImage(file);
                  setOcrResult(null);
                }}
                style={{
                  display: 'block',
                  margin: '15px auto',
                  maxWidth: '100%'
                }}
              />

              {selectedImage && (
                <div
                  style={{
                    marginTop: '12px',
                    color: '#34495e',
                    fontSize: '13px'
                  }}
                >
                  <b>Selected:</b> {selectedImage.name}
                  <br />
                  <b>Size:</b>{' '}
                  {(selectedImage.size / 1024).toFixed(2)} KB
                </div>
              )}
            </div>

            {selectedImage && selectedImage.type.startsWith('image/') && (
              <div style={{ marginTop: '18px', textAlign: 'center' }}>
                <p style={helpText}>Image preview</p>

                <img
                  src={URL.createObjectURL(selectedImage)}
                  alt="Selected CAPTCHA preview"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '220px',
                    objectFit: 'contain',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    padding: '8px',
                    background: 'white'
                  }}
                />
              </div>
            )}

            <label style={labelStyle}>
              Expected Text (Optional)
            </label>

            <input
              type="text"
              value={expectedText}
              onChange={e => setExpectedText(e.target.value)}
              placeholder="Example: TEST7"
              style={inputStyle}
            />

            <p style={helpText}>
              Use this field only with your own synthetic test images
              to measure whether the OCR output matches the known text.
              Leave it empty for ordinary OCR extraction.
            </p>

            <button
              onClick={handleOcrSolve}
              disabled={solvingOcr || !selectedImage}
              style={{
                ...primaryButton('#8e44ad'),
                width: '100%',
                opacity: solvingOcr || !selectedImage ? 0.6 : 1,
                cursor: solvingOcr || !selectedImage
                  ? 'not-allowed'
                  : 'pointer'
              }}
            >
              {solvingOcr
                ? 'Processing Image with Tesseract OCR...'
                : '🚀 Process CAPTCHA Image'}
            </button>

            {solvingOcr && (
              <p style={{ ...helpText, textAlign: 'center' }}>
                OCR is processing your image. The first run may take
                longer while the English language data is initialized.
              </p>
            )}

            {ocrResult && (
              <div
                style={{
                  ...resultStyle,
                  borderLeftColor: ocrResult.success
                    ? ocrResult.matches === false
                      ? '#e67e22'
                      : '#2ecc71'
                    : '#e74c3c'
                }}
              >
                <h4 style={{ marginTop: 0 }}>
                  OCR Processing Result
                </h4>

                {ocrResult.success ? (
                  <>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                        gap: '10px',
                        marginBottom: '18px'
                      }}
                    >
                      <ResultMetric
                        label="Status"
                        value={ocrResult.status || 'Processed'}
                      />

                      <ResultMetric
                        label="Confidence"
                        value={
                          typeof ocrResult.confidence === 'number'
                            ? `${(ocrResult.confidence * 100).toFixed(2)}%`
                            : 'N/A'
                        }
                      />

                      <ResultMetric
                        label="Duration"
                        value={`${Number(ocrResult.durationMs || 0).toFixed(2)} ms`}
                      />

                      <ResultMetric
                        label="Processing Cost"
                        value={`$${Number(ocrResult.costUsd || 0).toFixed(4)}`}
                      />
                    </div>

                    <p>
                      <b>Challenge Type:</b>{' '}
                      {ocrResult.challengeType}
                    </p>

                    <p>
                      <b>OCR Engine:</b>{' '}
                      {ocrResult.engine || 'Tesseract.js'}
                    </p>

                    <p>
                      <b>Method:</b>{' '}
                      {ocrResult.method}
                    </p>

                    <div
                      style={{
                        background: 'white',
                        border: '1px solid #ddd',
                        borderRadius: '6px',
                        padding: '15px',
                        margin: '15px 0'
                      }}
                    >
                      <p
                        style={{
                          margin: '0 0 8px',
                          color: '#7f8c8d',
                          fontSize: '12px',
                          fontWeight: 'bold'
                        }}
                      >
                        EXTRACTED TEXT
                      </p>

                      <div
                        style={{
                          fontSize: '24px',
                          fontWeight: 'bold',
                          color: '#2c3e50',
                          overflowWrap: 'anywhere'
                        }}
                      >
                        {ocrResult.extractedText || '(No text detected)'}
                      </div>
                    </div>

                    {ocrResult.expectedTextProvided && (
                      <p>
                        <b>Expected Text:</b> {expectedText}
                      </p>
                    )}

                    {ocrResult.matches !== null &&
                      ocrResult.matches !== undefined && (
                        <p>
                          <b>Accuracy Check:</b>{' '}
                          {ocrResult.matches
                            ? '✅ Exact match'
                            : '❌ Does not match expected text'}
                        </p>
                      )}

                    <p>{ocrResult.message}</p>

                    <p style={helpText}>
                      Confidence is the OCR engine's confidence estimate,
                      not a guarantee that the extracted text is correct.
                    </p>
                  </>
                ) : (
                  <p style={{ color: '#c0392b' }}>
                    {ocrResult.message}
                  </p>
                )}
              </div>
            )}
          </Panel>

          <Panel>
            <h3>About This OCR Workflow</h3>

            <ul style={{ ...helpText, paddingLeft: '20px' }}>
              <li>Image processing is performed by Tesseract.js.</li>
              <li>Only synthetic or authorized test images should be used.</li>
              <li>Images are uploaded to the backend for processing.</li>
              <li>The backend stores processing metrics, not the uploaded image.</li>
              <li>No paid OCR API is used; recorded processing cost is $0.</li>
              <li>Expected-text comparison is intended for controlled testing.</li>
            </ul>
          </Panel>
        </div>
      )}

      {/* CHALLENGE & TOKEN LAB */}
      {activeTab === 'lab' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '20px'
          }}
        >
          <Panel>
            <h3>1. CAPTCHA Recognition</h3>

            <p style={helpText}>
              Classifies a selected challenge type. Recognition
              does not mean that the challenge is solved.
            </p>

            <label style={labelStyle}>
              Select challenge type
            </label>

            <select
              value={challengeType}
              onChange={e => setChallengeType(e.target.value)}
              style={inputStyle}
            >
              <option value="reCAPTCHA">Google reCAPTCHA</option>
              <option value="invisible reCAPTCHA">Invisible reCAPTCHA</option>
              <option value="hCaptcha">hCaptcha</option>
              <option value="Turnstile">Cloudflare Turnstile</option>
              <option value="synthetic_text">Synthetic Text CAPTCHA</option>
              <option value="unknown_custom_puzzle">Unknown / Unsupported Puzzle</option>
            </select>

            <button
              onClick={handleDetect}
              style={primaryButton('#3498db')}
            >
              Run Recognition
            </button>

            {detectResult && (
              <div style={resultStyle}>
                <p>
                  <b>Supported:</b>{' '}
                  {detectResult.isSupported ? 'Yes ✅' : 'No ❌'}
                </p>

                <p>
                  <b>Detected type:</b>{' '}
                  {detectResult.detectedType || 'Not detected'}
                </p>

                <p>
                  <b>Confidence:</b>{' '}
                  {detectResult.confidence ?? 'N/A'}
                </p>

                <p>
                  <b>Method:</b>{' '}
                  {detectResult.method || 'N/A'}
                </p>

                <p>
                  <b>Message:</b> {detectResult.message}
                </p>
              </div>
            )}
          </Panel>

          <Panel>
            <h3>2. Token Verification Lab</h3>

            <p style={helpText}>
              This lab demonstrates two separate workflows:
              official Google reCAPTCHA v2 test-token verification
              and simulated verification responses for controlled testing.
            </p>

            {/* REAL GOOGLE VERIFICATION */}
            <div
              style={{
                marginTop: '20px',
                marginBottom: '22px',
                padding: '16px',
                border: '1px solid #dfe6e9',
                borderRadius: '8px',
                background: '#fafbfc'
              }}
            >
              <h4 style={{ marginTop: 0 }}>
                Real Google reCAPTCHA v2 Test
              </h4>

              <p style={helpText}>
                Complete Google's test checkbox. The browser obtains
                a response token, which is sent to your backend.
                Your backend then contacts Google's official
                siteverify endpoint.
              </p>

              <div
                id="google-recaptcha-container"
                style={{
                  minHeight: '78px',
                  marginTop: '12px'
                }}
              />

              {!recaptchaReady && (
                <p style={helpText}>
                  Loading Google's reCAPTCHA script...
                </p>
              )}

              {recaptchaReady && !googleToken && !googleVerifyResult && (
                <p style={helpText}>
                  Complete the checkbox above to acquire a test token.
                </p>
              )}

              {googleToken && (
                <p
                  style={{
                    color: '#148f77',
                    fontSize: '13px',
                    fontWeight: 'bold'
                  }}
                >
                  ✅ Google response token acquired. It is ready for server-side verification.
                </p>
              )}

              <button
                onClick={handleGoogleVerify}
                disabled={!googleToken || googleVerifying}
                style={{
                  ...primaryButton('#2874a6'),
                  width: '100%',
                  opacity: !googleToken || googleVerifying ? 0.55 : 1,
                  cursor: !googleToken || googleVerifying
                    ? 'not-allowed'
                    : 'pointer'
                }}
              >
                {googleVerifying
                  ? 'Verifying with Google...'
                  : 'Verify Token with Google'}
              </button>

              {googleVerifyResult && (
                <div
                  style={{
                    ...resultStyle,
                    borderLeftColor: googleVerifyResult.success
                      ? '#2ecc71'
                      : '#e74c3c'
                  }}
                >
                  <h4 style={{ marginTop: 0 }}>
                    Google Verification Result
                  </h4>

                  <p>
                    <b>Success:</b>{' '}
                    {googleVerifyResult.success ? 'Yes ✅' : 'No ❌'}
                  </p>

                  <p>
                    <b>Provider:</b>{' '}
                    {googleVerifyResult.provider || 'Google reCAPTCHA v2'}
                  </p>

                  <p>
                    <b>Status:</b>{' '}
                    {googleVerifyResult.status || 'Unknown'}
                  </p>

                  {googleVerifyResult.hostname && (
                    <p>
                      <b>Hostname:</b>{' '}
                      {googleVerifyResult.hostname}
                    </p>
                  )}

                  {googleVerifyResult.challengeTimestamp && (
                    <p>
                      <b>Challenge timestamp:</b>{' '}
                      {googleVerifyResult.challengeTimestamp}
                    </p>
                  )}

                  {googleVerifyResult.durationMs !== undefined && (
                    <p>
                      <b>Verification duration:</b>{' '}
                      {Number(googleVerifyResult.durationMs).toFixed(2)} ms
                    </p>
                  )}

                  {googleVerifyResult.errorCodes?.length > 0 && (
                    <p>
                      <b>Error codes:</b>{' '}
                      {googleVerifyResult.errorCodes.join(', ')}
                    </p>
                  )}

                  <p>
                    <b>Simulated:</b>{' '}
                    {googleVerifyResult.simulated ? 'Yes' : 'No'}
                  </p>

                  <p>
                    <b>Message:</b>{' '}
                    {googleVerifyResult.message}
                  </p>
                </div>
              )}

              <p style={{ ...helpText, marginBottom: 0 }}>
                Test mode uses Google's public test keys. These keys
                are for development and are not production credentials.
              </p>
            </div>

            {/* SIMULATED VERIFICATION */}
            <div
              style={{
                borderTop: '1px solid #e5e7e9',
                paddingTop: '18px'
              }}
            >
              <h4>Simulated Verification Tests</h4>

              <p style={helpText}>
                These buttons test your application's response handling.
                They do not contact Google or validate a real token.
              </p>

              <div
                style={{
                  display: 'flex',
                  gap: '10px',
                  flexWrap: 'wrap'
                }}
              >
                <button
                  onClick={() => handleVerify('invalid_response')}
                  style={primaryButton('#e74c3c')}
                >
                  Simulate Invalid Token
                </button>

                <button
                  onClick={() => handleVerify('passing')}
                  style={primaryButton('#2ecc71')}
                >
                  Simulate Success Response
                </button>
              </div>

              {verifyResult && (
                <div style={resultStyle}>
                  <h4 style={{ marginTop: 0 }}>
                    Simulated Verification Result
                  </h4>

                  <p>
                    <b>Success:</b>{' '}
                    {verifyResult.success ? 'True ✅' : 'False ❌'}
                  </p>

                  <p>
                    <b>Status:</b> {verifyResult.status}
                  </p>

                  <p>
                    <b>Provider:</b> {verifyResult.provider}
                  </p>

                  <p>
                    <b>Simulated:</b>{' '}
                    {verifyResult.simulated ? 'Yes' : 'No'}
                  </p>

                  <p>
                    <b>Message:</b> {verifyResult.message}
                  </p>

                  {verifyResult.errorCodes?.length > 0 && (
                    <p>
                      <b>Error codes:</b>{' '}
                      {verifyResult.errorCodes.join(', ')}
                    </p>
                  )}
                </div>
              )}
            </div>
          </Panel>
        </div>
      )}

      {/* PLAYWRIGHT BROWSER */}
      {activeTab === 'browser' && (
        <Panel
          style={{
            maxWidth: '700px',
            margin: '0 auto'
          }}
        >
          <h3>3. Playwright Browser Inspection Lab</h3>

          <p style={helpText}>
            Inspects approved test pages for provider markers.
            It does not solve challenges or submit forms.
            Backend allowlist: localhost, 127.0.0.1, and
            www.google.com.
          </p>

          <label style={labelStyle}>
            Target test URL
          </label>

          <input
            type="url"
            value={targetUrl}
            onChange={e => setTargetUrl(e.target.value)}
            style={inputStyle}
            placeholder="https://www.google.com/recaptcha/api2/demo"
          />

          <button
            onClick={handleInspect}
            disabled={inspecting}
            style={primaryButton('#9b59b6')}
          >
            {inspecting
              ? 'Inspecting with Playwright...'
              : 'Run Browser Inspection'}
          </button>

          {inspectResult && (
            <div style={resultStyle}>
              <p>
                <b>URL:</b> {inspectResult.url}
              </p>

              <p>
                <b>Detected provider:</b>{' '}
                {inspectResult.detectedProvider || 'Not available'}
              </p>

              <p>
                <b>Duration:</b>{' '}
                {inspectResult.durationMs ?? 'N/A'} ms
              </p>

              <p>
                <b>Message:</b>{' '}
                {inspectResult.message || inspectResult.error}
              </p>
            </div>
          )}
        </Panel>
      )}

      {/* CSV DATASET */}
      {activeTab === 'dataset' && (
        <Panel>
          <h3>
            Imported CSV Dataset ({websites.length} records)
          </h3>

          <p style={helpText}>
            CAPTCHA values are labels supplied in the CSV,
            not live verification of each website.
          </p>

          {websites.length === 0 ? (
            <p style={{ color: '#7f8c8d' }}>
              No records loaded. Put the CSV beside server.js
              and restart the backend.
            </p>
          ) : (
            <div
              style={{
                maxHeight: '450px',
                overflow: 'auto',
                marginTop: '10px'
              }}
            >
              <table style={tableStyle}>
                <thead>
                  <tr
                    style={{
                      ...headRowStyle,
                      position: 'sticky',
                      top: 0
                    }}
                  >
                    {[
                      'Company',
                      'Website',
                      'Platform',
                      'Supplied CAPTCHA',
                      'Contact Page'
                    ].map(x => (
                      <th key={x} style={thStyle}>
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {websites.map((w, i) => (
                    <tr
                      key={`${w.Company || 'company'}-${i}`}
                      style={{
                        borderBottom: '1px solid #ecf0f1',
                        fontSize: '13px'
                      }}
                    >
                      <td style={tdStyle}>
                        <b>{w.Company}</b>
                      </td>

                      <td style={tdStyle}>
                        {w.Website ? (
                          <a
                            href={w.Website}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {w.Website}
                          </a>
                        ) : '—'}
                      </td>

                      <td style={tdStyle}>
                        {w.Platform || '—'}
                      </td>

                      <td style={tdStyle}>
                        {w.Captcha || '—'}
                      </td>

                      <td style={tdStyle}>
                        {w['Contact Page'] ? (
                          <a
                            href={w['Contact Page']}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open contact page
                          </a>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

function Panel({ children, style = {} }) {
  return (
    <section
      style={{
        backgroundColor: 'white',
        padding: '22px',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        ...style
      }}
    >
      {children}
    </section>
  );
}

function Card({ title, value, color }) {
  return (
    <div
      style={{
        backgroundColor: 'white',
        padding: '15px',
        borderRadius: '8px',
        borderLeft: `5px solid ${color}`,
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}
    >
      <p
        style={{
          margin: '0 0 5px',
          color: '#7f8c8d',
          fontSize: '12px'
        }}
      >
        {title}
      </p>

      <h2
        style={{
          margin: 0,
          color: '#2c3e50',
          fontSize: '20px'
        }}
      >
        {value}
      </h2>
    </div>
  );
}

function ResultMetric({ label, value }) {
  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #e5e7e9',
        borderRadius: '6px',
        padding: '12px'
      }}
    >
      <div
        style={{
          fontSize: '11px',
          color: '#7f8c8d',
          marginBottom: '6px'
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize: '17px',
          fontWeight: 'bold',
          color: '#2c3e50',
          overflowWrap: 'anywhere'
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Status({ value }) {
  const good = ['Success', 'Detected', 'Solved'].includes(value);

  return (
    <span
      style={{
        padding: '3px 8px',
        borderRadius: '4px',
        background: good ? '#e8f8f5' : '#fdedec',
        color: good ? '#148f77' : '#c0392b'
      }}
    >
      {value}
    </span>
  );
}

const btnStyle = active => ({
  backgroundColor: active ? '#1abc9c' : 'transparent',
  color: 'white',
  border: '1px solid #1abc9c',
  padding: '7px 12px',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 'bold',
  fontSize: '13px'
});

const primaryButton = color => ({
  backgroundColor: color,
  color: 'white',
  border: 'none',
  padding: '11px 18px',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 'bold',
  marginTop: '8px'
});

const inputStyle = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px',
  margin: '8px 0 15px',
  borderRadius: '4px',
  border: '1px solid #ccc'
};

const labelStyle = {
  display: 'block',
  marginTop: '12px',
  fontWeight: 'bold'
};

const helpText = {
  fontSize: '13px',
  color: '#666',
  lineHeight: 1.5
};

const resultStyle = {
  marginTop: '18px',
  padding: '14px',
  background: '#f4f6f7',
  borderRadius: '6px',
  borderLeft: '5px solid #8e44ad',
  overflowWrap: 'anywhere'
};

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  marginTop: '10px'
};

const headRowStyle = {
  backgroundColor: '#ecf0f1',
  textAlign: 'left',
  fontSize: '13px'
};

const thStyle = {
  padding: '10px',
  borderBottom: '2px solid #bdc3c7',
  whiteSpace: 'nowrap'
};

const tdStyle = {
  padding: '10px',
  verticalAlign: 'top'
};

export default App;
