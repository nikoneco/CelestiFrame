# CelestiFrame

CelestiFrame（セレスティフレーム）は、指定した場所・日時における太陽と月の位置を地図上で確認し、風景や建造物と組み合わせた写真の撮影計画を立てるためのPWAです。

## 現在の開発段階

Phase 1（土台）を実装中です。

- スマートフォン向け基本画面
- Leaflet / OpenStreetMapの地図
- 撮影地点の選択と現在地取得
- 日付・時刻操作
- 太陽・月の表示切り替え枠
- PWA Manifest / Service Worker / オフライン画面
- 最後に使用した地点と日時の端末保存
- 角度ユーティリティの単体テスト

天体位置の実計算はPhase 2（太陽）とPhase 3（月）で追加します。

## ローカル起動

Service Workerと位置情報を正しく扱うため、ファイルを直接開かずローカルHTTPサーバーを使用してください。

```powershell
npm run serve
```

表示されたローカルURLをブラウザで開きます。


## テスト

```powershell
npm test
```

## 技術構成

- HTML / CSS / Vanilla JavaScript
- Leaflet 1.9.4
- OpenStreetMap
- LocalStorage（初期状態の復元）
- Service Worker
- Node.js標準テストランナー

## データとオフライン動作

撮影地点、日時、表示対象などの初期設定は端末内へ保存します。初回オンライン表示後はアプリシェルをキャッシュします。地図タイルは表示済み範囲のみランタイムキャッシュされるため、未表示範囲の地図を完全オフラインで閲覧することはできません。

## 注意

CelestiFrameが今後表示する天体位置や重なり予測は、写真撮影計画のための計算上の目安です。測量用途には使用できません。重要な撮影では現地確認を行ってください。

## クレジット

Map data &copy; [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)
