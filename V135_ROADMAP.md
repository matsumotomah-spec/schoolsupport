# v135 修正ロードマップ（現状反映版）

## 判定基準

- **完了**：コード実装と静的検証が完了
- **部分完了**：コードの一部は対応済みだが、導線または資料が未整理
- **通常業務中に表示確認**：iPad Safariで画面を開いたときに確認する項目
- **実務中の不具合対応**：特殊な再現テストは行わず、実際に発生した場合に調査する項目

| 優先度 | 状態 | 対象 | 主な場所 |
|---|---|---|---|
| P0 | 完了 | v135のHTML・Service Worker・アプリ版番号整合 | `app-core.js`, `index.html`, `app.js`, `sw.js` |
| P0 | 完了 | 固定アイコン・🏅表示・表示設定の整理 | `app-settings-display.js`, `app-core.js` |
| P0 | 完了 | 行動記録カテゴリーの初期化・変更ボタン | `app-shell.js`, `app-behavior.js`, `app-records.js` |
| P1 | 完了 | 紙テストExcelのデータ管理入口 | `app-data-migration.js`, `app-grades.js` |
| P1 | 完了 | 紙テスト得点一覧の児童カード化 | `app-grades.js`, `styles.css` |
| P1 | 完了 | ノート評価一覧の児童カード化 | `app-records.js`, `styles.css` |
| P1 | 完了 | 席設定済み時の座席表優先表示・条件折りたたみ | `app-seating.js`, `styles.css` |
| P1 | 完了 | 個別支援級児童メモの広幅化 | `app-records.js`, `styles.css` |
| P1 | 完了 | 紙テスト取込確認ダイアログの広幅化 | `app-grades.js`, `styles.css` |
| P1 | 部分完了 | 同期履歴・競合・同期前確認の情報整理 | `app-data.js`, `app-data-sync.js` |
| P1 | 部分完了 | スマート取込での名簿ファイル判別 | `app-data-migration.js`, `app-data-import.js` |
| P1 | 完了 | 固定アイコン化後の回帰テスト更新 | `tests/appearance-scope-regression.test.js`, `tests/settings-card-regression.test.js` |
| P2 | 完了 | v135資料・リリースチェックリストの版整合 | `README.md`, `RELEASE_CHECKLIST.md` |
| P2 | 通常業務中に表示確認 | Safariの縦幅、固定フッター、ダークモード、ダイアログ見切れ | iPad Safari |
| P2 | 実務中の不具合対応 | 特殊な同期不整合・削除競合・復旧異常 | `app-data-sync.js`, `app-data-crypto.js` |

## 今回の完了条件

- 全回帰テストが通ること
- JavaScript全ファイルの構文検査が通ること
- `app.js`を含むv135参照が揃っていること
- 個別支援級児童メモと紙テスト取込確認画面が標準幅より広いこと
- 実機確認は表示上の問題に限定し、同期の特殊再現を要求しないこと

## 残作業

1. 同期画面の補助情報を、利用者が迷わない単位へ再整理する。
2. スマート取込で名簿Excelを扱うか、名簿設定画面に限定するかを決める。
3. 実務中に表示上の問題が報告された場合に修正する。
