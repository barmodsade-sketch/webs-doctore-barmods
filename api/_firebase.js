// Helper Firebase Admin SDK untuk Vercel Serverless Functions
const admin = require('firebase-admin');

function initFirebaseAdmin() {
  if (admin.apps.length) return admin;

  let credential = null;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    if (parsed.private_key) {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }
    credential = admin.credential.cert(parsed);
  } else if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    credential = admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    });
  } else {
    throw new Error('Firebase Admin credentials belum diisi di Environment Variables (.env).');
  }

  admin.initializeApp({ credential });
  return admin;
}

function getDb() {
  return initFirebaseAdmin().firestore();
}

function isAdminEmail(email) {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

async function verifyUser(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  try {
    const decoded = await initFirebaseAdmin().auth().verifyIdToken(match[1]);
    return {
      uid: decoded.uid,
      email: decoded.email || '',
      name: decoded.name || (decoded.email ? decoded.email.split('@')[0] : 'User'),
      isAdmin: isAdminEmail(decoded.email)
    };
  } catch (err) {
    return null;
  }
}

async function ensureUserProfile(db, user) {
  const ref = db.collection('users').doc(user.uid);
  const snap = await ref.get();
  const now = Date.now();
  if (!snap.exists) {
    const profile = {
      uid: user.uid,
      email: user.email,
      displayName: user.name,
      balance: 0,
      createdAt: now,
      lastLoginAt: now
    };
    await ref.set(profile);
    return profile;
  }
  const data = snap.data();
  await ref.set({
    email: user.email,
    displayName: user.name || data.displayName || 'Member',
    lastLoginAt: now
  }, { merge: true });
  return { ...data, balance: Number(data.balance || 0) };
}

const DEFAULT_STORE = {
  storeName: 'BARMODS STORE',
  tagline: 'QRIS TOPUP SALDO • AUTO VPN',
  announcement: 'Harga mulai Rp 333/hari! Beli paket 30 hari untuk akses perpanjangan hemat Rp 7.000/bulan (H-3 sebelum expired).',
  maintenance: false,
  allowSwitchProtocol: true,
  waAdmin: '6285973928253',
  waCs: '6285133073263',
  pricePerDay: 333,
  renewPrice: 7000,
  renewDays: 30,
  renewMinOriginalDays: 30,
  renewWindowDays: 3,
  defaultQuota: 0,
  defaultIpLimit: 2,
  adminFee: 500,
  activeProtocols: {
    ssh: true,
    vmess: true,
    vless: true,
    trojan: true,
    shadowsocks: true
  }
};

async function getStoreAndSecrets() {
  const db = getDb();
  const [storeSnap, secretSnap] = await Promise.all([
    db.collection('settings').doc('store').get(),
    db.collection('private_config').doc('secrets').get()
  ]);

  const store = storeSnap.exists
    ? {
        ...DEFAULT_STORE,
        ...storeSnap.data(),
        activeProtocols: { ...DEFAULT_STORE.activeProtocols, ...(storeSnap.data().activeProtocols || {}) }
      }
    : { ...DEFAULT_STORE };

  const secretsData = secretSnap.exists ? secretSnap.data() : {};
  let servers = Array.isArray(secretsData.servers) ? secretsData.servers : [];

  if (!servers.length && process.env.VPN_DOMAIN && process.env.VPN_AUTH) {
    servers = [{
      id: 'srv_default',
      name: process.env.VPN_SERVER_NAME || 'BARMODS VIP',
      domain: process.env.VPN_DOMAIN,
      auth: process.env.VPN_AUTH,
      cloudfront: process.env.VPN_CLOUDFRONT || '-',
      port: String(process.env.VPN_API_PORT || '5888'),
      active: true
    }];
  }

  const chestpayApiKey = secretsData.chestpayApiKey || process.env.CHESTPAY_APIKEY || '';

  return { db, store, servers, chestpayApiKey };
}

module.exports = {
  initFirebaseAdmin,
  getDb,
  isAdminEmail,
  verifyUser,
  ensureUserProfile,
  getStoreAndSecrets,
  DEFAULT_STORE
};
