# JS依存関係・責務マップ（v127）

生成日：2026-09-21  
対象：`work/v105`

## 読み込み順

1. `db.js`
2. `migration.js`
3. `xlsx-reader.js`
4. `csv-export.js`
5. `app-core.js`
6. `app-shell.js`
7. `app-settings-core.js`
8. `app-help.js`
9. `app-settings-display.js`
10. `app-settings-records.js`
11. `app-settings-security.js`
12. `app-settings-classes.js`
13. `app-settings.js`（互換マーカー）
14. `app-data-import.js`
15. `app-data-crypto.js`
16. `app-data-sync.js`
17. `app-data-migration.js`
18. `app-records.js`
19. `app-behavior.js`
20. `app-grades.js`
21. `app-seating.js`
22. `app-reports.js`
23. `app-data.js`（データ画面・互換入口）
24. `app.js`

## ファイル規模

| ファイル | バイト数 | 関数定義数 |
|---|---:|---:|
| `app-behavior.js` | 19187 | 16 |
| `app-core.js` | 59428 | 81 |
| `app-data.js` | 84457 | 60 |
| `app-grades.js` | 39961 | 26 |
| `app-records.js` | 88265 | 65 |
| `app-reports.js` | 41708 | 21 |
| `app-seating.js` | 35029 | 29 |
| `app-help.js` | 33907 | 16 |
| `app-data-import.js` | 17880 | 12 |
| `app-data-crypto.js` | 14941 | 14 |
| `app-data-sync.js` | 14992 | 17 |
| `app-data-migration.js` | 21989 | 14 |
| `app-settings-core.js` | 7836 | 9 |
| `app-settings-display.js` | 20257 | 9 |
| `app-settings-records.js` | 4241 | 2 |
| `app-settings-security.js` | 27556 | 15 |
| `app-settings-classes.js` | 48122 | 22 |
| `app-settings.js` | 150 | 0 |
| `app-data.js` | 13468 | 3 |
| `app-shell.js` | 73825 | 71 |
| `app.js` | 2762 | 0 |
| `csv-export.js` | 5480 | 8 |
| `db.js` | 6122 | 21 |
| `migration.js` | 17253 | 22 |
| `sw.js` | 1370 | 0 |
| `xlsx-reader.js` | 6811 | 12 |

## 主要なファイル間参照

短すぎる汎用名とオブジェクトメソッド名を除き、他ファイルで定義された関数を直接呼び出している箇所を抽出しています。

