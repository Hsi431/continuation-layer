# Continuation Layer

[English](README.md)

> 讓 Codex 長任務跨過冷卻牆、context 壓縮與 session 中斷後，還能安全接續。

Continuation Layer 是一個給 CLI coding agent 用的任務續接層。

當 Codex 跑長任務時，最煩的不是它不會寫 code，而是它常常在快完成時撞到這些問題：

- 撞到 5 小時冷卻牆，任務停在一半。
- Context 快滿，被壓縮後漏掉關鍵決策。
- Resume 回來時看似接上了，其實已經忘了做過什麼。
- 新 session 又重新掃 repo，重做探索，浪費額度。
- 過夜跑任務時，還是得人盯著它有沒有死掉。

Continuation Layer 把任務狀態寫進 repo 裡，讓 agent 可以停下來、交接、恢復、再接著做。

```text
不是靠聊天紀錄續命。
不是靠 provider 私有 cache。
不是靠切帳號或繞限制。

它靠的是 repo 裡可檢查、可追蹤、可恢復的 durable state。
```

## Problem / Before-After

| Before                              | After                                            |
| ----------------------------------- | ------------------------------------------------ |
| Cooldown wall 讓任務停在一半        | Watch mode 等待 reset 並自動 resume 同一 session |
| Context compaction 可能壓掉關鍵決策 | Continuation 前先寫 handoff                      |
| Resume 看似接上但任務意圖失準       | 接續前先讀 `.agent` durable state                |
| 新 session 重掃 repo、浪費額度      | Child session 從 handoff、git status、diff 恢復  |
| 過夜任務需要人盯                    | Overnight mode 明確開啟，並有 recovery gates     |

## Highlights

- Codex-first v0.1 preview。
- 長駐 cooldown watchdog，reset 後自動 resume 同一個 Codex session。
- Context 快滿時先 handoff，再 continuation。
- Child continuation 使用 `codex fork`。
- `.agent` durable state 是任務真實來源。
- Session chain 可追蹤。
- Overnight mode 預設關閉，必須明確打開。
- Recovery check 失敗會停下來，不會硬做。
- Supervisor 負責 cooldown 偵測、等待與 same-session resume。
- Hooks 只做短生命週期工作，不 sleep 五小時。
- Task completion / archive / cleanup 已完成。
- 不切帳號。
- 不繞 provider limit。
- 不自動 commit。

## 安全邊界

Continuation Layer 不是 provider-limit bypass 工具。

它不會：

- 自動切帳號。
- 偽造 reset window。
- 在 hook 裡 sleep 五小時。
- 自動 commit。
- 自動開 PR。
- 從不完整 handoff 強行續做。
- 把 provider 私有 session storage 當核心狀態。
- 把 compacted summary 當唯一事實來源。

它只做一件事：

```text
讓長任務可以合法暫停，明確交接，安全恢復。
```

Watch mode 只等待 provider reset window。它不繞過限制、不切換帳號、不偽造 reset time，也不在 hooks 裡長時間 sleep。

## 一張圖看懂

```mermaid
flowchart TD
    A["Codex long task"] --> B{"What happened?"}

    B -->|"Cooldown / rate limit"| C["Supervisor records failure snapshot"]
    C --> D["Record next_resume_at"]
    D --> E["Resume same Codex session after reset"]
    E --> F["Read .agent state and git status/diff"]
    F --> G["Continue task"]

    B -->|"Context pressure / compaction risk"| H["Write HANDOFF.md + NEXT.md"]
    H --> I["Write AUTO_SNAPSHOT.md"]
    I --> J{"Overnight mode?"}

    J -->|"Off by default"| K["Ask user before continuation"]
    K --> L["User confirms"]
    L --> M["Start child session with codex fork"]

    J -->|"On explicitly"| N["Run recovery checks"]
    N -->|"Pass"| M
    N -->|"Fail"| O["Stop and wait for user"]

    M --> P["Child session reads handoff"]
    P --> Q["Check git state"]
    Q --> G
```

## 它解決什麼

### 1. 撞冷卻牆後，watchdog 會等待並恢復同一個 session

Codex 撞到 usage limit、rate limit、429 或 reset window 時，Continuation Layer 不會硬凹、不會切帳號、不會亂重開。

它會：

1. 記錄 failure snapshot。
2. 標記目前任務進入 cooldown。
3. 解析 reset time；解析不到就使用有 provenance 標記的 fallback。
4. 把 reset + buffer 記成 `next_resume_at`。
5. Watch mode 會讓前景 supervisor 等到 reset。
6. 用 `codex resume` / `codex exec resume` 接回同一個 session。
7. 接續前先讀 `.agent` 狀態與 git 狀態。

