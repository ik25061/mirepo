// Genera certificados SSL autofirmados para desarrollo
// Ejecutar con: node scripts/generate-ssl-certs.js
import fs from 'fs';
import path from 'path';
import os from 'node:os';
import { fileURLToPath } from 'url';
import forge from 'node-forge';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const certDir = path.resolve(__dirname, '..', 'certs');

if (!fs.existsSync(certDir)) {
  fs.mkdirSync(certDir, { recursive: true });
}

// Detectar todas las IPs de red locales
const nets = os.networkInterfaces();
const localIPs = [];
for (const name of Object.keys(nets)) {
  for (const net of nets[name]) {
    if (net.family === 'IPv4' && !net.internal) {
      localIPs.push(net.address);
    }
  }
}

console.log('🔑 Generando par de llaves RSA de 2048 bits...');
const keys = forge.pki.rsa.generateKeyPair(2048);

console.log('📜 Generando certificado autofirmado...');
const cert = forge.pki.createCertificate();
cert.publicKey = keys.publicKey;
cert.serialNumber = Date.now().toString();
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date();
cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

const attrs = [
  { name: 'commonName', value: 'localhost' },
  { name: 'organizationName', value: 'Mirepo' },
  { name: 'organizationalUnitName', value: 'Development' },
];
cert.setSubject(attrs);
cert.setIssuer(attrs);

// Construir SAN con todas las IPs detectadas
const altNames = [
  { type: 2, value: 'localhost' },
  { type: 7, ip: '127.0.0.1' },
];

for (const ip of localIPs) {
  altNames.push({ type: 7, ip });
}

cert.setExtensions([
  {
    name: 'basicConstraints',
    cA: false,
  },
  {
    name: 'keyUsage',
    keyCertSign: true,
    digitalSignature: true,
    keyEncipherment: true,
  },
  {
    name: 'extKeyUsage',
    serverAuth: true,
    clientAuth: true,
  },
  {
    name: 'subjectAltName',
    altNames,
  },
]);

cert.sign(keys.privateKey, forge.md.sha256.create());

const pemKey = forge.pki.privateKeyToPem(keys.privateKey);
const pemCert = forge.pki.certificateToPem(cert);

const keyPath = path.join(certDir, 'server.key');
const certPath = path.join(certDir, 'server.cert');

fs.writeFileSync(keyPath, pemKey);
fs.writeFileSync(certPath, pemCert);

console.log(`✅ Certificados SSL generados:`);
console.log(`   📄 Clave:  ${keyPath}`);
console.log(`   📄 Cert:   ${certPath}`);
console.log(`   ⏰ Válido: 1 año`);
console.log(`   🔒 Tipo:   Autofirmado (solo para desarrollo)`);
console.log(`\n🌐 IPs incluidas en el certificado:`);
console.log(`   - localhost`);
console.log(`   - 127.0.0.1`);
for (const ip of localIPs) {
  console.log(`   - ${ip}`);
}
console.log(`\n⚠️  Para eliminar la advertencia de seguridad:`);
console.log(`   Opción 1: Usa https://localhost:5171 desde este equipo`);
console.log(`   Opción 2: Instala el certificado como confiable en el otro dispositivo:`);
console.log(`     - Windows: Abrir server.cert → "Instalar certificado" → "Entidad raíz de confianza"`);
console.log(`     - Android: Ajustes → Seguridad → Instalar desde almacenamiento (server.cert)`);
console.log(`     - iOS:      Enviar cert por AirDrop → Ajustes → Perfil → Instalar`);