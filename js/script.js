// ===== 定数 =====
const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';

// WBGT 近似式（気温・湿度から算出 / 環境省方式に準拠）
function calcWBGT(temp, humidity) {
    const tw = temp * Math.atan(0.151977 * Math.pow(humidity + 8.313659, 0.5))
             + Math.atan(temp + humidity)
             - Math.atan(humidity - 1.676331)
             + 0.00391838 * Math.pow(humidity, 1.5) * Math.atan(0.023101 * humidity)
             - 4.686035;
    return 0.7 * tw + 0.2 * temp + 3;
}

// 危険度判定（環境省基準）
function getLevel(wbgt) {
    if (wbgt < 21)      return { key: 'safe',    label: '安全',     icon: '✅', advice: '通常通り活動できます。' };
    if (wbgt < 25)      return { key: 'caution', label: '注意',     icon: '⚠️', advice: '激しい運動の際は定期的に休憩を。' };
    if (wbgt < 28)      return { key: 'warning', label: '警戒',     icon: '🔶', advice: '運動は30分ごとに休憩し、水分補給を怠らずに。' };
    if (wbgt < 31)      return { key: 'danger',  label: '厳重警戒', icon: '🚨', advice: '激しい運動や作業は原則中止。こまめな水分・塩分補給を。' };
    return               { key: 'severe',  label: '危険',     icon: '☠️', advice: '屋外作業は中止を強く推奨。涼しい場所に避難し水分補給してください。' };
}

// アドバイスリスト
function getAdviceList(level) {
    const base = [
        { icon: '💧', text: '30分ごとに水分補給（1回あたり200〜250ml）' },
        { icon: '🧂', text: '発汗が多い場合は塩分も補給（塩飴・スポーツドリンクなど）' },
        { icon: '🧢', text: '直射日光を避け、帽子・日傘を活用' },
    ];
    const extra = {
        warning: [{ icon: '🕐', text: '30分ごとに涼しい場所で5〜10分の休憩を取る' }],
        danger:  [{ icon: '🏥', text: 'めまい・頭痛が出たらすぐに作業を中断し報告' }, { icon: '🕐', text: '激しい作業は避け、こまめに体調確認を' }],
        severe:  [{ icon: '🏥', text: '屋外作業は直ちに中断してください' }, { icon: '❄️', text: '冷たいタオルや氷で体を冷やし医療機関へ' }],
    };
    return [...base, ...(extra[level.key] || [])];
}

// ===== 時刻表示 =====
function updateClock() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2,'0');
    const mm = String(now.getMinutes()).padStart(2,'0');
    const days = ['日','月','火','水','木','金','土'];
    const dateStr = `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日（${days[now.getDay()]}）`;
    document.getElementById('clock').textContent = `${hh}:${mm}`;
    document.getElementById('clock-date').textContent = dateStr;
}
setInterval(updateClock, 1000);
updateClock();

