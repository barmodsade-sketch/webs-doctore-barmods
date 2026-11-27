// Vercel Serverless Function — BARMODS FREE TOOLS (BOTCAHX API dari .env)
// Fitur: AI Barmods (Chat + Image), TikTok (BOTCAHX+TikWM), YT Play MP3,
// Multi-Uploader URL, FakeChat (IQC), Brat (Img/Vid), SS Web (PC/HP), Pinterest Slide

const REAL_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const AI_STYLES = {
  flataipro: 'High Quality Masterpiece',
  realistic: 'Hyper Realistic Photography',
  cinema: 'Cinematic Lighting',
  'ghibli-style': 'Studio Ghibli Artstyle',
  retro_anime: '90s Retro Anime',
  robot_cyborg: 'Cyberpunk Mecha Cyborg',
  pixel_art: '16-bit Pixel Art',
  watercolor_painting: 'Beautiful Watercolor Painting'
};

function getBotcahxKey() {
  return process.env.BOTCAHX_API_KEY || '';
}

async function fetchAsDataUrl(url) {
  const r = await fetch(url, { headers: { 'User-Agent': REAL_UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const ct = r.headers.get('content-type') || 'image/png';
  if (ct.includes('application/json')) {
    const json = await r.json();
    const imgUrl = json.result || json.url || json.data;
    if (typeof imgUrl === 'string' && imgUrl.startsWith('http')) {
      return fetchAsDataUrl(imgUrl);
    }
    throw new Error(json.message || 'API mengembalikan JSON tanpa media.');
  }
  const buf = Buffer.from(await r.arrayBuffer());
  return { dataUrl: `data:${ct.split(';')[0]};base64,${buf.toString('base64')}`, contentType: ct };
}

async function uploadToHost(name, buffer, filename, mimeType) {
  const blob = new Blob([buffer], { type: mimeType || 'application/octet-stream' });
  const form = new FormData();

  if (name === 'catbox') {
    form.append('reqtype', 'fileupload');
    form.append('fileToUpload', blob, filename);
    const r = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: form, headers: { 'User-Agent': REAL_UA } });
    const txt = (await r.text()).trim();
    if (!txt.startsWith('http')) throw new Error('Catbox gagal');
    return txt;
  }
  if (name === 'yupra') {
    form.append('files', blob, filename);
    const r = await fetch('https://cdn.yupra.my.id/upload', { method: 'POST', body: form, headers: { 'User-Agent': REAL_UA } });
    const d = await r.json();
    if (!d?.files?.[0]?.url) throw new Error('Yupra gagal');
    return `https://cdn.yupra.my.id${d.files[0].url}`;
  }
  if (name === 'quax') {
    form.append('files[]', blob, filename);
    form.append('expiry', '-1');
    const r = await fetch('https://qu.ax/upload.php', { method: 'POST', body: form, headers: { 'User-Agent': REAL_UA } });
    const d = await r.json();
    if (!d?.files?.[0]?.url) throw new Error('Quax gagal');
    return d.files[0].url;
  }
  if (name === 'fadzzz') {
    form.append('file', blob, filename);
    const r = await fetch('https://fadzzzcloud.my.id/upload', { method: 'POST', body: form, headers: { 'User-Agent': REAL_UA } });
    const d = await r.json();
    if (!d?.url) throw new Error('Fadzzz gagal');
    return d.url;
  }
  throw new Error('Uploader tidak dikenal');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method tidak diizinkan.' });
  }

  const { tool, text, url, mode, style, device, history, fileBase64, fileName, mimeType } = req.body || {};
  const apiKey = getBotcahxKey();

  try {
    // 1. AI BARMODS (Chat VPN Expert & Image Generator)
    if (tool === 'ai_chat') {
      if (!apiKey) return res.status(500).json({ success: false, message: 'BOTCAHX_API_KEY belum diisi di .env Vercel.' });
      const prompt = String(text || '').trim();
      if (!prompt) return res.status(400).json({ success: false, message: 'Pertanyaan tidak boleh kosong.' });

      const systemPrompt = 'Kamu adalah Assistant X (AI Barmods), asisten AI pintar ciptaan BARMODS STORE. Kamu pakar jaringan tunneling VPN (SSH, VMess, VLESS, Trojan, Shadowsocks, Xray, Cloudflare, VPS Linux) sekaligus asisten umum yang ramah, ringkas, jelas, dan solutif berbahasa Indonesia.';
      const messages = [{ role: 'system', content: systemPrompt }];
      if (Array.isArray(history)) {
        history.slice(-4).forEach((m) => {
          if (m && m.role && m.content) messages.push({ role: m.role, content: String(m.content) });
        });
      }
      messages.push({ role: 'user', content: prompt });

      const r = await fetch('https://api.botcahx.eu.org/api/search/openai-custom-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': REAL_UA },
        body: JSON.stringify({ message: messages, apikey: apiKey })
      });
      const data = await r.json();
      const reply = data?.result || data?.data?.result || data?.message || '';
      if (!reply || typeof reply !== 'string') throw new Error('Respons AI kosong.');
      return res.status(200).json({ success: true, reply: reply.trim() });
    }

    if (tool === 'ai_image') {
      if (!apiKey) return res.status(500).json({ success: false, message: 'BOTCAHX_API_KEY belum diisi di .env Vercel.' });
      const prompt = String(text || '').trim();
      if (!prompt) return res.status(400).json({ success: false, message: 'Prompt gambar kosong.' });
      const chosenStyle = AI_STYLES[style] || AI_STYLES.flataipro;
      const fullPrompt = `${prompt}, detailed, ${chosenStyle}`;
      const apiUrl = `https://api.botcahx.eu.org/api/search/openai-image?text=${encodeURIComponent(fullPrompt)}&apikey=${encodeURIComponent(apiKey)}`;
      const media = await fetchAsDataUrl(apiUrl);
      return res.status(200).json({ success: true, dataUrl: media.dataUrl, style: chosenStyle });
    }

    // 2. TIKTOK DOWNLOADER (BOTCAHX + TikWM)
    if (tool === 'tiktok') {
      const target = String(url || '').trim();
      if (!/tiktok\.com|douyin/i.test(target)) {
        return res.status(400).json({ success: false, message: 'Masukkan link TikTok yang valid.' });
      }
      let videos = [], audios = [], images = [];
      let meta = { title: 'Video TikTok', author: '-', music: '-', duration: '-', source: '' };

      if (apiKey) {
        try {
          const r1 = await fetch(`https://api.botcahx.eu.org/api/dowloader/tiktok?url=${encodeURIComponent(target)}&apikey=${encodeURIComponent(apiKey)}`, { headers: { 'User-Agent': REAL_UA } });
          const d1 = await r1.json();
          const root = d1?.result || d1?.data;
          if (root) {
            if (Array.isArray(root.video)) videos.push(...root.video);
            else if (root.video) videos.push(root.video);
            if (Array.isArray(root.audio)) audios.push(...root.audio);
            else if (root.audio) audios.push(root.audio);
            if (Array.isArray(root.images)) images.push(...root.images);
            if (root.title) meta.title = root.title;
            meta.source = 'BOTCAHX';
          }
        } catch (e) {}
      }

      try {
        const r2 = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(target)}&hd=1`, { headers: { 'User-Agent': REAL_UA } });
        const d2 = await r2.json();
        if (d2?.code === 0 && d2.data) {
          const root = d2.data;
          if (root.hdplay) videos.unshift(root.hdplay);
          if (root.play) videos.push(root.play);
          if (root.music) audios.push(root.music);
          if (Array.isArray(root.images)) images.push(...root.images);
          meta.title = root.title || meta.title;
          meta.author = root.author?.nickname || root.author?.unique_id || '-';
          meta.music = root.music_info?.title || '-';
          meta.duration = root.duration ? `${root.duration} detik` : '-';
          meta.source = meta.source ? 'BOTCAHX + TikWM' : 'TikWM';
        }
      } catch (e) {}

      videos = [...new Set(videos.filter((u) => typeof u === 'string' && u.startsWith('http')))];
      audios = [...new Set(audios.filter((u) => typeof u === 'string' && u.startsWith('http')))];
      images = [...new Set(images.filter((u) => typeof u === 'string' && u.startsWith('http')))];

      if (!videos.length && !images.length && !audios.length) {
        return res.status(400).json({ success: false, message: 'Media TikTok tidak ditemukan atau video private.' });
      }
      return res.status(200).json({ success: true, ...meta, videos, audios, images });
    }

    // 3. YOUTUBE PLAY / MP3 (BOTCAHX)
    if (tool === 'ytplay') {
      if (!apiKey) return res.status(500).json({ success: false, message: 'BOTCAHX_API_KEY belum diisi di .env Vercel.' });
      const query = String(text || url || '').trim();
      if (!query) return res.status(400).json({ success: false, message: 'Masukkan judul lagu atau link YouTube.' });

      let ytUrl = query;
      let info = { title: 'YouTube Audio', thumbnail: '', duration: '' };

      // Jika bukan link YouTube, cari dulu via BOTCAHX yts
      if (!/^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)/i.test(query)) {
        const sr = await fetch(`https://api.botcahx.eu.org/api/search/yts?query=${encodeURIComponent(query)}&apikey=${encodeURIComponent(apiKey)}`, { headers: { 'User-Agent': REAL_UA } });
        const sd = await sr.json();
        const list = sd?.result || sd?.data || [];
        const first = Array.isArray(list) ? list.find((v) => v.url && v.url.includes('watch')) || list[0] : null;
        if (!first || !first.url) {
          return res.status(404).json({ success: false, message: 'Lagu YouTube tidak ditemukan.' });
        }
        ytUrl = first.url;
        info.title = first.title || query;
        info.thumbnail = first.thumbnail || first.image || '';
        info.duration = first.timestamp || first.duration || '';
      }

      const dr = await fetch(`https://api.botcahx.eu.org/api/dowloader/yt?url=${encodeURIComponent(ytUrl)}&apikey=${encodeURIComponent(apiKey)}`, { headers: { 'User-Agent': REAL_UA } });
      const dd = await dr.json();
      const root = dd?.result || dd?.data?.result || dd?.data || dd;
      const audioUrl = root?.mp3 || root?.audio || root?.url_audio || root?.download?.mp3 || root?.url || '';
      const videoUrl = root?.mp4 || root?.video || root?.download?.mp4 || '';
      if (!audioUrl && !videoUrl) {
        return res.status(400).json({ success: false, message: 'Gagal mengambil link audio dari BOTCAHX. Coba ulangi beberapa detik lagi.' });
      }
      return res.status(200).json({
        success: true,
        title: root?.title || info.title,
        thumbnail: root?.thumb || root?.thumbnail || info.thumbnail,
        duration: root?.duration || info.duration,
        ytUrl,
        audioUrl,
        videoUrl
      });
    }

    // 4. MULTI-UPLOADER URL (Catbox, Yupra, Quax, Fadzzz)
    if (tool === 'tourl') {
      if (!fileBase64) return res.status(400).json({ success: false, message: 'Pilih file terlebih dahulu.' });
      const cleanB64 = String(fileBase64).includes(',') ? String(fileBase64).split(',')[1] : String(fileBase64);
      const buffer = Buffer.from(cleanB64, 'base64');
      if (buffer.length > 4 * 1024 * 1024) {
        return res.status(413).json({ success: false, message: 'Ukuran file maksimal 4MB di Vercel.' });
      }
      const fname = String(fileName || 'barmods-file.png').replace(/[^a-zA-Z0-9._-]/g, '');
      const hosts = ['catbox', 'yupra', 'quax', 'fadzzz'];
      const settled = await Promise.allSettled(hosts.map((h) => uploadToHost(h, buffer, fname, mimeType)));
      const results = hosts.map((h, i) => ({
        host: h.toUpperCase(),
        ok: settled[i].status === 'fulfilled',
        url: settled[i].status === 'fulfilled' ? settled[i].value : ''
      }));
      return res.status(200).json({ success: true, results });
    }

    // 5. FAKECHAT IPHONE (IQC)
    if (tool === 'iqc') {
      if (!apiKey) return res.status(500).json({ success: false, message: 'BOTCAHX_API_KEY belum diisi di .env Vercel.' });
      const txt = String(text || '').trim();
      if (!txt) return res.status(400).json({ success: false, message: 'Masukkan teks FakeChat dulu.' });
      const apiUrl = `https://api.botcahx.eu.org/api/maker/iqc?text=${encodeURIComponent(txt)}&apikey=${encodeURIComponent(apiKey)}`;
      const media = await fetchAsDataUrl(apiUrl);
      return res.status(200).json({ success: true, dataUrl: media.dataUrl });
    }

    // 6. BRAT GENERATOR (Gambar & Video)
    if (tool === 'brat') {
      if (!apiKey) return res.status(500).json({ success: false, message: 'BOTCAHX_API_KEY belum diisi di .env Vercel.' });
      const txt = String(text || '').trim();
      if (!txt) return res.status(400).json({ success: false, message: 'Masukkan kata-kata Brat dulu.' });
      const ep = mode === 'video' ? 'bratvid' : 'brat';
      const apiUrl = `https://api.botcahx.eu.org/api/maker/${ep}?text=${encodeURIComponent(txt)}&apikey=${encodeURIComponent(apiKey)}`;
      const media = await fetchAsDataUrl(apiUrl);
      return res.status(200).json({ success: true, dataUrl: media.dataUrl, isVideo: mode === 'video' });
    }

    // 7. SS WEB (Desktop PC / Mobile HP)
    if (tool === 'ssweb') {
      if (!apiKey) return res.status(500).json({ success: false, message: 'BOTCAHX_API_KEY belum diisi di .env Vercel.' });
      let target = String(url || '').trim();
      if (!target) return res.status(400).json({ success: false, message: 'Masukkan URL website dulu.' });
      if (!/^https?:\/\//i.test(target)) target = 'https://' + target;
      const dev = device === 'mobile' ? 'mobile' : 'desktop';
      const apiUrl = `https://api.botcahx.eu.org/api/tools/ssweb?url=${encodeURIComponent(target)}&device=${dev}&apikey=${encodeURIComponent(apiKey)}`;
      const media = await fetchAsDataUrl(apiUrl);
      return res.status(200).json({ success: true, dataUrl: media.dataUrl, url: target, device: dev });
    }

    // 8. PINTEREST SEARCH (Direct Scraper Carousel Slide)
    if (tool === 'pinterest') {
      const q = String(text || '').trim();
      if (!q) return res.status(400).json({ success: false, message: 'Masukkan kata kunci pencarian Pinterest.' });
      const queryData = JSON.stringify({ options: { query: encodeURIComponent(q) } });
      const scrapeUrl = 'https://www.pinterest.com/resource/BaseSearchResource/get/?data=' + encodeURIComponent(queryData);
      const r = await fetch(scrapeUrl, {
        method: 'HEAD',
        headers: {
          'screen-dpr': '4',
          'x-pinterest-pws-handler': 'www/search/[scope].js',
          'User-Agent': REAL_UA
        }
      });
      const linkHeader = r.headers.get('link') || '';
      let images = [];
      if (linkHeader) {
        const urls = [...linkHeader.matchAll(/<(.*?)>/gm)].map((a) => a[1]);
        images = [...new Set(urls.filter((u) => u.includes('pinimg.com') && (u.endsWith('.jpg') || u.endsWith('.png'))))].slice(0, 10);
      }
      if (!images.length) {
        return res.status(404).json({ success: false, message: `Gambar Pinterest tidak ditemukan untuk "${q}".` });
      }
      return res.status(200).json({ success: true, query: q, images });
    }

    return res.status(400).json({ success: false, message: 'Tool tidak dikenal.' });
  } catch (err) {
    console.error('Tools API error:', err);
    return res.status(502).json({ success: false, message: err.message || 'Gagal memproses tool.' });
  }
};
