# CelestiFrame UI refinement research

調査日: 2026-07-15  
対象: CelestiFrame 1.4.0 / PC・スマートフォンの公開PWA  
目的: 機能を崩さず、生成AIテンプレートに見える要素を減らし、撮影計画ツールとして洗練する

## 結論

CelestiFrameは機能不足ではない。むしろ、地図、天体方向、構図、雲、光害、保存、現地案内までが一つにつながっており、製品の核はかなり強い。

次に必要なのは装飾を足すことではなく、**「夜色のSFダッシュボード」から「写真家のための精密なフィールドノート」へ見た目の重心を移すこと**である。

優先すべき変更は次の5点。

1. 全部を囲って光らせる表現をやめ、地図・時刻・選択中の天体だけを主役にする。
2. 英字の装飾見出し、細い枠線、均一な角丸、グロー、半透明パネルを半分以下に整理する。
3. PCは「地図 + 支援ペイン」、スマホは「地図 + 段階式ボトムシート」として情報量を制御する。
4. 日時スライダーを、薄明・夜・日の出入り・月の出入りが読める「Sky-state rail」に育て、CelestiFrame固有の顔にする。
5. 表面だけでなく、44 pxのタップ領域、16 pxのモバイル入力、フォーカス、更新通知、PWA manifestまで一緒に整える。

「流行のガラス表現」「大きなグラデーション」「光るカード」「意味のないアニメーション」を追加する方向は避ける。今のAI感を強めるためである。

## 調査範囲

### 確認したCelestiFrameの画面

| Step | 画面 | 状態 | 所見 |
| --- | --- | --- | --- |
| 1 | PCのメイン画面 | 良好、要整理 | 地図と右ペインの構成は適切。右ペイン内の囲みと装飾が多く、情報の優先順位が均一に見える。 |
| 2 | スマホのメイン画面 | 良好、要整理 | 地図ファーストは成立。上部4ボタンと長い下部ペインが窮屈で、更新通知が入力欄を覆う。 |
| 3 | 表示設定 | 良好 | 選択肢は理解しやすい。英字見出し、大きな円形クローズ、各行の強い囲みは減らせる。 |
| 4 | 撮影計画 | 機能良好、密度高め | 保存・同期・計画一覧の機能は明確。カード内カードと5分割アクションが情報密度を上げている。 |
| 5 | 現地撮影モード | 最も良い | 目的、コンパス、数値、開始操作の順が明快。CelestiFrame全体が寄せるべき基準画面。 |

監査用スクリーンショットは `tmp/01-current-desktop.png` から `tmp/05-current-field-mobile.png` に保存した。`tmp` はGit管理外の一時証跡である。

### 比較した現行サービス・設計指針

- The Photographer's Ephemeris Web 4.0: shot alignment、celestial target planning、map overlayを前面に出している。
- Windy: 地図そのものを情報の主役にし、レイヤー・時刻・モデル選択を画面の縁へ分散している。
- Stellarium Web: 観測画面を主役にし、操作は上下左右のエッジへ寄せている。
- Material 3 Expressive: 色、形、大きさ、動き、containmentを「注目を誘導するため」に使う方向へ進んでいる。
- Apple HIG: dark modeでは背景と前景の階層を知覚できること、過度な独自外観より環境設定への追従を重視している。
- WCAG 2.2 / WAI-ARIA: target size、フォーカスが隠れないこと、ダイアログ内のフォーカス管理を重視している。
- PWAの現行指針: standaloneのウィンドウサイズ、offline状態、update、manifest screenshots、app shortcutsを含めて「端末の一員」に見せる。

## 現状の強み

### 1. 製品の中心が明確

画面中央のレティクル、撮影地点と被写体地点、太陽・月・天の川の方向線は、一般的なSaaSにはないCelestiFrame固有の視覚言語になっている。ここは消さず、むしろブランドの中心にするべきである。

### 2. 夜間利用への理解がある

ダーク、ライト、赤色ナイトを用意し、`prefers-reduced-motion` と `:focus-visible` も実装済み。現地撮影モードも安全上の注意を含み、道具としての信頼感がある。

### 3. PCとスマホの基本構造がすでに正しい

