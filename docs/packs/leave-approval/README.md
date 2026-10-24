# LeaveFlow 請假簽核參考文件包

LeaveFlow 是一個**虛構**的企業人資請假簽核系統，只用來示範 Archify 如何把 BRD、SRS、SAD、SDD、ADR 的圖串成可追溯的文件包。內容不描述任何真實產品或組織；以下規則中的數值（天數、時數）皆為設計假設。

- `leave-approval.pack.json`：文件、章節與共用元素 ID。
- `sources/`：Archify 原始 JSON（ADR 為一頁式 explainer）。
- `artifacts/`：由 `npm --prefix archify run build:packs` 產生，請勿手改。

## 設計決策

簽核**內建於請假服務**（請假專用），不建共用簽核引擎、不採用外部 BPM 產品；理由與重新評估條件見 ADR-0001。

## 領域事實（所有圖的唯一依據）

角色：**員工**（申請人）、**代理人**、**直屬主管**、**部門主管**、**人資**、**系統管理員**。

外部系統：**企業 SSO**（OIDC 登入）、**人事主檔 HRIS**（組織、職級、主管關係）、**出勤打卡系統**、**薪資系統**、**通知服務**（Email／Teams）、**行事曆**（Exchange）。

業務規則：

1. 假別：特休、病假、事假、婚假、喪假、公假；以小時計，最小單位 1 小時。
2. 額度：送出時**預扣**，核准時**實扣**，駁回、撤回、銷假時**回補**。
3. 代理人：送出後先由代理人確認；代理人拒絕則退回申請人。
4. 動態關卡：≤ 3 天由直屬主管簽；> 3 天加部門主管；婚假、喪假、公假，以及 > 3 天病假須附證明並加人資審核關。
5. 代理簽核：主管可設定代理期間，期間內關卡自動轉給代理主管。
6. 退回補件：簽核人可退回申請人補件；重送時從被退回的關卡重新簽，已簽紀錄保留。
7. 加簽與會簽：簽核人可臨時加一關（加簽）；會簽關卡由多人並簽，全部同意才通過，任一駁回即駁回。
8. 逾時：關卡 24 小時未簽發提醒，48 小時自動升級給上一層主管。
9. 核准後：同步出勤系統、扣薪假別通知薪資系統、寫入行事曆，並通知申請人與代理人。
10. 撤回與銷假：簽核完成前可撤回；核准後、請假開始前可申請銷假，由直屬主管簡化簽核。

### 容器（C4 L2）與節點 ID

| 節點 ID | 名稱 | 技術 | 元素 |
|---|---|---|---|
| `employee-portal` | 員工入口 | React SPA · 行動版 | `C-10` |
| `hr-console` | 人資後台 | React SPA | `C-11` |
| `leave-api` | 請假服務（含簽核） | Java · Spring Boot · REST/JSON | `C-20` |
| `scheduler` | 排程工作者 | 逾時提醒、升級、年度發額 | `C-21` |
| `integration-worker` | 整合工作者 | 出勤、薪資、行事曆同步 | `C-22` |
| `message-queue` | 訊息佇列 | RabbitMQ | `C-30` |
| `leave-db` | 請假資料庫 | PostgreSQL | `C-40` |

外部系統節點 ID：`sso`、`hris`、`attendance`、`payroll`、`notify`、`calendar`。
人員節點 ID：`employee`、`deputy`、`supervisor`、`dept-head`、`hr`。

### 請假服務元件（C4 L3）與節點 ID

| 節點 ID | 名稱 | 職責 | 元素 |
|---|---|---|---|
| `rest-controller` | REST 控制器 | 端點、輸入驗證 | `CP-20` |
| `auth-filter` | 身分驗證 | OIDC token、角色與部門範圍 | `CP-21` |
| `leave-service` | 假單服務 | 建立、送出、撤回、銷假 | `CP-22` |
| `balance-service` | 額度服務 | 時數計算、預扣、實扣、回補 | `CP-23` |
| `routing-engine` | 簽核路由引擎 | 依假別與天數產生關卡 | `CP-24` |
| `approval-service` | 簽核服務 | 核准、駁回、退回、加簽、會簽 | `CP-25` |
| `delegation-resolver` | 代理解析 | 代理人與代理主管 | `CP-26` |
| `leave-repository` | 資料存取 | 假單、關卡、額度的 SQL | `CP-27` |
| `outbox-publisher` | 事件發佈 | 交易性 outbox 發佈事件 | `CP-28` |

### 資料表（ERD）

`employees`、`org_units`、`leave_types`、`leave_balances`、`leave_requests`、`approval_steps`、`approval_actions`、`delegations`、`attachments`、`outbox_events`。
元素：`D-10` 假單（leave_requests）、`D-11` 假別額度（leave_balances）、`D-12` 簽核關卡（approval_steps）、`D-13` 代理設定（delegations）。

### 業務流程

`OP-10` 申請請假 · `OP-20` 逐關簽核 · `OP-30` 逾時提醒與升級 · `OP-40` 撤回與銷假 · `OP-50` 同步出勤與薪資。

### 假單狀態

`draft` 草稿 → `pending_deputy` 待代理確認 → `in_review` 簽核中 → `approved` 已核准；
另有 `returned` 退回補件（重送回 `in_review`）、`rejected` 已駁回、`withdrawn` 已撤回、`cancel_requested` 銷假申請中 → `cancelled` 已銷假。
