// Vercel Serverless Function — BARMODS VPN (Beli pakai Saldo, Perpanjangan H-3, Ganti Protokol)
const { verifyUser, ensureUserProfile, getStoreAndSecrets } = require('./_firebase');

function formatMessage(protocol, d, cf, storeName = 'BARMODS') {
  if (protocol === 'ssh') {
    return `╭━━━━━━━━━━━━━━━━━━━━━━╮
      🚀 *ꜱꜱʜ ᴀᴄᴄᴏᴜɴᴛ*
╰━━━━━━━━━━━━━━━━━━━━━━╯
├ 👤 Username   : \`${d.username}\`
├ 🔑 Password   : \`${d.password}\`
├ 📅 Expired    : \`${d.expired}\`
├ 🌐 IP Limit   : \`${d.ip_limit}\`
├ 🌐 Domain     : \`${d.domain}\`
├ ☁️ CloudFront : \`${cf}\`
├ 🌍 NS Domain  : \`${d.ns_domain || '-'}\`
└ 🔑 Pub Key    : \`${d.pubkey || '-'}\`

📡 HTTP Custom:
\`${d.domain}:80@${d.username}:${d.password}\`

💾 Save Account:
https://${d.domain}:81/ssh-${d.username}.txt

🎉 Terima kasih telah order di *${storeName}* ❤️`;
  }

  const map = {
    vmess: [d.vmess_tls_link, d.vmess_nontls_link, d.vmess_grpc_link, 'vmess'],
    vless: [d.vless_tls_link, d.vless_nontls_link, d.vless_grpc_link, 'vless'],
    trojan: [d.trojan_tls_link, null, d.trojan_grpc_link, 'trojan'],
    shadowsocks: [d.ss_link_ws, d.ss_link_nontls, d.ss_link_grpc, 'ss']
  };
  const [tls, http, grpc, prefix] = map[protocol];

  return `╭━━━━━━━━━━━━━━━━━━━━━━╮
   ⚡ *${protocol.toUpperCase()} ᴀᴄᴄᴏᴜɴᴛ*
╰━━━━━━━━━━━━━━━━━━━━━━╯
├ 👤 Username   : \`${d.username}\`
├ 🆔 UUID       : \`${d.uuid}\`
├ 📅 Expired    : \`${d.expired}\`
├ 📦 Quota      : \`${d.quota === '0 GB' ? 'Unlimited' : d.quota}\`
├ 🌐 IP Limit   : \`${d.ip_limit === '0' ? 'Unlimited' : d.ip_limit} IP\`
├ 🌐 Domain     : \`${d.domain}\`
└ ☁️ CloudFront : \`${cf}\`

🔗 URL TLS:
${tls || '-'}
${http ? `\n🔗 URL HTTP:\n${http}\n` : ''}
🔗 URL gRPC:
${grpc || '-'}

💾 Save Account:
https://${d.domain}:81/${prefix}-${d.username}.txt

🎉 Terima kasih telah order di *${storeName}* ❤️`;
}

async function callVpsCreate(server, protocol, { username, password, exp, quota, iplimit }) {
  const endpoint = `create${protocol}`;
  const params = new URLSearchParams({
    user: username,
    exp: String(exp),
    iplimit: String(iplimit),
    auth: server.auth
  });
  if (protocol === 'ssh') params.set('password', password || 'bar123');
  else params.set('quota', String(quota));

  const url = `http://${server.domain}:${server.port || '5888'}/${endpoint}?${params.toString()}`;
  const r = await fetch(url);
  const json = await r.json();
  if (json.status !== 'success' || !json.data) {
    throw new Error(json.message || 'Server VPS menolak permintaan.');
  }
  return json.data;
}