```text
Cooldown wall
  ↓
record failure
  ↓
record legal resume time
  ↓
watch waits through reset window
  ↓
resume same session after reset
  ↓
continue from durable task state
```

如果 provider 沒提供精確 reset time，Continuation Layer 會從 `usage_window_started_at + 5h + buffer` 估算。如果沒有 usage-window anchor，就 fallback 到 `cooldown_detected_at + 5h + buffer`，並把 provenance 標成 `cooldown_detected_fallback`。

Cooldown resume 是 same-session recovery path。Semantic handoff stale 只會是 warning，不會阻止 resume，因為 provider 可能已經拒絕請求，而且 cooldown 等待本身就可能讓 handoff 超過一般 freshness gate。Recovery 會依賴同一個 session id、mechanical snapshot、git state、provider logs 和 resume prompt。

Child continuation 仍維持 strict policy。Stale、missing 或 incomplete handoff 仍可阻止 child-session continuation 與 overnight automation。

如果 watch 在 cooldown 等待期間被中斷，稍後再次執行 `continuity watch` 會接管既有 `cooling_down` state，等待既有 `next_resume_at`，然後 resume 同一個 session，不會重新 start provider task。

### 2. Context 快滿時，不直接相信壓縮摘要

長任務最怕的是 context compaction 把錯的東西留下，把重要的東西壓掉。

Continuation Layer 的策略是：

1. 偵測到 context pressure 或 PreCompact。
2. 先寫 handoff。
3. 先寫下一步。
4. 先保存 git/runtime snapshot。
5. 預設停下來問你要不要開新的 continuation session。
6. 你同意後，用 `codex fork` 從父 session 開 child session 接續。

```text
Context pressure
  ↓
write handoff before compaction
  ↓
ask user
  ↓
codex fork child session
  ↓
recover from .agent + git state
```

新的 session 不用重新猜上下文，也不用重掃整個 repo。

### 3. 過夜模式：明確打開才會自動續

預設情況下，Continuation Layer 不會擅自開新 session。

但如果你要睡覺、出門、長時間不在，可以打開 overnight mode：

```sh
continuity overnight enable
```

打開後，context handoff 完成時，它可以自動開 child session 繼續跑。

但它不是無腦續跑。它會先檢查：

- handoff 是否存在。
- `NEXT.md` 是否存在。
- git state 是否合理。
- parent session 是否可追蹤。
- 是否有 conflict。
- 是否有不完整狀態。
- recovery check 是否通過。

只要 recovery check 失敗，它就會停下來等你。

### 4. 收尾時，舊任務不污染新任務

v0.1 已補上 cleanup lifecycle。

你可以把任務標記完成：

```sh
continuity complete
```

也可以開始乾淨的新任務：

```sh
continuity new-task --task-id next-task
```

系統會先把舊的 active handoff / snapshot archive 起來，再寫新的 active state。新任務不會沿用上一個任務的 handoff。

## 它怎麼保存任務狀態

Continuation Layer 會在你的 repo 裡建立 `.agent/`：

```text
.agent/
  HANDOFF.md          目前任務交接
  NEXT.md             下一個精準步驟
  DECISIONS.md        已確定的重要決策
  AUTO_SNAPSHOT.md    git/runtime 機械快照
  state.json          機器可讀任務狀態
  sessions.jsonl      parent/child session chain
  logs/               supervisor logs
  handoffs/           handoff archive
  snapshots/          snapshot archive
```

這些檔案讓 agent 的任務狀態變成可讀、可查、可恢復。

這個 repository 也 dogfood Continuation Layer。已提交的 `.agent/` 目錄是刻意保留的真實 project-state example，不應包含 provider-private session dumps、secrets 或 machine-local logs。

## 安裝

需求：

- Node.js 20 或更新版本。
- Git。
- 已安裝並登入 Codex CLI。
- 一個可以寫入 `.agent/` durable state 的 git repo。

Clone 並安裝：

```sh
git clone https://github.com/Hsi431/continuation-layer.git
cd continuation-layer
npm install
```

從 source tree 使用：

```sh
node bin/continuity.mjs status
```

或 link 成本機 CLI：

```sh
npm link
continuity status
```

Codex plugin package 放在 `plugins/codex-continuity/`。Dogfood 時請透過你的 Codex plugin workflow 安裝或 link 這個 plugin，然後開新的 Codex thread，讓 hooks 和 skill 被載入。若尚未安裝 plugin，CLI 和 supervisor 仍可從 source tree 使用。

## Quick Start

在你要保護的 repo 裡，先初始化 durable state：

```sh
continuity init --task-id refactor-auth
```

## Recommended: Watch mode

長任務優先用 watch mode：

```sh
continuity watch "finish this task"
```

Watch mode 會：

