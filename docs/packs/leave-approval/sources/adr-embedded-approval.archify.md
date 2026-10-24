# ADR-0001：簽核內建於請假服務 {#adr-embedded-approval}

LeaveFlow 把簽核做成**請假服務內的一個模組**，不另建共用簽核引擎，也不採用 BPM 產品。

- 目前只有請假需要簽核，請假專用的關卡規則用程式寫最快交付。
- 簽核動作、額度實扣與 outbox 事件可以在同一個資料庫交易內完成。
- 少一個服務或一套 BPM 平台要部署、升級與監控。

@answer scope="LeaveFlow（虛構）· 請假簽核 · 狀態：已採納"
@meta locale=zh-TW

## 這個決策要解決什麼問題？ {#context}

請假簽核的關卡會隨假別與天數改變。不超過 3 天由直屬主管簽，超過 3 天加部門主管。婚假、喪假、公假與超過 3 天的病假，還要附證明並加人資審核關。

簽核人可以退回補件、臨時加簽，會簽關卡要全部同意才通過。關卡 24 小時未簽會提醒，48 小時自動升級給上一層主管。

核准時要實扣額度，並通知出勤、薪資與行事曆。這些變更必須一致：不能出現假單已核准、額度卻沒扣的情況。

@callout level=note title="範圍"
| 目前只有請假走簽核。加班、出差、報銷尚未納入 LeaveFlow。 |

## 考慮過哪些選項？ {#options}

| 比較項目 | A 請假服務內建簽核模組 | B 共用簽核引擎服務 | C 採用 BPM 產品（如 Camunda、Flowable） |
| --- | --- | --- | --- |
| 交付速度 | 最快，沿用請假服務的程式與資料庫 {good:快} | 要先設計通用 API 與表單模型 {caution:較慢} | 要導入平台、建模與整合 {bad:最慢} |
| 規則彈性 | 規則寫在程式，改規則要發版 {caution:需發版} | 規則抽象成設定，通用但較繞 | 流程圖可視化設定 {good:最高} |
| 維運成本 | 不增加部署單元 {good:低} | 多一個服務與資料庫 {caution:中} | 多一套平台與引擎資料庫 {bad:高} |
| 跨表單重用 | 只服務請假 {caution:不可重用} | 加班、出差、報銷可共用 {good:可重用} | 可重用 {good:可重用} |
| 交易一致性 | 簽核與額度同一交易 {good:單一交易} | 跨服務，需要補償或事件 | 跨系統，需要補償或事件 |

## 決定採用哪個選項？ {#decision span=12}

採用 **A：請假服務內建簽核模組**。簽核服務、路由引擎與代理解析是請假服務內的元件，與假單、額度共用同一個請假資料庫。

@architecture id=embedded-approval title="簽核模組位於請假服務內"
| portal | 員工入口 | frontend |
| approval | 簽核服務 | backend |
| routing | 路由引擎 | backend |
| balance | 額度服務 | backend |
| leave-db | 請假資料庫 | database |
| portal > approval | | emphasis |
| approval > routing | | |
| approval > balance | | |
| approval > leave-db | | emphasis |

@steps id=decision-steps
| approve | 簽核服務 | 收到主管的核准或駁回，檢查代理權限後記錄動作；會簽全部同意才往下走。 | embedded-approval | approval |
| route | 路由引擎 | 依假別與天數決定下一關；沒有下一關就結案。 | embedded-approval | routing |
| deduct | 額度服務 | 最後一關通過時，把預扣轉成實扣。 | embedded-approval | balance |
| commit | 請假資料庫 | 動作、額度、假單核准與 outbox 列一起提交；事件發佈器之後送出 `leave.approved`。 | embedded-approval | leave-db |

## 這個決策帶來什麼影響？ {#consequences}

| 影響 | 性質 |
| --- | --- |
| 第一版只需交付請假服務，不必先做通用簽核平台 | {good:正面} |
| 簽核、額度與 outbox 在單一交易內，不需要補償流程 | {good:正面} |
| 部署單元與維運監控維持現狀 | {good:正面} |
| 路由規則寫在程式中，調整天數門檻或假別要發版 | {caution:負面} |
| 其他表單無法直接重用簽核；日後抽離需要搬移資料表與 API | {caution:負面} |
| 業務人員無法自行設定流程，需要開發團隊協助 | {caution:負面} |

## 什麼情況要重新評估？ {#revisit}

- 加班、出差或報銷也需要簽核時，把 approval 模組抽離成共用簽核服務。
- 路由規則需要業務人員自行設定，且改版頻率高過發版節奏時，評估 BPM 產品。
- 會簽、加簽之外出現平行分支或子流程等需求時，重新比較選項 B 與 C。

@callout level=note title="降低日後抽離成本"
| 簽核資料表集中在 `approval_steps`、`approval_actions`、`delegations`，抽離時搬移範圍明確。 |

## 這份紀錄的狀態？ {#status}

@facts
| 狀態 | 已採納 |
| 負責 | 請假團隊 |
| 影響範圍 | 請假服務、請假資料庫、事件發佈 |
| 重新評估條件 | 其他表單需要簽核，或路由規則需由業務人員自行設定 |