PCでは地図と右ペイン、スマホでは地図と下部の操作領域に分かれる。これは現在のadaptive UIに合っている。大規模な作り直しではなく、ペイン内の優先順位と密度を整える方が効果が高い。

### 4. 色に意味がある

太陽はamber、月はblue、天の川はviolet、撮影地点はcyan、被写体はredという割り当ては有用。問題は色そのものより、同じ色が枠・発光・文字・背景へ重ねて使われ、重要度が飽和していることである。

## AIっぽく見える主な原因

### 1. すべての要素が「特別扱い」されている

`css/app.css` では、`border-radius` が130回、`box-shadow` が61回、`backdrop-filter` が19回、`color-mix()` が144回使われている。件数だけで品質は決まらないが、画面上でも枠線、角丸、半透明、発光がほぼ全コンポーネントに反復されている。

生成AIのダークUIでよく見られる「濃紺背景 + シアン + ガラス + 発光 + 全カード角丸」と一致しやすく、個別機能の違いが表面上は同じに見える。

### 2. 英字のeyebrowが情報ではなく装飾になっている

`FIELD DISPLAY`、`FIELD NOTEBOOK`、`CELESTIAL TARGETS`、`MOON VECTOR`、`FRAME ALIGNMENT`、`OPTICAL FRAME`、`REVERSE LOCATION` などが広く使われている。

写真機材の刻印のように限定利用すれば魅力になるが、全セクションに置くと「AIがそれらしい英語を添えた」印象になる。基本は日本語の見出しだけで意味が通る。

### 3. 角丸の種類とpillが多い

6 px前後の小要素、10〜18 pxのカード、円形ボタン、999 pxのpillが混在する。個々は妥当でも、同じ画面で頻繁に切り替わるため、設計規則より生成的な装飾に見える。

### 4. 階層の差が小さい

パネル、カード、カード内メトリクス、入力グループがすべて細枠で囲まれている。結果として、主操作、補助情報、参考値が同じ強さで並ぶ。

### 5. 記号アイコンが混在する

`⌁`、`▤`、`⌖`、`◐`、`⌕`、`◇` などのテキスト記号は、OSやフォントによって太さと位置が変わる。ブランドアイコンというより仮アイコンに見えやすい。

### 6. 読ませたい文章まで小さい

mono体、uppercase、広いletter spacingは計測値には合うが、説明、補助文、状態まで同じ処理をすると可読性と人間味が落ちる。スマホ画面には7〜10 pxの文字も多く、精密さより縮小された印象が勝つ箇所がある。

## 2026年のUI潮流から採用すべきこと

| 潮流 | 本質 | CelestiFrameへの適用 |
| --- | --- | --- |
| Expressive UI | 全部を派手にせず、色・形・大きさで重要な行動を早く見つけさせる | 現在地、撮影地点確定、計画保存など、その場の主操作だけを強くする |
| Adaptive panes | 大画面は主ペイン + 支援ペイン、小画面は一度に一つの仕事へ絞る | PCの右ペインを維持し、スマホでは日時・天体・重なり・構図を段階表示する |
| Content-first map UI | 地図やデータ可視化を背景ではなく主コンテンツにする | 地図フィルターを弱め、操作パネルの面積と不透明度を抑える |
| Context-preserving motion | 状態変化の関係を伝える短い遷移だけを使う | タブ変更、ボトムシート、計画復元に150〜220 ms程度の一貫した遷移を使う |
| Task-centered PWA | インストール後の起動、offline、update、shortcutまで体験として設計する | manifest、更新通知、オフライン時の計画閲覧、起動ショートカットを整える |
| Accessible by default | target size、focus、reflow、contrastを後付けにしない | 390 px画面で44 px target、16 px入力、200% zoom、キーボードを受入条件にする |

Material 3 Expressiveのポイントは「派手にすること」ではない。Googleの調査でも、色、サイズ、形、containmentを使って主要要素を見つけやすくすることが中心で、機能を犠牲にしないよう明記されている。CelestiFrameでは静かなexpressive designを採用する方が合う。

## 推奨するデザイン方向

### コンセプト

**Celestial Field Notebook**  
夜間の撮影現場で使う、地図、露出計、コンパス、撮影ノートが一体になった精密な道具。

SF船の操作盤ではなく、カメラバッグから取り出す信頼できる撮影器具を目指す。

