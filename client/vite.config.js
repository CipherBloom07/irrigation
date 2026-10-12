import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const localCertDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../server/certs');
const certPath = process.env.HTTPS_CERT_PATH || path.join(localCertDir, 'localhost.pem');
const keyPath = process.env.HTTPS_KEY_PATH || path.join(localCertDir, 'localhost-key.pem');
const hasCertificatePaths = Boolean(process.env.HTTPS_CERT_PATH || process.env.HTTPS_KEY_PATH);
if (hasCertificatePaths && (!process.env.HTTPS_CERT_PATH || !process.env.HTTPS_KEY_PATH)) {
  throw new Error('Set both HTTPS_CERT_PATH and HTTPS_KEY_PATH, or neither.');
}

const localCertificateExists = fs.existsSync(certPath) && fs.existsSync(keyPath);
const httpsEnabled = process.env.VITE_HTTPS === 'true' || hasCertificatePaths || localCertificateExists;
const apiTarget = process.env.VITE_API_TARGET || (httpsEnabled ? 'https://localhost:5000' : 'http://localhost:5000');
if (httpsEnabled && !localCertificateExists && !hasCertificatePaths) {
  throw new Error('HTTPS is enabled but the local certificate files are missing. Run scripts/setup-local-https.ps1.');
}

const httpsConfig = httpsEnabled
  ? {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    }
  : undefined;

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: Number(process.env.VITE_PORT || 5173),
    ...(httpsConfig ? { https: httpsConfig } : {}),
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        secure: !httpsEnabled,
      },
    },
  },
});
