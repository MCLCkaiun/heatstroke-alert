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

// 国土交通省 国際戦略港湾・国際拠点港湾・重要港湾 全収録（2025年4月現在）
const SEA_AREAS = [
    // ===== 北海道 =====
    { name: '室蘭港',         lat: 42.317, lon: 140.983 },
    { name: '苫小牧港',       lat: 42.633, lon: 141.617 },
    { name: '函館港',         lat: 41.767, lon: 140.717 },
    { name: '小樽港',         lat: 43.183, lon: 141.000 },
    { name: '釧路港',         lat: 42.983, lon: 144.383 },
    { name: '留萌港',         lat: 43.933, lon: 141.633 },
    { name: '稚内港',         lat: 45.400, lon: 141.683 },
    { name: '十勝港',         lat: 42.767, lon: 143.700 },
    { name: '石狩湾新港',     lat: 43.267, lon: 141.233 },
    { name: '紋別港',         lat: 44.350, lon: 143.350 },
    { name: '網走港',         lat: 44.017, lon: 144.267 },
    { name: '根室港',         lat: 43.333, lon: 145.583 },
    // ===== 青森県 =====
    { name: '青森港',         lat: 40.817, lon: 140.717 },
    { name: 'むつ小川原港',   lat: 40.950, lon: 141.383 },
    { name: '八戸港',         lat: 40.533, lon: 141.533 },
    // ===== 岩手県 =====
    { name: '久慈港',         lat: 40.183, lon: 141.767 },
    { name: '宮古港',         lat: 39.650, lon: 141.967 },
    { name: '釜石港',         lat: 39.267, lon: 141.883 },
    { name: '大船渡港',       lat: 39.083, lon: 141.733 },
    // ===== 宮城県 =====
    { name: '仙台港',         lat: 38.267, lon: 141.017 },
    { name: '塩釜港',         lat: 38.317, lon: 141.017 },
    { name: '石巻港',         lat: 38.433, lon: 141.300 },
    // ===== 秋田県 =====
    { name: '能代港',         lat: 40.200, lon: 140.017 },
    { name: '船川港',         lat: 39.883, lon: 139.833 },
    { name: '秋田港',         lat: 39.750, lon: 140.083 },
    // ===== 山形県 =====
    { name: '酒田港',         lat: 38.917, lon: 139.833 },
    // ===== 福島県 =====
    { name: '相馬港',         lat: 37.833, lon: 140.967 },
    { name: '小名浜港',       lat: 36.933, lon: 140.900 },
    // ===== 茨城県 =====
    { name: '鹿島港',         lat: 35.950, lon: 140.650 },
    { name: '常陸那珂港',     lat: 36.533, lon: 140.617 },
    { name: '日立港',         lat: 36.583, lon: 140.650 },
    { name: '大洗港',         lat: 36.317, lon: 140.583 },
    // ===== 千葉県 =====
    { name: '千葉港',         lat: 35.567, lon: 140.050 },
    { name: '木更津港',       lat: 35.383, lon: 139.917 },
    // ===== 東京都 =====
    { name: '東京港',         lat: 35.633, lon: 139.783 },
    // ===== 神奈川県 =====
    { name: '横浜港',         lat: 35.444, lon: 139.641 },
    { name: '川崎港',         lat: 35.508, lon: 139.758 },
    { name: '横須賀港',       lat: 35.283, lon: 139.667 },
    // ===== 新潟県 =====
    { name: '新潟西港',       lat: 37.917, lon: 139.050 },
    { name: '新潟東港',       lat: 37.967, lon: 139.183 },
    { name: '直江津港',       lat: 37.150, lon: 138.233 },
    { name: '両津港',         lat: 38.067, lon: 138.433 },
    { name: '小木港',         lat: 37.833, lon: 138.267 },
    // ===== 富山県 =====
    { name: '伏木富山港',     lat: 36.783, lon: 137.050 },
    // ===== 石川県 =====
    { name: '金沢港',         lat: 36.583, lon: 136.617 },
    { name: '七尾港',         lat: 37.050, lon: 136.967 },
    // ===== 福井県 =====
    { name: '敦賀港',         lat: 35.650, lon: 136.067 },
    // ===== 静岡県 =====
    { name: '清水港',         lat: 35.017, lon: 138.500 },
    { name: '田子の浦港',     lat: 35.133, lon: 138.683 },
    { name: '御前崎港',       lat: 34.600, lon: 138.217 },
    // ===== 愛知県 =====
    { name: '名古屋港',       lat: 35.083, lon: 136.883 },
    { name: '三河港',         lat: 34.733, lon: 137.150 },
    { name: '衣浦港',         lat: 34.933, lon: 136.950 },
    // ===== 三重県 =====
    { name: '四日市港',       lat: 34.967, lon: 136.617 },
    { name: '津松阪港',       lat: 34.683, lon: 136.533 },
    { name: '尾鷲港',         lat: 34.067, lon: 136.200 },
    // ===== 京都府 =====
    { name: '舞鶴港',         lat: 35.467, lon: 135.383 },
    // ===== 大阪府 =====
    { name: '大阪港',         lat: 34.650, lon: 135.417 },
    { name: '堺泉北港',       lat: 34.533, lon: 135.433 },
    { name: '阪南港',         lat: 34.350, lon: 135.283 },
    // ===== 兵庫県 =====
    { name: '神戸港',         lat: 34.683, lon: 135.183 },
    { name: '姫路港',         lat: 34.800, lon: 134.683 },
    { name: '尼崎西宮芦屋港', lat: 34.717, lon: 135.383 },
    { name: '東播磨港',       lat: 34.717, lon: 134.917 },
    // ===== 和歌山県 =====
    { name: '和歌山下津港',   lat: 34.183, lon: 135.183 },
    { name: '日高港',         lat: 33.900, lon: 135.133 },
    // ===== 鳥取県 =====
    { name: '鳥取港',         lat: 35.517, lon: 134.217 },
    { name: '境港',           lat: 35.533, lon: 133.233 },
    // ===== 島根県 =====
    { name: '西郷港',         lat: 36.200, lon: 133.333 },
    { name: '浜田港',         lat: 34.900, lon: 132.083 },
    { name: '三隅港',         lat: 34.667, lon: 131.967 },
    // ===== 岡山県 =====
    { name: '水島港',         lat: 34.483, lon: 133.783 },
    { name: '岡山港',         lat: 34.617, lon: 133.967 },
    { name: '宇野港',         lat: 34.483, lon: 133.950 },
    // ===== 広島県 =====
    { name: '広島港',         lat: 34.350, lon: 132.467 },
    { name: '福山港',         lat: 34.467, lon: 133.383 },
    { name: '尾道糸崎港',     lat: 34.400, lon: 133.200 },
    { name: '呉港',           lat: 34.233, lon: 132.567 },
    // ===== 山口県 =====
    { name: '下関港',         lat: 33.950, lon: 130.933 },
    { name: '徳山下松港',     lat: 34.050, lon: 131.800 },
    { name: '岩国港',         lat: 34.167, lon: 132.217 },
    { name: '三田尻中関港',   lat: 34.017, lon: 131.567 },
    { name: '宇部港',         lat: 33.950, lon: 131.233 },
    { name: '小野田港',       lat: 33.983, lon: 131.167 },
    // ===== 徳島県 =====
    { name: '徳島小松島港',   lat: 33.983, lon: 134.583 },
    { name: '橘港',           lat: 33.817, lon: 134.617 },
    // ===== 香川県 =====
    { name: '高松港',         lat: 34.350, lon: 134.050 },
    { name: '坂出港',         lat: 34.317, lon: 133.867 },
    // ===== 愛媛県 =====
    { name: '松山港',         lat: 33.833, lon: 132.717 },
    { name: '三島川之江港',   lat: 33.983, lon: 133.517 },
    { name: '宇和島港',       lat: 33.217, lon: 132.567 },
    { name: '今治港',         lat: 34.067, lon: 133.000 },
    { name: '新居浜港',       lat: 33.967, lon: 133.300 },
    { name: '東予港',         lat: 33.983, lon: 133.417 },
    // ===== 高知県 =====
    { name: '高知港',         lat: 33.517, lon: 133.533 },
    { name: '須崎港',         lat: 33.383, lon: 133.283 },
    { name: '宿毛湾港',       lat: 32.933, lon: 132.733 },
    // ===== 福岡県 =====
    { name: '北九州港',       lat: 33.883, lon: 130.867 },
    { name: '博多港',         lat: 33.600, lon: 130.400 },
    { name: '苅田港',         lat: 33.967, lon: 130.983 },
    { name: '三池港',         lat: 33.017, lon: 130.433 },
    // ===== 佐賀県 =====
    { name: '唐津港',         lat: 33.450, lon: 129.967 },
    { name: '伊万里港',       lat: 33.267, lon: 129.883 },
    // ===== 長崎県 =====
    { name: '長崎港',         lat: 32.733, lon: 129.867 },
    { name: '佐世保港',       lat: 33.150, lon: 129.717 },
    { name: '厳原港',         lat: 34.200, lon: 129.283 },
    { name: '郷ノ浦港',       lat: 33.733, lon: 129.683 },
    { name: '福江港',         lat: 32.683, lon: 128.833 },
    // ===== 熊本県 =====
    { name: '熊本港',         lat: 32.767, lon: 130.583 },
    { name: '八代港',         lat: 32.517, lon: 130.583 },
    { name: '三角港',         lat: 32.617, lon: 130.533 },
    // ===== 大分県 =====
    { name: '別府港',         lat: 33.283, lon: 131.500 },
    { name: '大分港',         lat: 33.233, lon: 131.633 },
    { name: '佐伯港',         lat: 32.950, lon: 131.900 },
    { name: '中津港',         lat: 33.583, lon: 131.183 },
    { name: '津久見港',       lat: 33.067, lon: 131.867 },
    // ===== 宮崎県 =====
    { name: '宮崎港',         lat: 31.917, lon: 131.433 },
    { name: '細島港',         lat: 32.417, lon: 131.667 },
    { name: '油津港',         lat: 31.600, lon: 131.417 },
    // ===== 鹿児島県 =====
    { name: '鹿児島港',       lat: 31.600, lon: 130.567 },
    { name: '志布志港',       lat: 31.467, lon: 131.083 },
    { name: '川内港',         lat: 31.817, lon: 130.300 },
    { name: '西之表港',       lat: 30.733, lon: 130.983 },
    { name: '名瀬港',         lat: 28.383, lon: 129.483 },
    // ===== 沖縄県 =====
    { name: '那覇港',         lat: 26.217, lon: 127.667 },
    { name: '中城湾港',       lat: 26.267, lon: 127.817 },
    { name: '平良港',         lat: 24.800, lon: 125.283 },
    { name: '石垣港',         lat: 24.333, lon: 124.150 },
    { name: '金武湾港',       lat: 26.433, lon: 127.967 },
];