### シグネチャ要素

現在の「一日の時刻」スライダーを **Sky-state rail** にする。

- レール背景に daylight / civil twilight / nautical twilight / astronomical night を連続表示する。
- 日の出・日の入り、月の出・月の入り、天の川中心の高度ピークを小さな刻印で示す。
- 選択時刻のつまみだけを明るくし、地図上の天体線と同じ色で同期する。
- レール操作中だけ関連数値を更新し、それ以外のカードは動かさない。

これは装飾ではなく、撮影計画そのものを短時間で理解させる。CelestiFrame固有の記憶点になり、一般的なAIダッシュボードから離れられる。

### 色

既存の天体色は維持し、面と境界をneutralへ戻す。

| Token | 推奨値 | 用途 |
| --- | --- | --- |
| Night canvas | `#091019` | アプリ最背面 |
| Map chrome | `#101923` | 地図周辺・固定UI |
| Surface | `#151F2A` | 支援ペイン |
| Raised surface | `#1B2834` | ダイアログなど、本当に前景の面だけ |
| Chalk | `#E7EDF2` | 主テキスト |
| Muted | `#99A7B3` | 補助テキスト。現状より少し明るくする |
| Horizon | `#58BEB5` | 撮影地点、主操作 |
| Solar | `#D69A42` | 太陽データ |
| Lunar | `#8DA9CB` | 月データ |
| Subject | `#D36B6F` | 被写体地点、警告ではない対象色 |

ルールは「色付きの枠 + 色付き文字 + 色付き発光」を同時に使わないこと。通常は色を1箇所だけに使う。

### タイポグラフィ

候補:

- Display / numbers: `IBM Plex Sans Condensed`
- Japanese body: `Noto Sans JP`
- Data: `IBM Plex Mono`

Webフォントは外部読み込みではなく、必要なweightのWOFF2をライセンス確認のうえ同梱する。オフラインと初回表示を守るためである。

使い分け:

- 数値、時刻、方位、短い英字刻印だけをcondensed / monoにする。
- 見出し、説明、ボタンは日本語body fontを基本にする。
- uppercase eyebrowは画面に最大1つ。機能名の日本語で足りる場合は置かない。

### 形と奥行き

radiusは原則3段階に限定する。

- 6 px: 入力、segmented control、小ボタン
- 10 px: カード、検索結果
- 16 px: ダイアログ、最上位ペイン
- 999 px: switch、chip、時刻レールのつまみだけ

shadowも3段階ではなく、通常面はshadowなし、floating toolbarは弱いshadow、modalだけ強いshadowの2段階でよい。blurはトップバー、地図上のfloating toolbar、modal backdropだけに限定する。

## 画面別の改善案

### メイン画面 / PC

現状の左右構成は維持する。

```text
┌──────────────────────────────────────────────────────────────┐
│ CelestiFrame             現地   計画   その他                │
├──────────────────────────────────────┬───────────────────────┤
│                                      │ 7/14 06:00  東京       │
│                MAP                   │ Sky-state rail         │
│                                      │ 日時 天体 重なり 構図   │
│  検索                                │                       │
│  雲 / 光害                           │ 選択中の結果            │
│                                      │ 必要時だけ詳細を展開     │
│           撮影地点   被写体地点       │                       │
└──────────────────────────────────────┴───────────────────────┘
```

- 右ペイン上部に日時、場所、選択中天体を1行でまとめる。
- 「日時 / 天体 / 重なり / 構図」をnavigationとして固定する。
- すべての天体カードを常時縦積みせず、選択中の天体詳細を1枚表示し、ほかはcompact rowにする。
- 地図は現在より色相回転と暗化を弱める。地物・水域・道路を読めることを優先する。
- `現在地` は地図の標準controlへ移し、topbarの主要操作から外す。

### メイン画面 / スマートフォン

- 地図は初期表示で42〜48dvhを目安にし、ボトムシートのdrag handleで地図と詳細の比率を変えられるようにする。
- topbarは `現地`、`計画`、`その他` の3操作へ整理する。表示テーマと現在地は「その他」または地図controlへ移す。
- 390 px幅で39 pxになっているtopbar buttonは、視覚・hit targetとも44 px以上を維持する。
- タブごとに一つの仕事を表示する。スマホで日時から構図まで全セクションを連続スクロールさせない。
- 更新通知は入力欄の上に重ねず、topbar直下の細いstatus barか、安全領域を確保したtoastにする。