module.exports = async function handler(req, res) {
  try {
    const { db, store, servers } = await getStoreAndSecrets();

    // GET /api/vpn?action=config -> konfigurasi publik toko + harga per hari & aturan perpanjangan
    if (req.method === 'GET' && req.query.action === 'config') {
      const activeServers = servers
        .filter((s) => s.active !== false)
        .map((s) => ({ id: s.id, name: s.name }));

      return res.status(200).json({
        success: true,
        store: {
          storeName: store.storeName,
          tagline: store.tagline,
          announcement: store.announcement,
          maintenance: Boolean(store.maintenance),
          allowSwitchProtocol: store.allowSwitchProtocol !== false,
          waAdmin: store.waAdmin || '6285973928253',
          waCs: store.waCs || '6285133073263',
          pricePerDay: Number(store.pricePerDay || 333),
          renewPrice: Number(store.renewPrice || 7000),
          renewDays: Number(store.renewDays || 30),
          renewMinOriginalDays: Number(store.renewMinOriginalDays || 30),
          renewWindowDays: Number(store.renewWindowDays || 3),
          defaultQuota: Number(store.defaultQuota || 0),
          defaultIpLimit: Number(store.defaultIpLimit || 2),
          adminFee: Number(store.adminFee || 500),
          activeProtocols: store.activeProtocols
        },
        servers: activeServers,
        firebase: process.env.FIREBASE_API_KEY ? {
          apiKey: process.env.FIREBASE_API_KEY,
          authDomain: process.env.FIREBASE_AUTH_DOMAIN,
          projectId: process.env.FIREBASE_PROJECT_ID,
          appId: process.env.FIREBASE_APP_ID
        } : null
      });
    }

    const user = await verifyUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Silakan login terlebih dahulu.' });
    }
    const profile = await ensureUserProfile(db, user);

    // GET /api/vpn?action=me -> sync profil & saldo user
    if (req.method === 'GET' && req.query.action === 'me') {
      return res.status(200).json({
        success: true,
        isAdmin: user.isAdmin,
        balance: Number(profile.balance || 0),
        email: user.email
      });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, message: 'Method tidak diizinkan.' });
    }

    const {
      action = 'buy', // 'buy' | 'renew' | 'switch'
      protocol = 'ssh',
      username = '',
      password = 'bar123',
      days = 30,
      serverId = '',
      accountId = ''
    } = req.body || {};

    const validProtocols = ['ssh', 'vmess', 'vless', 'trojan', 'shadowsocks'];
    const activeServers = servers.filter((s) => s.active !== false);
    const userRef = db.collection('users').doc(user.uid);
    const accCol = userRef.collection('accounts');

    // === 1. BELI VPN PAKAI SALDO (Harga: days * pricePerDay, default Rp 333/hari) ===
    if (action === 'buy') {
      if (store.maintenance) {
        return res.status(503).json({ success: false, message: 'Toko sedang maintenance.' });
      }
      if (!username || /\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
        return res.status(400).json({ success: false, message: '❌ Username hanya boleh huruf & angka tanpa spasi.' });
      }
      if (!validProtocols.includes(protocol) || store.activeProtocols?.[protocol] === false) {
        return res.status(400).json({ success: false, message: '❌ Protokol sedang dinonaktifkan admin.' });
      }

      const buyDays = Math.max(1, Math.min(365, Math.floor(Number(days) || 1)));
      const pricePerDay = Number(store.pricePerDay || 333);
      const totalCost = buyDays * pricePerDay;

      const server = activeServers.find((s) => s.id === String(serverId)) || activeServers[0];
      if (!server || !server.domain || !server.auth) {
        return res.status(500).json({ success: false, message: '❌ Belum ada server aktif di Panel Admin.' });
      }

      // Potong saldo secara atomik
      let balanceAfter = 0;
      await db.runTransaction(async (tx) => {
        const uSnap = await tx.get(userRef);
        const curBal = uSnap.exists ? Number(uSnap.data().balance || 0) : 0;
        if (curBal < totalCost) {
          throw new Error(`INSUFFICIENT_BALANCE:${curBal}:${totalCost}`);
        }
        balanceAfter = curBal - totalCost;
        tx.set(userRef, { balance: balanceAfter, updatedAt: Date.now() }, { merge: true });
      }).catch((err) => {
        if (String(err.message).startsWith('INSUFFICIENT_BALANCE:')) {
          const [, cur, need] = err.message.split(':');
          throw new Error(`Saldo tidak cukup (Saldo: Rp ${Number(cur).toLocaleString('id-ID')}, Butuh: Rp ${Number(need).toLocaleString('id-ID')}). Silakan Top Up Saldo dulu!`);
        }
        throw err;
      });

      // Buat akun ke VPS — jika gagal, otomatis refund saldo!
      let vpsData;
      try {
        vpsData = await callVpsCreate(server, protocol, {
          username,
          password,
          exp: buyDays,
          quota: Number(store.defaultQuota || 0),
          iplimit: Number(store.defaultIpLimit || 2)
        });
      } catch (vpsErr) {
        // Refund otomatis
        await db.runTransaction(async (tx) => {
          const uSnap = await tx.get(userRef);
          const curBal = uSnap.exists ? Number(uSnap.data().balance || 0) : 0;
          tx.set(userRef, { balance: curBal + totalCost, updatedAt: Date.now() }, { merge: true });
        });
        return res.status(502).json({
          success: false,
          message: `❌ Gagal membuat akun di VPS (${vpsErr.message}). Saldo Rp ${totalCost.toLocaleString('id-ID')} sudah dikembalikan otomatis.`
        });
      }

      const now = Date.now();
      const expiresAt = now + buyDays * 86400000;
      const eligibleForRenew = buyDays >= Number(store.renewMinOriginalDays || 30);
      const orderId = `VPN-${Date.now().toString().slice(-8)}`;

      const accPayload = {
        orderId,
        protocol,
        username: vpsData.username || username,
        password: protocol === 'ssh' ? (vpsData.password || password) : '',
        exp: buyDays,
        originalDays: buyDays,
        eligibleForRenew,
        expiresAt,
        expired: vpsData.expired || new Date(expiresAt).toISOString().slice(0, 10),
        quota: Number(store.defaultQuota || 0),
        iplimit: Number(store.defaultIpLimit || 2),
        serverId: server.id,
        serverName: server.name,
        message: formatMessage(protocol, vpsData, server.cloudfront || '-', store.storeName),
        createdAt: now,
        updatedAt: now
      };

      const added = await accCol.add(accPayload);
      await db.collection('orders').doc(orderId).set({
        orderId,
        type: 'buy_vpn',
        uid: user.uid,
        email: user.email,
        protocol,
        username: accPayload.username,
        days: buyDays,
        amountToPay: totalCost,
        status: 'settlement',
        note: `Beli ${protocol.toUpperCase()} ${buyDays} Hari (Saldo)`,
        createdAt: now
      });

      return res.status(200).json({
        success: true,
        balance: balanceAfter,
        account: { id: added.id, ...accPayload }
      });
    }

    // === 2. PERPANJANGAN AKUN (Default Rp 7.000/bln, Wajib beli 30 hari & H-3 sebelum exp) ===
    if (action === 'renew') {
      if (!accountId) return res.status(400).json({ success: false, message: 'accountId wajib diisi.' });
      const accSnap = await accCol.doc(accountId).get();
      if (!accSnap.exists) return res.status(404).json({ success: false, message: 'Akun VPN tidak ditemukan.' });

      const acc = accSnap.data();
      const minDays = Number(store.renewMinOriginalDays || 30);
      const windowDays = Number(store.renewWindowDays || 3);
      const renewPrice = Number(store.renewPrice || 7000);
      const renewDays = Number(store.renewDays || 30);

      const isEligible = acc.eligibleForRenew === true || Number(acc.originalDays || acc.exp || 0) >= minDays;
      if (!isEligible) {
        return res.status(400).json({
          success: false,
          message: `❌ Perpanjangan hemat Rp ${renewPrice.toLocaleString('id-ID')}/bulan hanya berlaku untuk akun pembelian minimal ${minDays} hari.`
        });
      }

      const expMs = Number(acc.expiresAt || 0);
      const daysLeft = Math.ceil((expMs - Date.now()) / 86400000);
      if (daysLeft < 0) {
        return res.status(400).json({
          success: false,
          message: '❌ Akun sudah melewati masa expired. Silakan buat akun baru.'
        });
      }
      if (daysLeft > windowDays) {
        return res.status(400).json({
          success: false,
          message: `❌ Perpanjangan hanya bisa dilakukan maksimal ${windowDays} hari sebelum expired (sisa akun kamu masih ${daysLeft} hari).`
        });
      }

      const server = activeServers.find((s) => s.id === String(acc.serverId)) || activeServers[0];
      if (!server) return res.status(500).json({ success: false, message: '❌ Server tidak tersedia.' });

      // Potong saldo Rp 7.000
      let balanceAfter = 0;
      await db.runTransaction(async (tx) => {
        const uSnap = await tx.get(userRef);
        const curBal = uSnap.exists ? Number(uSnap.data().balance || 0) : 0;
        if (curBal < renewPrice) {
          throw new Error(`Saldo tidak cukup untuk perpanjangan Rp ${renewPrice.toLocaleString('id-ID')} (Saldo kamu: Rp ${curBal.toLocaleString('id-ID')}).`);
        }
        balanceAfter = curBal - renewPrice;
        tx.set(userRef, { balance: balanceAfter, updatedAt: Date.now() }, { merge: true });
      });

      const totalNewDays = Math.max(renewDays, daysLeft + renewDays);
      let vpsData;
      try {
        vpsData = await callVpsCreate(server, acc.protocol, {
          username: acc.username,
          password: acc.password || 'bar123',
          exp: totalNewDays,
          quota: Number(acc.quota || 0),
          iplimit: Number(acc.iplimit || 2)
        });
      } catch (vpsErr) {
        await db.runTransaction(async (tx) => {
          const uSnap = await tx.get(userRef);
          const curBal = uSnap.exists ? Number(uSnap.data().balance || 0) : 0;
          tx.set(userRef, { balance: curBal + renewPrice, updatedAt: Date.now() }, { merge: true });
        });
        return res.status(502).json({
          success: false,
          message: `❌ Gagal perpanjang di VPS (${vpsErr.message}). Saldo Rp ${renewPrice.toLocaleString('id-ID')} dikembalikan.`
        });
      }

      const now = Date.now();
      const newExpiresAt = Math.max(now, expMs) + renewDays * 86400000;
      const orderId = `RNW-${now.toString().slice(-8)}`;
      const updatedAcc = {
        ...acc,
        expiresAt: newExpiresAt,
        expired: vpsData.expired || new Date(newExpiresAt).toISOString().slice(0, 10),
        message: formatMessage(acc.protocol, vpsData, server.cloudfront || '-', store.storeName),
        updatedAt: now
      };

      await accCol.doc(accountId).set(updatedAcc, { merge: true });
      await db.collection('orders').doc(orderId).set({
        orderId,
        type: 'renew_vpn',
        uid: user.uid,
        email: user.email,
        protocol: acc.protocol,
        username: acc.username,
        days: renewDays,
        amountToPay: renewPrice,
        status: 'settlement',
        note: `Perpanjang ${acc.protocol.toUpperCase()} +${renewDays} Hari`,
        createdAt: now
      });

      return res.status(200).json({
        success: true,
        balance: balanceAfter,
        account: { id: accountId, ...updatedAcc }
      });
    }

    // === 3. GANTI PROTOKOL ===
    if (action === 'switch') {
      if (store.allowSwitchProtocol === false) {
        return res.status(403).json({ success: false, message: '❌ Fitur ganti protokol sedang dinonaktifkan admin.' });
      }
      if (!accountId) return res.status(400).json({ success: false, message: 'accountId wajib diisi.' });
      if (!validProtocols.includes(protocol) || store.activeProtocols?.[protocol] === false) {
        return res.status(400).json({ success: false, message: '❌ Protokol tujuan tidak tersedia.' });
      }

      const accSnap = await accCol.doc(accountId).get();
      if (!accSnap.exists) return res.status(404).json({ success: false, message: 'Akun VPN tidak ditemukan.' });
      const oldAcc = accSnap.data();

      const remainingDays = Math.max(1, Math.ceil((Number(oldAcc.expiresAt || Date.now()) - Date.now()) / 86400000));
      const server = activeServers.find((s) => s.id === String(oldAcc.serverId)) || activeServers[0];
      if (!server) return res.status(500).json({ success: false, message: '❌ Server tidak tersedia.' });

      const newUser = username && !/\s/.test(username) ? username : `${oldAcc.username}${Math.floor(Math.random() * 90 + 10)}`;
      const vpsData = await callVpsCreate(server, protocol, {
        username: newUser,
        password: password || 'bar123',
        exp: remainingDays,
        quota: Number(oldAcc.quota || 0),
        iplimit: Number(oldAcc.iplimit || 2)
      });

      const updatedAcc = {
        ...oldAcc,
        protocol,
        username: vpsData.username || newUser,
        password: protocol === 'ssh' ? (vpsData.password || password) : '',
        message: formatMessage(protocol, vpsData, server.cloudfront || '-', store.storeName),
        updatedAt: Date.now()
      };
      await accCol.doc(accountId).set(updatedAcc, { merge: true });

      return res.status(200).json({ success: true, account: { id: accountId, ...updatedAcc } });
    }

    return res.status(400).json({ success: false, message: 'Action tidak dikenal.' });
  } catch (err) {
    console.error('VPN API error:', err);
    return res.status(400).json({ success: false, message: err.message || 'Gagal memproses permintaan.' });
  }
};