// 2点間の距離（km）を計算
function calcDist(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 +
              Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// 最寄り海域名を返す（500km以内のみ、それ以外はnull）
function getNearestSeaName(lat, lon) {
    let nearest = null;
    let minDist = Infinity;
    for (const area of SEA_AREAS) {
        const d = calcDist(lat, lon, area.lat, area.lon);
        if (d < minDist) { minDist = d; nearest = area.name; }
    }
    return minDist < 150 ? nearest : null;
}

// 気象データ取得
async function fetchWeather(lat, lon) {
    const params = new URLSearchParams({
        latitude: lat, longitude: lon,
        hourly: 'temperature_2m,relativehumidity_2m,windspeed_10m,winddirection_10m',
        forecast_days: 1,
        timezone: 'Asia/Tokyo',
        wind_speed_unit: 'ms',
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

        // うねりのみ表示
        const elSH = document.getElementById('val-swell-height');
        const elSD = document.getElementById('val-swell-dir');
        if (elSH) elSH.innerHTML   = swellH   !== null ? `${swellH.toFixed(1)}<span class="metric-unit">m</span>` : '--';
        if (elSD) elSD.textContent = swellDir !== null ? degToDir(swellDir) : '--';
    } else {
        if (marineSection) marineSection.style.display = 'none';
    }

    // ゲージ針（WBGT 0〜40°C → 0〜100%）
    // WBGT 15〜35°C を 0〜100% にマッピング（各境界値が色帯の区切りと一致）
    const pct = Math.min(100, Math.max(0, ((wbgt - 15) / 20) * 100));
    document.getElementById('gauge-needle').style.left = pct + '%';

    // 予報
    const fc = document.getElementById('forecast-items');
    fc.innerHTML = '';
    const showIdxs = [];
    for (let i = 0; i < hours.length; i++) {
        if (hours[i] >= currentHour) showIdxs.push(i);
    }
    showIdxs.forEach(idx => {
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
                const seaName = getNearestSeaName(lat, lon);
                const [weatherData, marineData, placeName] = await Promise.all([
                    fetchWeather(lat, lon),
                    fetchMarine(lat, lon),
                    getPlaceName(lat, lon)
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
// =============================================
// 熱中症診断フロー（4チェック・1問ずつ・次へ不要）
// =============================================

// ルール：
//   q1 いいえ → r_safe（直行）
//   q1 はい   → q2（直行）
//   q2 いいえ → 同画面に「救急車を呼ぶ」＋応急処置を即表示（次へなし）
//   q2 はい   → q3（直行）
//   q3 いいえ → 同画面に「医療機関へ」＋応急処置を即表示（次へなし）
//   q3 はい   → q4（直行・次へなし）
//   q4 いいえ → 同画面に「医療機関へ」＋応急処置を即表示（次へなし）
//   q4 はい   → r_rest（直行・次へなし）

let diagStack = [];
let diagCurrentId = null;

function openDiagnosis() {
    diagStack = [];
    diagCurrentId = null;
    document.getElementById('diagnosis-overlay').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    _showDiagStep('q1');
}

function closeDiagnosis() {
    document.getElementById('diagnosis-overlay').style.display = 'none';
    document.body.style.overflow = '';
}

function closeDiagnosisOverlay(e) {
    if (e.target === document.getElementById('diagnosis-overlay')) closeDiagnosis();
}

function diagBack() {
    if (diagStack.length === 0) return;
    const prev = diagStack.pop();
    diagCurrentId = prev;
    _showDiagStep(prev);
}

function _setBackBtn() {
    const btn = document.getElementById('diag-back');
    btn.style.visibility = diagStack.length > 0 ? 'visible' : 'hidden';
}

// ステップ描画（回答前）
function _showDiagStep(stepId) {
    diagCurrentId = stepId;
    _setBackBtn();

    const steps = {
        q1: { num:'チェック１', q:'熱中症を疑う症状がありますか？',
               sub:'めまい・失神・筋肉痛・筋肉の硬直・大量の発汗・頭痛・不快感・吐き気・嘔吐・倦怠感・虚脱感・意識障害・けいれん・手足の運動障害・高体温' },
        q2: { num:'チェック２', q:'呼びかけに答えますか？',       sub:null },
        q3: { num:'チェック３', q:'水分を自力で摂取できていますか？', sub:null },
        q4: { num:'チェック４', q:'症状がよくなりましたか？',       sub:null },
    };
    const step = steps[stepId];
    document.getElementById('diag-header-title').textContent = '熱中症と思ったら？';
    document.getElementById('diag-body').innerHTML = `
        <div class="diag-check-num">${step.num}</div>
        <div class="diag-question">${step.q}</div>
        ${step.sub ? `<div class="diag-sub">${step.sub}</div>` : ''}
        <div class="diag-yn-row">
            <button class="diag-yn-btn diag-yn-btn--yes" onclick="diagAnswer('${stepId}','yes')">はい</button>
            <button class="diag-yn-btn diag-yn-btn--no"  onclick="diagAnswer('${stepId}','no')">いいえ</button>
        </div>
    `;
}

// 回答処理
function diagAnswer(stepId, answer) {
    // ボタン状態を選択済みに更新
    const body = document.getElementById('diag-body');
    body.querySelectorAll('.diag-yn-btn').forEach(btn => {
        const isYes = btn.textContent.trim() === 'はい';
        const chosen = (answer === 'yes') ? isYes : !isYes;
        btn.classList.toggle('selected', chosen);
        btn.classList.toggle('dimmed', !chosen);
        btn.onclick = null; // 再クリック無効化
    });

    // 次のアクションを決定
    if (stepId === 'q1') {
        if (answer === 'yes') {
            setTimeout(() => { diagStack.push('q1'); _showDiagStep('q2'); }, 300);
        } else {
            setTimeout(() => { diagStack.push('q1'); _showDiagResult('r_safe'); }, 300);
        }
        return;
    }

    if (stepId === 'q2') {
        if (answer === 'yes') {
            setTimeout(() => { diagStack.push('q2'); _showDiagStep('q3'); }, 300);
        } else {
            // いいえ → 同画面にアクション追加
            _appendAction(body, `
                <div class="diag-call-row">
                    <a href="tel:119" class="diag-call-ambulance">
                        <div class="diag-call-label">救急車</div>
                        <div class="diag-call-num">119</div>
                    </a>
                    <a href="tel:118" class="diag-call-jcg">
                        <div class="diag-call-label">海上保安庁</div>
                        <div class="diag-call-num">118</div>
                    </a>
                </div>
                <div class="diag-action-headline">涼しい場所へ避難し、服をゆるめ体を冷やす</div>
                <div class="diag-action-desc">救急車が到着するまでの間に応急処置を始めましょう。呼びかけへの反応が悪い場合には無理に水を飲ませてはいけません</div>
                <div class="diag-action-desc" style="color:#0ea5e9;font-weight:700;">氷のう等があれば、首・腋の下・太腿のつけ根を集中的に冷やしましょう</div>
                <button class="diag-restart" onclick="openDiagnosis()">最初からやり直す</button>
            `);
        }
        return;
    }

    if (stepId === 'q3') {
        if (answer === 'yes') {
            // はい → チェック4へ直行（メッセージ表示なし）
            setTimeout(() => { diagStack.push('q3'); _showDiagStep('q4'); }, 300);
        } else {
            // いいえ → 同画面にアクション追加
            _appendAction(body, `
                <a href="https://www.iryou.teikyouseido.mhlw.go.jp/znk-web/juminkanja/S2300/initialize"
                   target="_blank" rel="noopener" class="diag-call-hospital">医療機関へ</a>
                <div class="diag-action-headline">涼しい場所へ避難し、服をゆるめ体を冷やす</div>
                <div class="diag-action-desc">氷のう等があれば、首・腋の下・太腿のつけ根を集中的に冷やしましょう</div>
                <div class="diag-action-desc" style="border:1px solid var(--border);border-radius:8px;padding:12px;">
                    本人が倒れたときの状況を知っている人が付き添って、発生時の状態を伝えましょう
                </div>
                <button class="diag-restart" onclick="openDiagnosis()">最初からやり直す</button>
            `);
        }
        return;
    }

    if (stepId === 'q4') {
        if (answer === 'yes') {
            // はい → r_rest へ直行
            setTimeout(() => { diagStack.push('q4'); _showDiagResult('r_rest'); }, 300);
        } else {
            // いいえ → 同画面にアクション追加
            _appendAction(body, `
                <a href="https://www.iryou.teikyouseido.mhlw.go.jp/znk-web/juminkanja/S2300/initialize"
                   target="_blank" rel="noopener" class="diag-call-hospital">医療機関へ</a>
                <div class="diag-action-headline">涼しい場所へ避難し、服をゆるめ体を冷やす</div>
                <div class="diag-action-desc">氷のう等があれば、首・腋の下・太腿のつけ根を集中的に冷やしましょう</div>
                <div class="diag-action-desc" style="border:1px solid var(--border);border-radius:8px;padding:12px;">
                    本人が倒れたときの状況を知っている人が付き添って、発生時の状態を伝えましょう
                </div>
                <button class="diag-restart" onclick="openDiagnosis()">最初からやり直す</button>
            `);
        }
        return;
    }
}

function _appendAction(body, html) {
    const block = document.createElement('div');
    block.className = 'diag-action-block';
    block.innerHTML = html;
    body.appendChild(block);
    // モーダルを一番下までスクロール
    const modal = document.querySelector('.diag-modal');
    if (modal) setTimeout(() => { modal.scrollTop = modal.scrollHeight; }, 50);
}

function _showDiagResult(resultId) {
    diagCurrentId = resultId;
    _setBackBtn();
    document.getElementById('diag-header-title').textContent = '対応ガイド';

    const bodies = {
        r_safe: `
            <div style="text-align:center">
                <div style="font-size:52px;margin-bottom:12px;">✅</div>
                <div style="font-size:20px;font-weight:700;color:var(--safe);margin-bottom:10px;">現時点では熱中症の疑いは低め</div>
                <div style="font-size:14px;color:var(--muted);line-height:1.7;margin-bottom:28px;">
                    引き続き水分・塩分補給と休憩を心がけてください。<br>症状が出てきたら再度チェックしてください。
                </div>
                <button class="diag-restart" onclick="openDiagnosis()">最初からやり直す</button>
            </div>`,
        r_rest: `
            <div style="text-align:center">
                <div style="font-size:52px;margin-bottom:12px;">😌</div>
                <div class="diag-rest-msg">そのまま安静にして十分に休息をとり、<br>回復したら帰宅しましょう</div>
                <div style="font-size:13px;color:var(--muted);line-height:1.7;margin-bottom:28px;">
                    症状が再度悪化した場合はすぐに医療機関を受診してください。
                </div>
                <button class="diag-restart" onclick="openDiagnosis()">最初からやり直す</button>
            </div>`,
    };

    document.getElementById('diag-body').innerHTML = bodies[resultId] || '';
}

// =============================================
// 海上保安庁 最寄り拠点
// =============================================

// 全国 海上保安部（緊急通報は全国共通118番）
// 電話番号：国土交通省公式PDF（jimusyoitiran.pdf）準拠
// 緯度経度：各庁舎の実所在地（Google Places APIで取得）
const JCG_STATIONS = [
    // 第一管区（北海道）
    { name:'函館海上保安部',   area:'第一管区（北海道）', lat:41.7827, lon:140.7246, tel:'0138-42-1118' },
    { name:'小樽海上保安部',   area:'第一管区（北海道）', lat:43.2002, lon:141.0038, tel:'0134-27-6118' },
    { name:'室蘭海上保安部',   area:'第一管区（北海道）', lat:42.3222, lon:140.9735, tel:'0143-23-0118' },
    { name:'釧路海上保安部',   area:'第一管区（北海道）', lat:42.9831, lon:144.3746, tel:'0154-22-0118' },
    { name:'留萌海上保安部',   area:'第一管区（北海道）', lat:43.9453, lon:141.6358, tel:'0164-42-0656' },
    { name:'稚内海上保安部',   area:'第一管区（北海道）', lat:45.4155, lon:141.6783, tel:'0162-22-0118' },
    { name:'紋別海上保安部',   area:'第一管区（北海道）', lat:44.3513, lon:143.3577, tel:'0158-23-0118' },
    { name:'根室海上保安部',   area:'第一管区（北海道）', lat:43.3445, lon:145.5844, tel:'0153-24-3118' },
    // 第二管区（東北）
    { name:'青森海上保安部',   area:'第二管区（東北）',   lat:40.8299, lon:140.7551, tel:'017-734-2422' },
    { name:'八戸海上保安部',   area:'第二管区（東北）',   lat:40.5276, lon:141.5471, tel:'0178-32-4691' },
    { name:'釜石海上保安部',   area:'第二管区（東北）',   lat:39.2737, lon:141.8887, tel:'0193-22-3830' },
    { name:'宮城海上保安部',   area:'第二管区（東北）',   lat:38.3150, lon:141.0357, tel:'022-367-3917' },
    { name:'秋田海上保安部',   area:'第二管区（東北）',   lat:39.7524, lon:140.0638, tel:'018-845-1624' },
    { name:'酒田海上保安部',   area:'第二管区（東北）',   lat:38.9157, lon:139.8293, tel:'0234-24-0055' },
    { name:'福島海上保安部',   area:'第二管区（東北）',   lat:36.9465, lon:140.9069, tel:'0246-54-3450' },
    // 第三管区（関東・東海）
    { name:'茨城海上保安部',   area:'第三管区（関東）',   lat:36.3429, lon:140.6015, tel:'029-263-4118' },
    { name:'千葉海上保安部',   area:'第三管区（関東）',   lat:35.6028, lon:140.1041, tel:'043-301-0118' },
    { name:'銚子海上保安部',   area:'第三管区（関東）',   lat:35.7385, lon:140.8526, tel:'0479-21-0118' },
    { name:'東京海上保安部',   area:'第三管区（関東）',   lat:35.6165, lon:139.7762, tel:'03-5564-1118' },
    { name:'横浜海上保安部',   area:'第三管区（関東）',   lat:35.4546, lon:139.6439, tel:'045-671-0118' },
    { name:'横須賀海上保安部', area:'第三管区（関東）',   lat:35.2944, lon:139.6400, tel:'046-861-8366' },
    { name:'清水海上保安部',   area:'第三管区（関東）',   lat:35.0091, lon:138.4963, tel:'054-353-1118' },
    { name:'下田海上保安部',   area:'第三管区（関東）',   lat:34.6701, lon:138.9487, tel:'0558-23-0118' },
    // 第四管区（東海）
    { name:'名古屋海上保安部', area:'第四管区（東海）',   lat:35.0925, lon:136.8814, tel:'052-661-1615' },
    { name:'四日市海上保安部', area:'第四管区（東海）',   lat:34.9528, lon:136.6393, tel:'059-357-0118' },
    { name:'尾鷲海上保安部',   area:'第四管区（東海）',   lat:34.0695, lon:136.1932, tel:'0597-25-0118' },
    { name:'鳥羽海上保安部',   area:'第四管区（東海）',   lat:34.4893, lon:136.8444, tel:'0599-25-0118' },
    // 第五管区（近畿・四国）
    { name:'大阪海上保安監部', area:'第五管区（近畿）',   lat:34.6533, lon:135.4306, tel:'06-6571-0516' },
    { name:'神戸海上保安部',   area:'第五管区（近畿）',   lat:34.6858, lon:135.1922, tel:'078-327-8835' },
    { name:'姫路海上保安部',   area:'第五管区（近畿）',   lat:34.7849, lon:134.6617, tel:'079-231-5065' },
    { name:'和歌山海上保安部', area:'第五管区（近畿）',   lat:34.2200, lon:135.1486, tel:'073-402-5852' },
    { name:'田辺海上保安部',   area:'第五管区（近畿）',   lat:33.7154, lon:135.3921, tel:'0739-22-2001' },
    { name:'徳島海上保安部',   area:'第五管区（四国）',   lat:34.0102, lon:134.5877, tel:'0885-32-0431' },
    { name:'高知海上保安部',   area:'第五管区（四国）',   lat:33.5397, lon:133.5522, tel:'088-832-7114' },
    // 第六管区（中国・四国）
    { name:'水島海上保安部',   area:'第六管区（中国）',   lat:34.5253, lon:133.7386, tel:'086-444-9701' },
    { name:'玉野海上保安部',   area:'第六管区（中国）',   lat:34.4917, lon:133.9493, tel:'0863-31-3421' },
    { name:'広島海上保安部',   area:'第六管区（中国）',   lat:34.3543, lon:132.4678, tel:'082-253-3111' },
    { name:'呉海上保安部',     area:'第六管区（中国）',   lat:34.2411, lon:132.5496, tel:'0823-26-0118' },
    { name:'尾道海上保安部',   area:'第六管区（中国）',   lat:34.3967, lon:133.1710, tel:'0848-22-2108' },
    { name:'徳山海上保安部',   area:'第六管区（中国）',   lat:34.0411, lon:131.8024, tel:'0834-31-0110' },
    { name:'高松海上保安部',   area:'第六管区（四国）',   lat:34.3573, lon:134.0635, tel:'087-821-7013' },
    { name:'松山海上保安部',   area:'第六管区（四国）',   lat:33.8563, lon:132.7124, tel:'089-951-1196' },
    { name:'今治海上保安部',   area:'第六管区（四国）',   lat:34.0661, lon:132.9966, tel:'0898-32-2882' },
    { name:'宇和島海上保安部', area:'第六管区（四国）',   lat:33.2280, lon:132.5531, tel:'0895-22-1256' },
    // 第七管区（九州北部）
    { name:'仙崎海上保安部',   area:'第七管区（九州北）', lat:34.3865, lon:131.2026, tel:'0837-26-0241' },
    { name:'門司海上保安部',   area:'第七管区（九州北）', lat:33.9440, lon:130.9586, tel:'093-321-3215' },
    { name:'若松海上保安部',   area:'第七管区（九州北）', lat:33.9022, lon:130.8113, tel:'093-761-2497' },
    { name:'福岡海上保安部',   area:'第七管区（九州北）', lat:33.6079, lon:130.4012, tel:'092-281-5866' },
    { name:'三池海上保安部',   area:'第七管区（九州北）', lat:33.0149, lon:130.4192, tel:'0944-53-0521' },
    { name:'唐津海上保安部',   area:'第七管区（九州北）', lat:33.4693, lon:129.9598, tel:'0955-74-4323' },
    { name:'長崎海上保安部',   area:'第七管区（九州北）', lat:32.7353, lon:129.8672, tel:'095-827-5133' },
    { name:'佐世保海上保安部', area:'第七管区（九州北）', lat:33.1600, lon:129.7272, tel:'0956-31-4842' },
    { name:'対馬海上保安部',   area:'第七管区（九州北）', lat:34.1978, lon:129.2914, tel:'0920-52-0640' },
    { name:'大分海上保安部',   area:'第七管区（九州北）', lat:33.2580, lon:131.6741, tel:'097-521-0112' },
    // 第八管区（日本海）
    { name:'敦賀海上保安部',   area:'第八管区（日本海）', lat:35.6609, lon:136.0737, tel:'0770-22-4179' },
    { name:'舞鶴海上保安部',   area:'第八管区（日本海）', lat:35.4505, lon:135.3176, tel:'0773-76-4120' },
    { name:'境海上保安部',     area:'第八管区（日本海）', lat:35.5453, lon:133.2480, tel:'0859-42-2534' },
    // 第九管区（北陸・新潟）
    { name:'新潟海上保安部',   area:'第九管区（新潟）',   lat:37.9286, lon:139.0668, tel:'025-247-0118' },
    { name:'伏木海上保安部',   area:'第九管区（北陸）',   lat:36.7939, lon:137.0619, tel:'0766-45-0118' },
    { name:'金沢海上保安部',   area:'第九管区（北陸）',   lat:36.6068, lon:136.6176, tel:'076-266-6118' },
    { name:'七尾海上保安部',   area:'第九管区（北陸）',   lat:37.0505, lon:136.9778, tel:'0767-52-9118' },
    // 第十管区（九州南部）
    { name:'熊本海上保安部',   area:'第十管区（九州南）', lat:32.6066, lon:130.4688, tel:'0964-52-3105' },
    { name:'宮崎海上保安部',   area:'第十管区（九州南）', lat:31.5991, lon:131.4170, tel:'0987-22-3264' },
    { name:'鹿児島海上保安部', area:'第十管区（九州南）', lat:31.5991, lon:130.5641, tel:'099-805-1002' },
    { name:'串木野海上保安部', area:'第十管区（九州南）', lat:31.7147, lon:130.2641, tel:'0996-32-2362' },
    { name:'奄美海上保安部',   area:'第十管区（九州南）', lat:28.3852, lon:129.4942, tel:'0997-53-5569' },
    // 第十一管区（沖縄）
    { name:'那覇海上保安部',   area:'第十一管区（沖縄）', lat:26.2415, lon:127.6771, tel:'098-951-0118' },
    { name:'石垣海上保安部',   area:'第十一管区（沖縄）', lat:24.3391, lon:124.1529, tel:'0980-83-0118' },
    { name:'宮古島海上保安部', area:'第十一管区（沖縄）', lat:24.8082, lon:125.2778, tel:'0980-72-0118' },
    { name:'中城海上保安部',   area:'第十一管区（沖縄）', lat:26.3293, lon:127.8428, tel:'098-938-7118' },
];

function calcDistKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 +
              Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function openJCG() {
    document.getElementById('jcg-overlay').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    renderJCGBody();
}

function closeJCG() {
    document.getElementById('jcg-overlay').style.display = 'none';
    document.body.style.overflow = '';
}

function closeJCGOverlay(e) {
    if (e.target === document.getElementById('jcg-overlay')) closeJCG();
}

function renderJCGBody() {
    const body = document.getElementById('jcg-body');
    body.innerHTML = '<div class="jcg-loading">📡 現在地を取得中...</div>';

    if (!navigator.geolocation) {
        renderJCGFallback(body);
        return;
    }

    navigator.geolocation.getCurrentPosition(
        ({ coords: { latitude: lat, longitude: lon } }) => {
            const sorted = JCG_STATIONS
                .map(s => ({ ...s, dist: calcDistKm(lat, lon, s.lat, s.lon) }))
                .sort((a, b) => a.dist - b.dist)
                .slice(0, 3);

            const cardsHTML = sorted.map((s, i) => `
                <div class="jcg-card">
                    <div class="jcg-rank">最寄り第${i+1}位</div>
                    <div class="jcg-name">${s.name}</div>
                    <div class="jcg-area">${s.area}</div>
                    <div class="jcg-dist">📍 現在地から約 ${Math.round(s.dist)} km</div>
                    <a href="tel:${s.tel.replace(/-/g,'')}" class="jcg-tel-btn">
                        📞 ${s.tel}（代表）に電話
                    </a>
                </div>
            `).join('');

            body.innerHTML = `
                <div class="jcg-list">
                    ${cardsHTML}
                </div>
                <div class="jcg-note">
                    ⚓ 海上での緊急通報は <strong>118番</strong>（海上保安庁・24時間対応）<br>
                    上記電話番号は各保安部の代表番号です。緊急時は必ず118番を使用してください。
                </div>`;
        },
        () => renderJCGFallback(body)
    );
}

function renderJCGFallback(body) {
    body.innerHTML = `
        <div style="text-align:center;padding:16px 0 24px;">
            <div style="font-size:40px;margin-bottom:12px;">🚢</div>
            <div style="font-size:15px;font-weight:700;margin-bottom:8px;">位置情報を取得できませんでした</div>
            <div style="font-size:13px;color:var(--muted);line-height:1.7;margin-bottom:24px;">
                海上での緊急通報は <strong>118番</strong>（海上保安庁・24時間対応）
            </div>
            <a href="tel:118" style="display:block;padding:18px;background:#1e3a5f;color:#fff;border-radius:12px;font-size:22px;font-weight:700;text-decoration:none;text-align:center;">
                📞 118番に発信
            </a>
        </div>
        <div class="jcg-note">
            位置情報が許可されると最寄り3拠点が表示されます。
        </div>`;
}

// Escキーで両モーダル閉じる
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        closeDiagnosis();
        closeJCG();
    }
});