### 表示設定

- `FIELD DISPLAY` は削除し、「表示設定」だけにする。
- テーマ4行は色見本付きradioとして維持してよいが、各行の枠をなくし、選択行だけ背景を変える。
- 右上の閉じるボタンと最下部の「設定を閉じる」は役割が重複する。スマホでは下部ボタンを主、PCでは右上closeを主にするなど整理する。
- `端末設定` を初期値として尊重し、赤色ナイトはCelestiFrame固有のfield toolとして残す。

### 撮影計画

- `FIELD NOTEBOOK` は削除するか、画面の最初に1回だけ小さく使う。
- cloud accountは常時大きなカードにせず、タイトル行の同期状態へ縮小する。ログイン操作時だけ説明を展開する。
- 「現在のフレーム」と計画一覧の外枠を外し、spacingとdividerで分ける。
- plan cardの5ボタンは `地図`、`共有` を表に残し、`お気に入り`、`編集`、`複製/削除` をoverflowへまとめる。
- 将来はTPEのLocation Listsのように、計画を「月景」「富士山」「遠征」などのcollectionへ整理できると自然。ただし今回の視覚改善より後でよい。

### 現地撮影モード

この画面をデザイン基準にする。

- コンパスと目標差をさらに大きくし、装飾見出しは減らす。
- 開始後は「端末方位」「目標方位」より、`右へ12°`、`あと240 m` の行動情報を最上位にする。
- 赤色ナイト選択中は、cyanの主操作も赤系へ統一し、暗所順応を守る。
- GPS精度が低い場合は数値だけでなく、「精度が上がるまで開けた場所で待つ」など回復行動を示す。

### Loading / empty / error

- `—` の連続は機械的に見えるため、初期状態は「日時を設定すると表示」、取得中は短いskeleton、失敗は再試行方法を出す。
- 地図、天気、標高、cloud syncは、最後に成功した値と取得時刻を残す。
- errorを赤い枠で囲むだけにせず、原因と次の行動を1行で示す。

## PWAとしての改善

現在のmanifestは基本要件を満たすが、次を追加・見直しできる。

1. `orientation: portrait-primary` を再検討する。CelestiFrameはPC・タブレットの横長map UIにも価値があるため、`any` またはorientation指定なしの方が自然。
2. manifest `screenshots` にスマホとwideの代表画面を追加し、install UIで用途を伝える。
3. `shortcuts` に「新しい撮影計画」「保存した計画」「現地撮影モード」を追加する。ただしブラウザー対応差があるためprogressive enhancementとして扱う。
4. browser modeとstandalone modeでtopbarの余白や戻る導線を調整する。
5. offline時も保存済み計画の閲覧・復元は継続し、通信が必要な雲・地名検索だけを明示的にdisabledにする。
6. update通知は「新しいバージョンがあります」だけでなく、更新後に何が保持されるかを短く示す。作業中なら後回しにできる現状の判断は維持する。

## アクセシビリティ上の確認事項

現状で確認できた良い点:

- `:focus-visible` がある。
- native `<dialog>` を使用し、ボタンで閉じると起点へfocusが戻る。
- `prefers-reduced-motion` を尊重している。
- 地図、region、navigation、dialog、buttonに日本語のaccessible nameがある。

優先確認:

1. 390 px以下でtopbar buttonの幅が39 pxになる。周囲の間隔でWCAG 2.2を満たす可能性はあるが、屋外・片手操作を考えると44 pxを維持する方がよい。
2. メインのdate/time inputが12 px。iOSのfocus zoomを避けるため、スマホinputは16 pxを基本にする。
3. 7〜9 pxの補助文字は、contrastだけでなく実地の眩しさ・視認距離を含めてテストする。
4. fixed topbar、bottom sheet、update toastがkeyboard focusを隠さないか、Tab操作で確認する。
5. 200% zoom、320 CSS px、landscape、safe-area insetでreflowを確認する。
6. dark / light / redそれぞれで通常文字4.5:1、大きな文字3:1、UI境界3:1を測定する。
7. 地図上の色分けは、線種、marker形状、labelでも区別できる状態を維持する。

