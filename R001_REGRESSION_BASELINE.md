# R001 変更前回帰基準（v129）

確認日：2026-09-22  
基準ZIP：`class-support-app_v129_release_device-unverified.zip`

## 実行結果

- `tests/run-tests.js` の回帰テスト6件：成功
- アプリ本体とテストのJavaScript構文解析33本：成功

この環境では通常の `node` CLI が提供されないため、同じテストランナーをNode実行環境から読み込んで実行した。PC/iPad実機確認ではない。

## テストが守る仕様

| テスト | 守る仕様 |
|---|---|
| `notebook-history-regression.test.js` | ノート評価の現行・旧sessionKey、履歴順、欠席・未提出集計、過去回の表示経路 |
| `data-format-regression.test.js` | 暗号化封筒v1/v2、同期ペイロードv1、年度・クラス参照、重複キー、更新日時の比較 |
| `settings-card-regression.test.js` | 設定カードの役割、下書き状態、設定ルート、旧カード加工ヘルパーがないこと |
| `release-integrity.test.js` | APP_VERSION、HTML資材番号、Service Workerキャッシュ番号の一致 |
| `daily-input-regression.test.js` | 教師用・児童用の毎日宿題状態遷移、ノート評価・小テストの取消導線 |
| `gradebook-regression.test.js` | 紙テスト全員0点の未実施扱い、小テスト0点、欠席・未提出の平均除外説明 |

## テストが保証しない仕様

- IndexedDBの実トランザクション、保存失敗時のロールバック、削除範囲
- 同期の削除承認、同一更新時刻競合、端末別meta設定、年度別復元
- 表示設定画面のDOM描画、イベント登録、保存後の即時反映
- iPad Safari、PCブラウザ、29～36人表示、長い履歴、固定フッター
- CSVの引用符内改行、氏名・出席番号不一致、実ファイルの取込
- 自動ロック時のダイアログ閉鎖

R101以降では、変更する仕様に対応した実行可能な回帰テストを追加し、この基準を毎回実行する。
