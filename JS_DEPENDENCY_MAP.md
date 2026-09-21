# JS依存関係・責務マップ（v129）

更新日：2026-09-22  
対象：`work/v105`  
根拠：`index.html` の実際の script 読み込み順と各ファイルの現行内容。

## 読み込み順

1. `db.js` — IndexedDB のストア、meta、バッチ更新
2. `migration.js` — 旧データの読取りと変換
3. `xlsx-reader.js` — XLSX の読取り
4. `csv-export.js` — CSV 出力データの生成
5. `app-core.js` — 共通状態、認証、日付・文字列処理、下書き状態
6. `app-shell.js` — 教師用・児童用シェル、ホーム、共通一覧
7. `app-settings-core.js` — 設定ルーター、設定カード、設定ページ骨格
8. `app-help.js` — ヘルプ本文と検索
9. `app-settings-display.js` — 表示、児童用表示、アイコン、フッター
10. `app-settings-records.js` — メモ・賞状・支援級タグの候補
11. `app-settings-security.js` — 年度、PIN、データ保護、新年度切替
12. `app-settings-classes.js` — クラス、名簿、転出入、統合、交流配慮
13. `app-settings.js` — 旧参照を維持する互換マーカー
14. `app-data-import.js` — 外部表の検査と取込
15. `app-data-crypto.js` — PBKDF2/AES-GCM、暗号化ファイル、バックアップ
16. `app-data-sync.js` — 同期履歴、差分計画、統合、同期練習
17. `app-data-migration.js` — 旧形式移行、削除確認、CSV、全消去
18. `app-notebook-history.js` — ノート評価履歴の集約と表示
19. `app-records.js` — 宿題、提出物、ノート評価、記録の保存・編集
20. `app-behavior.js` — 行動記録
21. `app-grades.js` — 小テスト・成績の確認
22. `app-seating.js` — 席替え
23. `app-reports.js` — 所見と児童概要
24. `app-data.js` — データ管理画面と各データ機能の入口
25. `app.js` — 起動、Service Worker、共通入力・離脱処理

この順番は通常 script のグローバル参照に依存する。ES module 化や順番の入替えは、別途すべての参照を移行するまで行わない。

## 現在の規模

| ファイル | バイト数 | 関数定義数 |
|---|---:|---:|
| `db.js` | 6,122 | 21 |
| `migration.js` | 17,253 | 22 |
| `xlsx-reader.js` | 6,811 | 12 |
| `csv-export.js` | 5,480 | 8 |
| `app-core.js` | 60,176 | 88 |
| `app-shell.js` | 74,981 | 73 |
| `app-settings-core.js` | 10,496 | 16 |
| `app-help.js` | 34,604 | 17 |
| `app-settings-display.js` | 18,499 | 9 |
| `app-settings-records.js` | 4,675 | 2 |
| `app-settings-security.js` | 27,630 | 15 |
| `app-settings-classes.js` | 49,064 | 22 |
| `app-settings.js` | 150 | 0 |
| `app-data-import.js` | 17,880 | 12 |
| `app-data-crypto.js` | 14,941 | 14 |
| `app-data-sync.js` | 14,992 | 17 |
| `app-data-migration.js` | 21,989 | 14 |
| `app-notebook-history.js` | 2,261 | 0 |
| `app-records.js` | 87,290 | 66 |
| `app-behavior.js` | 19,187 | 16 |
| `app-grades.js` | 40,801 | 27 |
| `app-seating.js` | 35,029 | 29 |
| `app-reports.js` | 41,717 | 21 |
| `app-data.js` | 14,673 | 3 |
| `app.js` | 2,853 | 0 |

## 境界とデータ互換性

| 領域 | 担当 | 固定する互換境界 |
|---|---|---|
| 保存 | `db.js` | IndexedDB のストア名、キー、meta キー、レコード形式 |
| 暗号化・同期 | `app-data-crypto.js`、`app-data-sync.js` | 暗号化封筒 v1/v2、同期ペイロード v1、競合時に新しい更新日時を採用する規則 |
| 記録 | `app-records.js`、`app-notebook-history.js` | 既存の記録 type、ノート評価の旧 sessionKey の読取り |
| 設定 | `app-settings-*.js` | 設定値の meta キー、明示保存と自動保存の意味 |
| 表示 | `app-shell.js`、`app-settings-display.js` | 教師用と児童用の操作境界、説明量で主操作・状態・順序を変えない規則 |

`app-settings.js` はファイル順と過去の参照を保つためだけに残る。新しい設定実装は対応する `app-settings-*.js` に置く。

## 設定画面の責務

- `app-settings-core.js` は設定内の移動を `openSettingsRoute` と `navigateSafely` に集約する。
- `app-settings-display.js` は即時保存の設定を `data-auto-save` として扱い、離脱確認の対象にしない。
- `app-settings-classes.js` は名簿の明示保存下書きを `state.drafts.roster` に保持する。
- `app-settings-records.js`、`app-settings-security.js`、`app-reports.js`、`app-data.js`、`app-settings-classes.js`、`app-settings-display.js` の移行済み画面は、描画後のカード加工を使わず、初期 HTML から役割付きカードを出力する。

## 検証の入口

`tests/run-tests.js` は次の回帰テストを順番に読み込む。

1. `notebook-history-regression.test.js`
2. `data-format-regression.test.js`
3. `settings-card-regression.test.js`
4. `release-integrity.test.js`
5. `daily-input-regression.test.js`
6. `gradebook-regression.test.js`

構文検査とこれらの回帰テストは Node 実行環境で確認済みである。ブラウザ、iPad Safari、実データを使う同期は別の実機確認として扱い、ここで確認済みとはしない。
