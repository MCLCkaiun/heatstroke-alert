const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
const OPEN_METEO_MARINE = 'https://marine-api.open-meteo.com/v1/marine';

// 風向・波向を16方位に変換
function degToDir(deg) {
    if (deg === null || deg === undefined) return '不明';
    const dirs = ['北','北北東','北東','東北東','東','東南東','南東','南南東',
                  '南','南南西','南西','西南西','西','西北西','北西','北北西'];
    return dirs[Math.round(deg / 22.5) % 16];
}

// 波浪の状況名称（ビューフォート波浪階級に準拠）
function waveLabel(height) {
    if (height === null || height === undefined) return { label: '不明', key: 'unknown' };
    if (height < 0.1) return { label: '凪（0.1m未満）',     key: 'calm' };
    if (height < 0.5) return { label: '静穏（〜0.5m）',     key: 'smooth' };
    if (height < 1.25) return { label: '穏やか（〜1.25m）', key: 'slight' };
    if (height < 2.5)  return { label: 'やや高い（〜2.5m）',key: 'moderate' };
    if (height < 4.0)  return { label: '高い（〜4.0m）',    key: 'rough' };
    if (height < 6.0)  return { label: '非常に高い（〜6m）',key: 'very_rough' };
    if (height < 9.0)  return { label: '猛烈（〜9m）',      key: 'high' };
    return               { label: '異常（9m超）',            key: 'phenomenal' };
}

// WBGT近似式（環境省方式）
function calcWBGT(temp, humidity) {
    const tw = temp * Math.atan(0.151977 * Math.pow(humidity + 8.313659, 0.5))
             + Math.atan(temp + humidity)
             - Math.atan(humidity - 1.676331)
             + 0.00391838 * Math.pow(humidity, 1.5) * Math.atan(0.023101 * humidity)
             - 4.686035;
    return 0.7 * tw + 0.2 * temp + 3;
}

// 危険度判定
function getLevel(wbgt) {
    if (wbgt < 21) return { key:'safe',    label:'安全',     icon:'✅', desc:'通常通り活動できます。引き続き水分補給を心がけてください。' };
    if (wbgt < 25) return { key:'caution', label:'注意',     icon:'⚠️', desc:'激しい運動の際は定期的に水分補給と休憩を取ってください。' };
    if (wbgt < 28) return { key:'warning', label:'警戒',     icon:'🔶', desc:'運動・作業は30分ごとに休憩。積極的に水分・塩分を補給してください。' };
    if (wbgt < 31) return { key:'danger',  label:'厳重警戒', icon:'🚨', desc:'激しい作業は原則中止。こまめな水分・塩分補給と体調確認を徹底してください。' };
    return          { key:'severe', label:'危険',     icon:'☠️', desc:'屋外作業は直ちに中止。涼しい場所に避難し、体調不良があればすぐに報告を。' };
}

// アドバイスリスト
function getAdviceList(levelKey) {
    const base = [
        { icon:'💧', text:'30分ごとに水分補給（1回あたり200〜250ml）' },
        { icon:'🧂', text:'発汗が多い場合は塩分も補給（塩飴・スポーツドリンクなど）' },
        { icon:'🧢', text:'直射日光を避け、帽子・日傘を活用する' },
    ];
    const extra = {
        warning: [{ icon:'🕐', text:'30分ごとに涼しい場所で5〜10分休憩を取る' }],
        danger:  [{ icon:'🕐', text:'こまめに体調確認し、めまい・頭痛が出たら即報告' },
                  { icon:'🏥', text:'激しい作業は避け、無理な継続は禁物' }],
        severe:  [{ icon:'🏥', text:'屋外作業を直ちに中断し涼しい場所へ移動' },
                  { icon:'❄️', text:'冷たいタオルや氷で体を冷やし医療機関へ' }],
    };
    return [...base, ...(extra[levelKey] || [])];
}

// 時計
function updateClock() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2,'0');
    const mm = String(now.getMinutes()).padStart(2,'0');
    const days = ['日','月','火','水','木','金','土'];
    document.getElementById('clock').textContent = `${hh}:${mm}`;
    document.getElementById('clock-date').textContent =
        `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日（${days[now.getDay()]}）`;
}
setInterval(updateClock, 1000);
updateClock();

