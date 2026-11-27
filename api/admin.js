// Vercel Serverless Function — BARMODS ADMIN API
// Mengatur: User & Saldo (lihat/tambah/kurangi), Harga/Hari & Aturan Perpanjangan, Server VPN, Setting Toko & Transaksi

const { verifyUser, getStoreAndSecrets } = require('./_firebase');

module.exports = async function handler(req, res) {
  try {
    const user = await verifyUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized: silakan login dulu.' });
    }

    if (req.method === 'GET' && req.query.action === 'me') {
      return res.status(200).json({ success: true, isAdmin: user.isAdmin, email: user.email });
    }

    if (!user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: `Akses ditolak. Email ${user.email} belum terdaftar di ADMIN_EMAILS.`
      });
    }

    const { db, store, servers, chestpayApiKey } = await getStoreAndSecrets();

    // GET /api/admin -> ambil dashboard, daftar user & saldo, server, pricing, setting, dan 60 transaksi terakhir
    if (req.method === 'GET') {
      const [ordersSnap, usersSnap] = await Promise.all([
        db.collection('orders').orderBy('createdAt', 'desc').limit(60).get(),
        db.collection('users').orderBy('lastLoginAt', 'desc').limit(200).get()
      ]);

      const orders = ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const users = usersSnap.docs.map((d) => ({ id: d.id, ...d.data(), balance: Number(d.data().balance || 0) }));

      const paidTopups = orders.filter((o) => o.type === 'topup' && (o.status || '').toLowerCase() === 'settlement');
      const totalTopupRevenue = paidTopups.reduce((sum, o) => sum + Number(o.baseAmount || o.amountToPay || 0), 0);
      const totalUserBalance = users.reduce((sum, u) => sum + Number(u.balance || 0), 0);

      return res.status(200).json({
        success: true,
        adminEmail: user.email,
        store,
        servers,
        users,
        hasChestpayKey: Boolean(chestpayApiKey),
        chestpayKeyMask: chestpayApiKey ? `${chestpayApiKey.slice(0, 4)}••••${chestpayApiKey.slice(-4)}` : '',
        stats: {
          activeServers: servers.filter((s) => s.active !== false).length,
          totalServers: servers.length,
          totalUsers: users.length,
          totalUserBalance,
          totalTopupRevenue
        },
        orders
      });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, message: 'Method tidak diizinkan.' });
    }

    const { action, payload } = req.body || {};

    // 1. Tambah / Kurangi Saldo User
    if (action === 'adjust_balance') {
      const { uid, type, amount, note = '' } = payload || {};
      const numAmt = Math.floor(Number(amount || 0));
      if (!uid || !['add', 'sub'].includes(type) || numAmt <= 0) {
        return res.status(400).json({ success: false, message: 'Data saldo tidak valid.' });
      }

      const userRef = db.collection('users').doc(uid);
      let updatedBalance = 0;
      let targetEmail = '';

      await db.runTransaction(async (tx) => {
        const snap = await tx.get(userRef);
        if (!snap.exists) throw new Error('User tidak ditemukan.');
        const cur = Number(snap.data().balance || 0);
        targetEmail = snap.data().email || uid;
        updatedBalance = type === 'add' ? cur + numAmt : Math.max(0, cur - numAmt);
        tx.set(userRef, { balance: updatedBalance, updatedAt: Date.now() }, { merge: true });
      });

      const orderId = `ADM-${Date.now().toString().slice(-8)}`;
      await db.collection('orders').doc(orderId).set({
        orderId,
        type: type === 'add' ? 'admin_add' : 'admin_sub',
        uid,
        email: targetEmail,
        amountToPay: numAmt,
        status: 'settlement',
        note: note || (type === 'add' ? `Admin tambah saldo (${user.email})` : `Admin kurangi saldo (${user.email})`),
        createdAt: Date.now()
      });

      return res.status(200).json({
        success: true,
        message: `Saldo ${targetEmail} berhasil ${type === 'add' ? 'ditambah' : 'dikurangi'} Rp ${numAmt.toLocaleString('id-ID')}. Saldo baru: Rp ${updatedBalance.toLocaleString('id-ID')}`,
        balance: updatedBalance
      });
    }

    // 2. Simpan Harga Per Hari & Aturan Perpanjangan
    if (action === 'save_pricing') {
      const {
        pricePerDay,
        renewPrice,
        renewDays,
        renewMinOriginalDays,
        renewWindowDays,
        defaultQuota,
        defaultIpLimit,
        adminFee
      } = payload || {};

      const cleanPricing = {
        pricePerDay: Math.max(1, Math.floor(Number(pricePerDay) || 333)),
        renewPrice: Math.max(1, Math.floor(Number(renewPrice) || 7000)),
        renewDays: Math.max(1, Math.floor(Number(renewDays) || 30)),
        renewMinOriginalDays: Math.max(1, Math.floor(Number(renewMinOriginalDays) || 30)),
        renewWindowDays: Math.max(1, Math.floor(Number(renewWindowDays) || 3)),
        defaultQuota: Math.max(0, Math.floor(Number(defaultQuota) || 0)),
        defaultIpLimit: Math.max(0, Math.floor(Number(defaultIpLimit) || 2)),
        adminFee: Math.max(0, Math.floor(Number(adminFee) || 0))
      };

      await db.collection('settings').doc('store').set(cleanPricing, { merge: true });
      return res.status(200).json({ success: true, message: 'Pengaturan harga & perpanjangan tersimpan!', pricing: cleanPricing });
    }

    // 3. Simpan Server VPN
    if (action === 'save_servers') {
      if (!Array.isArray(payload)) return res.status(400).json({ success: false, message: 'Data server tidak valid.' });
      const cleanServers = payload
        .filter((s) => s && s.name && s.domain && s.auth)
        .map((s, idx) => ({
          id: String(s.id || `srv_${Date.now()}_${idx}`),
          name: String(s.name).trim(),
          domain: String(s.domain).trim().replace(/^https?:\/\//i, '').replace(/\/+$/, ''),
          auth: String(s.auth).trim(),
          cloudfront: String(s.cloudfront || '-').trim() || '-',
          port: String(s.port || '5888').trim(),
          active: s.active !== false
        }));

      await db.collection('private_config').doc('secrets').set({ servers: cleanServers }, { merge: true });
      return res.status(200).json({ success: true, message: 'Daftar server tersimpan!', servers: cleanServers });
    }

    // 4. Test Koneksi VPS
    if (action === 'test_server') {
      const { domain, port = '5888' } = payload || {};
      const cleanDomain = String(domain || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const r = await fetch(`http://${cleanDomain}:${port}/`, { signal: controller.signal });
        clearTimeout(timer);
        return res.status(200).json({ success: true, message: `✅ Server ${cleanDomain}:${port} merespons (HTTP ${r.status}).` });
      } catch (err) {
        clearTimeout(timer);
        return res.status(200).json({ success: false, message: `❌ Gagal konek ke ${cleanDomain}:${port}.` });
      }
    }

    // 5. Simpan Setting Toko & ChestPay Key
    if (action === 'save_settings') {
      const {
        storeName,
        tagline,
        announcement,
        maintenance,
        allowSwitchProtocol,
        waAdmin,
        waCs,
        activeProtocols,
        chestpayApiKey: newKey
      } = payload || {};

      await db.collection('settings').doc('store').set({
        storeName: String(storeName || 'BARMODS STORE').trim(),
        tagline: String(tagline || 'QRIS TOPUP SALDO • AUTO VPN').trim(),
        announcement: String(announcement || '').trim(),
        maintenance: Boolean(maintenance),
        allowSwitchProtocol: allowSwitchProtocol !== false,
        waAdmin: String(waAdmin || '6285973928253').replace(/\D/g, ''),
        waCs: String(waCs || '6285133073263').replace(/\D/g, ''),
        activeProtocols: activeProtocols || store.activeProtocols
      }, { merge: true });

      if (newKey && String(newKey).trim().length > 4) {
        await db.collection('private_config').doc('secrets').set({
          chestpayApiKey: String(newKey).trim()
        }, { merge: true });
      }

      return res.status(200).json({ success: true, message: 'Pengaturan toko tersimpan!' });
    }

    return res.status(400).json({ success: false, message: 'Action admin tidak dikenal.' });
  } catch (err) {
    console.error('Admin API error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Kesalahan server.' });
  }
};