// ===== 逆ジオコーディング（無料） =====
async function getPlaceName(lat, lon) {
    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=ja`
        );
        const d = await res.json();
        const addr = d.address || {};
        return addr.city || addr.town || addr.village || addr.county || addr.state || '現在地';
    } catch {
        return '現在地';
    }
}

// ===== Open-Meteo からデータ取得 =====
async function fetchWeather(lat, lon) {
    const params = new URLSearchParams({
        latitude: lat,
        longitude: lon,
        hourly: 'temperature_2m,relativehumidity_2m,windspeed_10m',
        forecast_days: 1,
        timezone: 'Asia/Tokyo',
    });
    const res = await fetch(`${OPEN_METEO}?${params}`);
    if (!res.ok) throw new Error('API error');
    return res.json();
}

// ===== UI 更新 =====
function renderApp(data, lat, lon, placeName) {
    const now = new Date();
    const currentHour = now.getHours();

    const hours   = data.hourly.time.map(t => parseInt(t.split('T')[1]));
    const temps   = data.hourly.temperature_2m;
    const humids  = data.hourly.relativehumidity_2m;
    const winds   = data.hourly.windspeed_10m;

    // 現在時刻に最も近いインデックス
    let nowIdx = hours.indexOf(currentHour);
    if (nowIdx === -1) nowIdx = 0;

    const temp   = temps[nowIdx];
    const humid  = humids[nowIdx];
    const wind   = winds[nowIdx];
    const wbgt   = calcWBGT(temp, humid);
    const level  = getLevel(wbgt);

    // ロード画面を非表示
    document.getElementById('loading').style.display = 'none';
    document.getElementById('error').style.display = 'none';
    document.getElementById('app').style.display = 'block';

    // 位置情報
    document.getElementById('place-name').textContent = placeName;
    document.getElementById('place-coords').textContent =
        `${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E`;

    // アラートバナー
    const banner = document.getElementById('alert-banner');
    banner.className = `alert-banner alert-${level.key}`;
    document.getElementById('alert-icon').textContent = level.icon;
    document.getElementById('alert-label').textContent = '現在の熱中症危険度';
    document.getElementById('alert-text').textContent = `${level.label}（WBGT ${wbgt.toFixed(1)}°C）`;

    // メトリクス
    document.getElementById('val-wbgt').textContent   = wbgt.toFixed(1);
    document.getElementById('val-temp').textContent   = temp.toFixed(1);
    document.getElementById('val-humid').textContent  = Math.round(humid);
    document.getElementById('val-wind').textContent   = wind.toFixed(1);

    // WBGT 色変化
    const wbgtCard = document.getElementById('wbgt-card');
    wbgtCard.style.setProperty('--accent',
        wbgt < 21 ? 'var(--safe)' :
        wbgt < 25 ? 'var(--caution)' :
        wbgt < 28 ? 'var(--warning)' :
        wbgt < 31 ? 'var(--danger)' : 'var(--severe)'
    );

    // ゲージ針（0〜40°Cを0〜100%にマッピング）
    const needlePct = Math.min(100, Math.max(0, (wbgt / 40) * 100));
    document.getElementById('gauge-needle').style.left = needlePct + '%';

    // 時間帯予報（現在〜+8時間、または全時間帯）
    const forecastContainer = document.getElementById('forecast-items');
    forecastContainer.innerHTML = '';

    // 表示する時間帯を決定（現在から翌8時間または当日全時間）
    const showHours = [];
    for (let i = 0; i < data.hourly.time.length; i++) {
        const h = parseInt(data.hourly.time[i].split('T')[1]);
        if (h >= currentHour) showHours.push(i);
    }
    const targets = showHours.slice(0, 9); // 最大9時間

    targets.forEach((idx, i) => {
        const h = hours[idx];
        const t = temps[idx];
        const hu = humids[idx];
        const w = calcWBGT(t, hu);
        const lv = getLevel(w);
        const isNow = (idx === nowIdx);

        const el = document.createElement('div');
        el.className = `forecast-item level-${lv.key}${isNow ? ' active' : ''}`;
        el.innerHTML = `
            <div class="forecast-time">${isNow ? '今' : String(h).padStart(2,'0') + ':00'}</div>
            <div class="forecast-temp">${t.toFixed(0)}<span style="font-size:11px;font-family:var(--font-body)">°</span></div>
            <div class="forecast-wbgt-badge badge-${lv.key}">${lv.label}</div>
            <div class="forecast-humid">💧${Math.round(hu)}%</div>
        `;
        forecastContainer.appendChild(el);
    });

    // アドバイス
    const adviceList = document.getElementById('advice-list');
    adviceList.innerHTML = '';
    getAdviceList(level).forEach(item => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="adv-icon">${item.icon}</span><span>${item.text}</span>`;
        adviceList.appendChild(li);
    });

    // 最終更新
    document.getElementById('last-update').textContent =
        `最終更新：${now.toLocaleTimeString('ja-JP')}`;
}

// ===== エラー表示 =====
function showError(msg) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('app').style.display = 'none';
    const err = document.getElementById('error');
    err.style.display = 'flex';
    document.getElementById('error-msg').textContent = msg;
}

// ===== メイン処理 =====
async function loadData() {
    document.getElementById('loading').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    document.getElementById('error').style.display = 'none';

    if (!navigator.geolocation) {
        showError('このブラウザは位置情報に対応していません。');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const { latitude: lat, longitude: lon } = pos.coords;
            try {
                const [weatherData, placeName] = await Promise.all([
                    fetchWeather(lat, lon),
                    getPlaceName(lat, lon)
                ]);
                renderApp(weatherData, lat, lon, placeName);
            } catch (e) {
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

// 起動
loadData();