| 呼び出し元 | 参照先 | 参照関数数 | 代表的な関数 |
|---|---|---:|---|
| `app-behavior.js` | `app-core.js` | 9 | `today`、`jpDate`、`moveDate`、`selectedClass`、`isSupportClass`、`showUndoToast`、`feedbackClass`、`closeDialog` ほか |
| `app-behavior.js` | `app-records.js` | 2 | `recordModeTabs`、`renderStudentRecords` |
| `app-behavior.js` | `app-shell.js` | 9 | `teacherToolShell`、`wireToolHome`、`activeSeatGridTemplate`、`teacherOrderMode`、`teacherOrderControlHtml`、`wireTeacherOrder`、`pupilDateNav`、`rosterForClass` ほか |
| `app-behavior.js` | `db.js` | 1 | `getAllByIndex` |
| `app-core.js` | `app-data.js` | 6 | `readImportText`、`validateEncryptedEnvelope`、`validateSyncPayload`、`protectText`、`decryptEnvelope`、`resetToWelcomePreservingLegacy` |
| `app-core.js` | `app-records.js` | 1 | `mondayOf` |
| `app-core.js` | `app-settings.js` | 1 | `saveRoster` |
| `app-core.js` | `app-shell.js` | 6 | `renderHome`、`headerHtml`、`teacherFooter`、`renderPupil`、`rosterForClass`、`renderSettings` |
| `app-core.js` | `db.js` | 6 | `deviceId`、`getAll`、`getAllByIndex`、`getMeta`、`setMeta`、`replaceAllRaw` |
| `app-core.js` | `migration.js` | 1 | `fromStorage` |
| `app-data.js` | `app-core.js` | 18 | `today`、`jpDate`、`selectedClass`、`isSupportClass`、`normalizeStudentName`、`applyClassTheme`、`showToast`、`closeDialog` ほか |
| `app-data.js` | `app-records.js` | 1 | `mondayOf` |
| `app-data.js` | `app-reports.js` | 1 | `currentTermRange` |
| `app-data.js` | `app-settings.js` | 3 | `settingsPageLead`、`wireSettingsHome`、`cardifySettingsPanels` |
| `app-data.js` | `app-shell.js` | 7 | `renderHome`、`teacherToolShell`、`wireToolHome`、`renderPupil`、`rosterForClass`、`rosterForRange`、`renderSettings` |
| `app-data.js` | `csv-export.js` | 2 | `submissionRows`、`assessmentRows` |
| `app-data.js` | `db.js` | 9 | `deviceId`、`getAll`、`getAllByIndex`、`putMany`、`getMeta`、`setMeta`、`resetAll`、`applyBatch` ほか |
| `app-data.js` | `migration.js` | 5 | `fromFiles`、`fromStorage`、`roster`、`records`、`classPatch` |
| `app-grades.js` | `app-core.js` | 10 | `today`、`jpDate`、`selectedClass`、`classSubjects`、`normalizeStudentName`、`applyClassTheme`、`showToast`、`closeDialog` ほか |
| `app-grades.js` | `app-records.js` | 4 | `simpleHash`、`notebookSummaryPeriodRange`、`notebookAverageLabel`、`notebookStudentSummary` |
| `app-grades.js` | `app-shell.js` | 7 | `operationTipHtml`、`teacherToolShell`、`wireToolHome`、`subjectExempt`、`renderPupil`、`rosterForClass`、`rosterForRange` |
| `app-grades.js` | `db.js` | 3 | `getAllByIndex`、`putMany`、`setMeta` |
| `app-grades.js` | `xlsx-reader.js` | 1 | `readWorkbook` |
| `app-records.js` | `app-behavior.js` | 4 | `behaviorDraft`、`behaviorCategory`、`behaviorRecordId`、`renderBehavior` |
| `app-records.js` | `app-core.js` | 21 | `today`、`jpDate`、`shortJpDate`、`moveDate`、`daysBetween`、`currentWeekStart`、`slashDate`、`pupilText` ほか |
| `app-records.js` | `app-shell.js` | 17 | `renderHome`、`operationTipHtml`、`teacherToolShell`、`wireToolHome`、`submissionExempt`、`subjectExempt`、`teacherRosterCards`、`teacherOrderMode` ほか |
| `app-records.js` | `db.js` | 5 | `deviceId`、`getAll`、`getAllByIndex`、`getMeta`、`applyBatch` |
| `app-reports.js` | `app-core.js` | 15 | `today`、`jpDate`、`shortJpDate`、`moveDate`、`daysBetween`、`slashDate`、`selectedClass`、`classSubjects` ほか |
| `app-reports.js` | `app-records.js` | 11 | `notebookSessionKey`、`notebookGradeText`、`notebookViewpointGrades`、`notebookOverallGrade`、`notebookViewpointText`、`notebookViewpointPickerHtml`、`wireNotebookViewpointPicker`、`readNotebookViewpointGrades` ほか |
| `app-reports.js` | `app-settings.js` | 3 | `settingsPageLead`、`wireSettingsHome`、`cardifySettingsPanels` |
| `app-reports.js` | `app-shell.js` | 15 | `renderHome`、`openTool`、`teacherToolShell`、`wireToolHome`、`teacherRosterCards`、`wireStudentDetails`、`renderPupil`、`rosterForClass` ほか |
| `app-reports.js` | `db.js` | 4 | `getAllByIndex`、`putRaw`、`getMeta`、`setMeta` |
| `app-seating.js` | `app-core.js` | 8 | `today`、`jpDate`、`selectedClass`、`applyClassTheme`、`showToast`、`closeDialog`、`openDialog`、`teacherActive` |
| `app-seating.js` | `app-shell.js` | 5 | `teacherToolShell`、`openPrintPreview`、`wireToolHome`、`renderPupil`、`rosterForClass` |
| `app-seating.js` | `db.js` | 3 | `getAllByIndex`、`getMeta`、`setMeta` |
| `app-settings.js` | `app-core.js` | 34 | `normalizeFooterLayout`、`footerLabel`、`navigateSafely`、`today`、`schoolYear`、`yearNumberOf`、`jpDate`、`selectedClass` ほか |
| `app-settings.js` | `app-data.js` | 9 | `readImportText`、`validateEncryptedEnvelope`、`validateSyncPayload`、`protectText`、`unprotectText`、`decryptEnvelope`、`collectYearPayload`、`createEncryptedFile` ほか |
| `app-settings.js` | `app-reports.js` | 3 | `defaultReportPrompt`、`renderPromptSettings`、`renderStudentOverview` |
| `app-settings.js` | `app-seating.js` | 1 | `renderSeating` |
| `app-settings.js` | `app-shell.js` | 11 | `renderHome`、`pupilOverviewOptionsHtml`、`readPupilOverviewOptions`、`savePupilOverviewOptions`、`openTool`、`openFooterItem`、`teacherToolShell`、`wireToolHome` ほか |
| `app-settings.js` | `db.js` | 6 | `deviceId`、`getAll`、`getAllByIndex`、`getMeta`、`setMeta`、`applyBatch` |
| `app-shell.js` | `app-core.js` | 37 | `normalizeFooterLayout`、`footerLabel`、`navigateSafely`、`today`、`schoolYear`、`rolloverDue`、`jpDate`、`shortJpDate` ほか |
| `app-shell.js` | `app-data.js` | 1 | `openLegacyMigrationReview` |
| `app-shell.js` | `app-records.js` | 10 | `weeklyData`、`missingRecurringWeeks`、`currentWeeklyOccurrences`、`weeklyRenewalNotice`、`injectWeeklyDeadlineNotice`、`wireWeeklyRenewal`、`maybePromptWeeklyCreation`、`mondayOf` ほか |
| `app-shell.js` | `app-reports.js` | 1 | `renderStudentOverview` |
| `app-shell.js` | `app-settings.js` | 3 | `renderSettingsContent`、`renderHelp`、`renderYearRollover` |
| `app-shell.js` | `db.js` | 6 | `deviceId`、`getAll`、`getAllByIndex`、`getMeta`、`setMeta`、`applyBatch` |
| `app-shell.js` | `migration.js` | 1 | `fromStorage` |
| `app.js` | `app-core.js` | 5 | `friendlyTerms`、`applyFriendlyTerms`、`showToast`、`loadState`、`toggleTheme` |
| `app.js` | `app-shell.js` | 1 | `updateConnectionStatus` |