// 逆ジオコーディング（地名 + 最寄り海域名）
async function getPlaceName(lat, lon) {
    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=ja`,
            {
                headers: {
                    'User-Agent': 'HeatstrokeMonitor/1.0 (https://kaiummclc.github.io/; non-commercial internal tool)'
                }
            }
        );
        const d = await res.json();
        const a = d.address || {};
        const placeName = a.city || a.town || a.village || a.county || a.state || '現在地';
        return placeName;
    } catch { return '現在地'; }
}

// 最寄り海域名を取得（現在地から最も近い海域を探す）
async function getNearestSeaName(lat, lon) {
    // 沿岸方向に少しずらして海域名を探す
    const offsets = [
        [0, 0], [0, 0.3], [0, -0.3], [0.3, 0], [-0.3, 0],
        [0.2, 0.2], [-0.2, 0.2], [0.2, -0.2], [-0.2, -0.2],
    ];
    for (const [dLat, dLon] of offsets) {
        try {
            const res = await fetch(
                `https://nominatim.openstreetmap.org/reverse?lat=${lat + dLat}&lon=${lon + dLon}&format=json&accept-language=ja`,
                {
                    headers: {
                        'User-Agent': 'HeatstrokeMonitor/1.0 (https://kaiummclc.github.io/; non-commercial internal tool)'
                    }
                }
            );
            const d = await res.json();
            const a = d.address || {};
            const sea = a.sea || a.bay || a.ocean || a.body_of_water || a.water || null;
            if (sea) return sea;
        } catch { continue; }
    }
    return null;
}

// 気象データ取得
async function fetchWeather(lat, lon) {
    const params = new URLSearchParams({
        latitude: lat, longitude: lon,
        hourly: 'temperature_2m,relativehumidity_2m,windspeed_10m,winddirection_10m',
        forecast_days: 1,
        timezone: 'Asia/Tokyo',
    });
    const res = await fetch(`${OPEN_METEO}?${params}`);
    if (!res.ok) throw new Error('API error');
    return res.json();
}

// 波浪データ取得
async function fetchMarine(lat, lon) {
    const params = new URLSearchParams({
        latitude: lat, longitude: lon,
        hourly: 'wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction',
        forecast_days: 1,
        timezone: 'Asia/Tokyo',
    });
    const res = await fetch(`${OPEN_METEO_MARINE}?${params}`);
    if (!res.ok) return null; // 陸地など取得できない場合はnullを返す
    return res.json();
}

