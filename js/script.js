const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';

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

// 逆ジオコーディング
async function getPlaceName(lat, lon) {
    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=ja`
        );
        const d = await res.json();
        const a = d.address || {};
        return a.city || a.town || a.village || a.county || a.state || '現在地';
    } catch { return '現在地'; }
}

// 気象データ取得
async function fetchWeather(lat, lon) {
    const params = new URLSearchParams({
        latitude: lat, longitude: lon,
        hourly: 'temperature_2m,relativehumidity_2m,windspeed_10m',
        forecast_days: 1,
        timezone: 'Asia/Tokyo',
    });
    const res = await fetch(`${OPEN_METEO}?${params}`);
    if (!res.ok) throw new Error('API error');
    return res.json();
}

// UI描画
function renderApp(data, lat, lon, placeName) {
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
    document.getElementById('val-wbgt').innerHTML  = `${wbgt.toFixed(1)}<span class="metric-unit">°C</span>`;
    document.getElementById('val-temp').innerHTML  = `${temp.toFixed(1)}<span class="metric-unit">°C</span>`;
    document.getElementById('val-humid').innerHTML = `${Math.round(humid)}<span class="metric-unit">%</span>`;
    document.getElementById('val-wind').innerHTML  = `${wind.toFixed(1)}<span class="metric-unit">m/s</span>`;

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
                const [weatherData, placeName] = await Promise.all([
                    fetchWeather(lat, lon),
                    getPlaceName(lat, lon)
                ]);
                renderApp(weatherData, lat, lon, placeName);
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
