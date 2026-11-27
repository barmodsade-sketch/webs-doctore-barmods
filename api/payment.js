// Vercel Serverless Function — ChestPay QRIS Top Up Saldo Otomatis
// Begitu status = settlement, saldo otomatis masuk ke users/{uid}.balance (anti double-credit)

const { verifyUser, ensureUserProfile, getStoreAndSecrets } = require('./_firebase');

const CHESTPAY_BASE = 'https://pay.chestcloudx.com/api/payment';

module.exports = async function handler(req, res) {
  try {
    const user = await verifyUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Silakan login terlebih dahulu.' });
    }

    const { db, store, chestpayApiKey } = await getStoreAndSecrets();
    await ensureUserProfile(db, user);

    if (!chestpayApiKey) {
      return res.status(500).json({
        success: false,
        message: 'CHESTPAY_APIKEY belum diatur. Isi di Panel Admin → Setting Toko atau di .env Vercel.'
      });
    }

    // GET /api/payment?action=status&orderId=ORD-...
    if (req.method === 'GET') {
      const { action, orderId } = req.query || {};
      if (action === 'status' && orderId) {
        const url = `${CHESTPAY_BASE}/status/${encodeURIComponent(orderId)}?apikey=${encodeURIComponent(chestpayApiKey)}`;
        const r = await fetch(url);
        const data = await r.json();
        const status = (data.status || 'pending').toLowerCase();

        let creditedNow = false;
        let newBalance = null;

        if (status === 'settlement') {
          const orderRef = db.collection('orders').doc(orderId);
          const userRef = db.collection('users').doc(user.uid);

          await db.runTransaction(async (tx) => {
            const ordSnap = await tx.get(orderRef);
            if (!ordSnap.exists) return;
            const ord = ordSnap.data();
            if (ord.uid !== user.uid) return;

            if (ord.type === 'topup' && !ord.credited) {
              const uSnap = await tx.get(userRef);
              const curBal = uSnap.exists ? Number(uSnap.data().balance || 0) : 0;
              const addAmt = Number(ord.baseAmount || 0);
              newBalance = curBal + addAmt;
              tx.set(userRef, { balance: newBalance, updatedAt: Date.now() }, { merge: true });
              tx.set(orderRef, { status: 'settlement', credited: true, updatedAt: Date.now() }, { merge: true });
              creditedNow = true;
            } else {
              tx.set(orderRef, { status: 'settlement', updatedAt: Date.now() }, { merge: true });
            }
          });
        } else {
          await db.collection('orders').doc(orderId).set({ status, updatedAt: Date.now() }, { merge: true });
        }

        return res.status(r.ok ? 200 : r.status).json({
          ...data,
          status,
          creditedNow,
          newBalance
        });
      }
      return res.status(400).json({ success: false, message: 'Parameter tidak lengkap.' });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, message: 'Method tidak diizinkan.' });
    }

    const { action, amount, orderId, newStatus } = req.body || {};

    // 1. Buat Deposit Top Up Saldo QRIS (Min. Rp 5.000)
    if (action === 'topup' || action === 'deposit') {
      const baseAmount = Math.floor(Number(amount || 0));
      if (!baseAmount || baseAmount < 5000) {
        return res.status(400).json({ success: false, message: 'Minimal Top Up Saldo QRIS adalah Rp 5.000.' });
      }

      const fee = Number(store.adminFee || 0);
      const url = `${CHESTPAY_BASE}/deposit?apikey=${encodeURIComponent(chestpayApiKey)}`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: String(baseAmount),
          fee: String(fee)
        })
      });
      const data = await r.json();
      if (data.status !== 'success' || !data.data) {
        return res.status(400).json({ success: false, message: data.message || 'Gagal membuat tagihan QRIS.' });
      }

      const pay = data.data;
      await db.collection('orders').doc(pay.orderId).set({
        orderId: pay.orderId,
        type: 'topup',
        uid: user.uid,
        email: user.email,
        baseAmount,
        amountToPay: pay.amountToPay,
        status: 'pending',
        credited: false,
        note: `Top Up Saldo Rp ${baseAmount.toLocaleString('id-ID')}`,
        createdAt: Date.now()
      });

      return res.status(200).json({ success: true, data: pay });
    }

    // 2. Cancel / Expire
    if (action === 'update-status') {
      if (!orderId || !['cancel', 'expire'].includes(newStatus)) {
        return res.status(400).json({ success: false, message: 'orderId atau newStatus tidak valid.' });
      }
      const url = `${CHESTPAY_BASE}/update-status?apikey=${encodeURIComponent(chestpayApiKey)}`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, newStatus })
      });
      const data = await r.json();
      await db.collection('orders').doc(orderId).set({ status: newStatus, updatedAt: Date.now() }, { merge: true });
      return res.status(r.ok ? 200 : r.status).json({ success: r.ok, data });
    }

    return res.status(400).json({ success: false, message: 'Action payment tidak dikenal.' });
  } catch (err) {
    console.error('Payment API error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Gagal memproses pembayaran.' });
  }
};
