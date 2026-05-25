# 🌡️ 熱中症リスクモニター

現在地の位置情報をもとに、気温・湿度・WBGT（暑さ指数）をリアルタイムで表示する静的Webアプリです。

## ファイル構成

```
/
├── index.html        # メインHTML
├── css/
│   └── style.css     # スタイルシート
├── js/
│   └── script.js     # ロジック（位置情報取得・API呼び出し・UI描画）
└── README.md
```

## 使用API（すべて無料・APIキー不要）

| API | 用途 |
|-----|------|
| [Open-Meteo](https://open-meteo.com/) | 気温・湿度・風速の取得 |
| [Nominatim (OpenStreetMap)](https://nominatim.org/) | 緯度経度から地名に変換（逆ジオコーディング） |
| ブラウザ Geolocation API | 現在地の緯度経度取得 |

## WBGT計算について

気温・湿度から環境省方式に準拠した近似式でWBGTを算出しています。  
実測値とは若干異なる場合があります。

## GitHub Pages での公開手順

1. このリポジトリを GitHub にプッシュ
2. Settings → Pages → Branch: `main` / `/ (root)` を選択して Save
3. 数分後に `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開されます

## 危険度基準（環境省）

| WBGT | 危険度 |
|------|--------|
| ～21°C | 安全 |
| 21～25°C | 注意 |
| 25～28°C | 警戒 |
| 28～31°C | 厳重警戒 |
| 31°C～ | 危険 |

## 注意事項

- 位置情報の使用許可が必要です（ブラウザのプロンプトで「許可」を選択）
- HTTPS 環境でのみ位置情報が取得できます（GitHub Pages は HTTPS なのでOK）
- WBGTは近似値です。実際の作業判断は現場責任者の判断に従ってください