スクリーンショットだけではscreen reader、実機の方位センサー、屋外照度、iOS PWA、全keyboard flowの適合までは判定できない。実装後に別途検証が必要である。

## 実装の優先順位

### P0: 先にやる

- radius、shadow、blur、borderのtokenを定義し直す。
- 英字eyebrowを用途で棚卸しし、約70%削減する。
- proper icon setへ統一する。Lucideなどの既存ライブラリを使い、手描きSVGや文字記号の追加は避ける。
- topbarを3操作へ整理する。
- update toastが入力欄を覆わないようにする。
- mobile inputを16 px、主要tap targetを44 pxへ揃える。

### P1: 情報設計を整える

- PC右ペインを日時固定 + 4タブ + 1主コンテンツにする。
- スマホを段階式bottom sheetにする。
- celestial cardsを「1枚の詳細 + compact rows」にする。
- 設定、計画のcard nestingを減らす。

### P2: CelestiFrame固有の顔を作る

- Sky-state railを実装する。
- 地図filterを再調整し、写真計画に必要な道路・地形を読みやすくする。
- typographyをbundleし、数値と文章の役割を分ける。
- 現地撮影モードを全体のvisual benchmarkとして微調整する。

### P3: PWA polish

- manifest screenshots / shortcuts / orientationを整える。
- offline、update、standalone、landscapeを検証する。
- dark / light / redでアクセシビリティと実機の屋外視認性を確認する。

## 完了条件

- 1画面で同時に見えるsurface階層は最大3段階。
- 各ペインのprimary actionは原則1つ。
- 意味のない英字eyebrow、glow、pill、gradientを残さない。
- 390 px幅で主要操作が44 × 44 px以上。
- スマホinputは16 px以上。
- 主要文字はWCAG AA contrastを満たす。
- keyboard focusがtopbar、bottom sheet、toastに隠れない。
- reduced motionで意味を失わない。
- PC、スマホ縦、スマホ横、standalone、offlineを別々に確認する。
- 地図、撮影地点、被写体、日時、天体、重なり、構図、保存、現地案内の主要flowを壊さない。

## 避ける案

- さらに強いglassmorphismやLiquid Glass風の全面blur
- 背景の発光orb、星粒子、意味のないambient animation
- すべての見出しへの英語subtitle
- すべてのbuttonをpillにする
- すべてのカードへgradient borderとglowを付ける
- ダッシュボード風の大きな数値カードを追加する
- 見た目だけの3D、AR、パララックス
- 情報量を隠しただけで操作回数が増える「ミニマル化」

## 参考資料

### 現行デザインシステム・アクセシビリティ

- [Google Design: Expressive Design — Google's UX Research](https://design.google/library/expressive-material-design-google-research)
- [Google Design: Material Design's evolution](https://design.google/library/material-design-eras)
- [Apple Human Interface Guidelines: Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode)
- [Vercel: Web Interface Guidelines](https://vercel.com/design/guidelines)
- [W3C: What's New in WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)
- [W3C: Dialog (Modal) Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- [W3C: HTML dialog technique H102](https://www.w3.org/WAI/WCAG22/Techniques/html/H102)

### Adaptive UI / motion / PWA

- [Android Developers: Supporting pane layout](https://developer.android.com/develop/adaptive-apps/guides/build-a-supporting-pane-layout)
- [MDN: View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API)
- [web.dev: App design for PWAs](https://web.dev/learn/pwa/app-design)
- [web.dev: What makes a good PWA?](https://web.dev/articles/pwa-checklist)
- [web.dev: Updating a PWA](https://web.dev/learn/pwa/update)
- [MDN: Web app manifest](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest)
- [MDN: Web app shortcuts](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/shortcuts)

### 比較対象

- [The Photographer's Ephemeris](https://photoephemeris.com/en-GB/)
- [TPE Web: Location Lists](https://photoephemeris.com/en-GB/news/location-lists-now-in-tpe-web/)
- [Windy](https://www.windy.com/)
- [Stellarium Web](https://stellarium-web.org/)

---

この文書は「トレンドに合わせて別物にする」ためではなく、CelestiFrameがすでに持っている地図・天体・構図・現地支援の強さを、もっと短時間で理解できる見た目へ変えるための方針である。