// UI描画
function renderApp(data, marine, lat, lon, placeName, seaName) {
    const now = new Date();
    const currentHour = now.getHours();

    const hours  = data.hourly.time.map(t => parseInt(t.split('T')[1]));
    const temps  = data.hourly.temperature_2m;
    const humids = data.hourly.relativehumidity_2m;
    const winds  = data.hourly.windspeed_10m;

    let nowIdx = hours.indexOf(currentHour);
    if (nowIdx === -1) nowIdx = 0;

    const temp  = temps[nowIdx];
    const humid = humids[nowIdx];
    const wind  = winds[nowIdx];
    const wbgt  = calcWBGT(temp, humid);
    const level = getLevel(wbgt);

    document.getElementById('loading').style.display = 'none';
    document.getElementById('error').style.display = 'none';
    document.getElementById('app').style.display = 'block';

    // 位置
    document.getElementById('place-name').textContent = placeName;
    document.getElementById('place-coords').textContent =
        `${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E`;

    // ヒーロー
    const hero = document.getElementById('hero-alert');
    hero.className = `hero-alert hero-${level.key}`;
    document.getElementById('hero-icon').textContent  = level.icon;
    document.getElementById('hero-label').textContent = `現在の熱中症危険度 — WBGT ${wbgt.toFixed(1)}°C`;
    document.getElementById('hero-level').textContent = level.label;
    document.getElementById('hero-desc').textContent  = level.desc;

    // メトリクス
    document.getElementById('val-wbgt').textContent = wbgt.toFixed(1);
    document.getElementById('val-temp').innerHTML  = `${temp.toFixed(1)}<span class="metric-unit">°C</span>`;
    document.getElementById('val-humid').innerHTML = `${Math.round(humid)}<span class="metric-unit">%</span>`;
    document.getElementById('val-wind').innerHTML  = `${wind.toFixed(1)}<span class="metric-unit">m/s</span>`;

    // 風向
    const windDir = data.hourly.winddirection_10m ? data.hourly.winddirection_10m[nowIdx] : null;
    const windDirEl = document.getElementById('val-winddir');
    if (windDirEl) windDirEl.textContent = windDir !== null ? degToDir(windDir) : '--';

    // 波浪
    const marineSection = document.getElementById('marine-section');
    if (marine && marine.hourly) {
        const mh = marine.hourly;
        const waveH    = mh.wave_height    ? mh.wave_height[nowIdx]    : null;
        const waveDir  = mh.wave_direction ? mh.wave_direction[nowIdx] : null;
        const swellH   = mh.swell_wave_height    ? mh.swell_wave_height[nowIdx]    : null;
        const swellDir = mh.swell_wave_direction ? mh.swell_wave_direction[nowIdx] : null;
        const wavePeriod = mh.wave_period ? mh.wave_period[nowIdx] : null;
        const waveLv   = waveLabel(waveH);

        if (marineSection) marineSection.style.display = 'block';

        // 海域名をタイトルに表示
        const marineTitleEl = document.getElementById('marine-title');
        if (marineTitleEl) {
            marineTitleEl.textContent = seaName
                ? `🌊 波浪情報（${seaName}）`
                : '🌊 波浪情報（現在地付近の海域）';
        }

        // 波高・状況
        const elH   = document.getElementById('val-wave-height');
        const elLbl = document.getElementById('val-wave-label');
        if (elH)   elH.innerHTML = waveH !== null ? `${waveH.toFixed(1)}<span class="metric-unit">m</span>` : '--';
        if (elLbl) { elLbl.textContent = waveLv.label; elLbl.className = `wave-label-badge wave-${waveLv.key}`; }

        // 波向
        const elDir = document.getElementById('val-wave-dir');
        if (elDir) elDir.textContent = waveDir !== null ? degToDir(waveDir) : '--';

        // うねり
        const elSH  = document.getElementById('val-swell-height');
        const elSD  = document.getElementById('val-swell-dir');
        if (elSH) elSH.innerHTML  = swellH  !== null ? `${swellH.toFixed(1)}<span class="metric-unit">m</span>` : '--';
        if (elSD) elSD.textContent = swellDir !== null ? degToDir(swellDir) : '--';

        // 波周期
        const elPeriod = document.getElementById('val-wave-period');
        if (elPeriod) elPeriod.innerHTML = wavePeriod !== null ? `${wavePeriod.toFixed(0)}<span class="metric-unit">秒</span>` : '--';
    } else {
        if (marineSection) marineSection.style.display = 'none';
    }

    // ゲージ針（WBGT 0〜40°C → 0〜100%）
    const pct = Math.min(100, Math.max(0, (wbgt / 40) * 100));
    document.getElementById('gauge-needle').style.left = pct + '%';

    // 予報
    const fc = document.getElementById('forecast-items');
    fc.innerHTML = '';
    const showIdxs = [];
    for (let i = 0; i < hours.length; i++) {
        if (hours[i] >= currentHour) showIdxs.push(i);
    }
    showIdxs.slice(0, 9).forEach(idx => {
        const h  = hours[idx];
        const t  = temps[idx];
        const hu = humids[idx];
        const w  = calcWBGT(t, hu);
        const lv = getLevel(w);
        const isNow = (idx === nowIdx);

        const el = document.createElement('div');
        el.className = `forecast-item lv-${lv.key}${isNow ? ' now-item' : ''}`;
        el.innerHTML = `
            <div class="forecast-time">${isNow ? '🕐 今' : String(h).padStart(2,'0') + ':00'}</div>
            <div class="forecast-temp">${t.toFixed(0)}°</div>
            <div class="forecast-badge bg-${lv.key}">${lv.label}</div>
            <div class="forecast-humid">💧${Math.round(hu)}%</div>
        `;
        fc.appendChild(el);
    });

    // アドバイス
    const al = document.getElementById('advice-list');
    al.innerHTML = '';
    getAdviceList(level.key).forEach(item => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="adv-icon">${item.icon}</span><span>${item.text}</span>`;
        al.appendChild(li);
    });

    document.getElementById('last-update').textContent =
        `最終更新：${now.toLocaleTimeString('ja-JP')}`;
}

// エラー表示
function showError(msg) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('app').style.display = 'none';
    const err = document.getElementById('error');
    err.style.display = 'flex';
    document.getElementById('error-msg').textContent = msg;
}

// メイン
async function loadData() {
    document.getElementById('loading').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    document.getElementById('error').style.display = 'none';

    if (!navigator.geolocation) {
        showError('このブラウザは位置情報に対応していません。');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async ({ coords: { latitude: lat, longitude: lon } }) => {
            try {
                const [weatherData, marineData, placeName, seaName] = await Promise.all([
                    fetchWeather(lat, lon),
                    fetchMarine(lat, lon),
                    getPlaceName(lat, lon),
                    getNearestSeaName(lat, lon)
                ]);
                renderApp(weatherData, marineData, lat, lon, placeName, seaName);
            } catch {
                showError('気象データの取得に失敗しました。しばらくしてから再試行してください。');
            }
        },
        (err) => {
            const msgs = {
                1: '位置情報の使用が許可されていません。ブラウザの設定から許可してください。',
                2: '位置情報を取得できませんでした。',
                3: '位置情報の取得がタイムアウトしました。',
            };
            showError(msgs[err.code] || '位置情報の取得に失敗しました。');
        },
        { timeout: 10000, maximumAge: 60000 }
    );
}

document.getElementById('btn-reload').addEventListener('click', loadData);
document.getElementById('btn-retry').addEventListener('click', loadData);

loadData();