## 重複定義

- v117の全JSを機械検査し、同名のトップレベル関数重複は0件。
- `helpLandingHtml` は `app-help.js` に1件のみ。

## 設定・データ領域の分割境界

- `app-settings-core.js`：設定ルーター、パンくず、共通カード、設定ページ骨格。
- `app-help.js`：ヘルプ本文、検索、初回ガイド、画面移動。
- `app-settings-display.js`：情報量、明るさ、児童一覧、児童用表示、アイコン、フッター。
- `app-settings-records.js`：児童メモ・賞状・支援級タグ、記録候補の入口。
- `app-settings-security.js`：年度、教師用PIN、年度パスワード、PIN省略、新年度切替。
- `app-settings-classes.js`：クラス編集、名簿、転入・転出、統合、交流配慮。
- `app-settings.js`：互換マーカーのみ（新規実装は追加しない）。
- `app-data-import.js`：ファイルサイズ・形式検証、外部表取込。
- `app-data-crypto.js`：PBKDF2/AES-GCM、暗号化ファイル、バックアップ、事前スナップショット。
- `app-data-sync.js`：同期履歴、同期練習、差分計画、確認ダイアログ、統合。
- `app-data-migration.js`：旧形式移行、削除確認、CSV出力、全データ削除。
- `app-data.js`：データ画面の描画と設定ルートの互換入口。データ処理本体は新4ファイルに置き、v119で目的カードを単一ナビゲーションへ整理。
- `app-data.js`：暗号化、同期計画、バックアップ復元、CSV、外部取込、旧データ移行、画面描画が同居しています。
- `app-reports.js`：所見画面に加え、設定用の所見プロンプト編集を保持しています。
- `app-shell.js`：ホーム・共通シェルに加え、設定・ヘルプへの直接導線を保持しています。

## 分割時に固定する境界

1. IndexedDBストア名、metaキー、レコード形式、暗号化ファイル形式は変更しません。
2. `renderSettingsContent` を設定ルートの唯一の描画入口にします（v116で実施）。
3. ヘルプからの移動は共通設定ルーターへ寄せます。
4. 暗号化・同期計画はDOM描画から分け、入出力画面から呼び出します。
5. ファイル移動だけの版で構文・参照・保存値を確認してからUIを変更します。