- 啟動 provider process。
- 從受監督的 process 偵測 cooldown。
- 讓 supervisor 保持前景執行。
- 等到 `next_resume_at`。
- 自動 resume 同一個 Codex session。

查看狀態：

```sh
continuity status
continuity status --json
```

## Manual mode

```sh
continuity start "finish this task"
continuity resume
```

Manual: start / resume mode。

Manual mode 會：

- 執行一次。
- 偵測 cooldown。
- 記錄 `next_resume_at`。
- 退出。
- 需要使用者之後手動執行 `continuity resume`。

`continuity start` 不是 watchdog。它不會保留長駐 process，也不會等待 reset window。

Continuation Layer 只能監控由它啟動的 provider process。如果你直接跑 `codex`，cooldown event 不會被捕捉，state 不會更新，watch mode 之後也無法接管那個 process。

## Planned: Interactive terminal wrapper

v0.1 不包含任意 `codex` invocation 的 interactive terminal wrapper。這是 future work。v0.1 請使用 `continuity watch`、`continuity start` 和 `continuity resume`。

### 其他指令

寫 snapshot：

```sh
continuity snapshot
```

Context handoff 後開 child session：

```sh
continuity continue
continuity continue --yes
```

`continue` 會寫 handoff，然後停下來確認。`continue --yes` 會跑 recovery checks，通過後用 `codex fork` 開 child session。

過夜模式：

```sh
continuity overnight enable
continuity continue
```

關掉：

```sh
continuity overnight disable
```

任務完成與新任務：

```sh
continuity complete
continuity new-task --task-id next-task
```

只看 provider command，不真的啟動 Codex：

```sh
continuity start --dry-run "refactor the auth module safely"
continuity watch --dry-run "refactor the auth module safely"
continuity resume --dry-run
continuity continue --dry-run
```

## Codex Integration

Codex plugin package 放在：

```text
plugins/codex-continuity/
```

包含：

- continuity skill
- lifecycle hooks
- hook command script
- plugin metadata

Hook 行為：

| Hook           | 行為                                                  |
| -------------- | ----------------------------------------------------- |
| `SessionStart` | 注入 compact continuity context                       |
| `Stop`         | 寫入 `.agent/AUTO_SNAPSHOT.md`                        |
| `PreCompact`   | 記錄 context pressure，寫 handoff                     |
| `PostCompact`  | 記錄 compaction 發生，提醒後續優先信任 `.agent` state |

## 現在狀態

目前是 Codex-first preview，可以跑核心 continuity flow。

已完成：

- Durable `.agent` state and validation
- Codex adapter and supervisor
- Cooldown watchdog and same-session automatic resume
- Codex continuity skill and plugin package
- Codex lifecycle hooks
- Context handoff
- `codex fork` child continuation
- Guarded overnight auto-continuation
- Completion / archive / cleanup

## Known Limitations

- v0.1 是 Codex-first。
- Claude Code 目前是 v1/future provider path，還不是 first-class runtime。
- Provider CLI 行為和私有 session storage 可能變動；私有 session storage 只作診斷，不是核心狀態。
- Continuation Layer 只能監控由它啟動的 provider process。如果你直接跑 `codex`，cooldown event 不會被捕捉。
- 目前主要透過本機 unit/integration tests 和 dogfood flow 驗證。
- Context continuation 預設需要 user confirmation，除非明確啟用 overnight mode。
- 真 provider smoke tests 應保持 opt-in，不放進 CI。

## Roadmap

### v0.1

- Codex CLI as the primary provider.
- Safe cooldown watchdog.
- Handoff-before-continuation.
- Guarded overnight mode.
- Completion / archive / cleanup.
- Release polish and packaging.

### v0.x

- Dogfood feedback.
- Packaging polish.
- Clearer plugin installation flow.
- Optional provider smoke tests.

### v1

- Claude Code provider path.
- `claude --resume`
- `claude --continue`
- `claude --fork-session`
- Claude `StopFailure` integration.
- Provider smoke tests.
- Better circuit breaker and recovery policy.

## Repository Layout

```text
.agent/                         durable task state for this repo
.agents/skills/continuity       repo-local Codex skill entry
docs/                           architecture, safety, and research notes
plugins/codex-continuity/       Codex plugin package
plugins/claude-code-adapter/    future Claude Code adapter notes
src/                            core runtime, providers, supervisor
tests/                          unit and integration tests
```

## Development

Run tests:

```sh
npm test
```

Run syntax checks:

```sh
npm run check
```

Run formatting checks:

```sh
npm run format:check
```

Check package contents:

```sh
npm run pack:check
```

如果你的本機有 Codex skill/plugin validators，請用你環境中的 validator path 驗證 packaged plugin。

手動 release 檢查請看 `docs/RELEASE_CHECKLIST.md` 和 `docs/DOGFOOD.md`。

## License

Apache-2.0
