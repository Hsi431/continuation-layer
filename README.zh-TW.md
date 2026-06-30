# Continuation Layer

[English](README.md)

Continuation Layer 是給 CLI coding agent 用的「任務續航層」。

長時間讓 Codex、Claude Code 這類 CLI agent 工作時，真正麻煩的通常不是某一段程式碼，而是工作狀態會斷掉：遇到 cooldown、上下文被 compact、開新 session 後忘記前面做到哪裡，或是只靠模糊的 transcript 摘要繼續做事。

Continuation Layer 把任務狀態寫進 repo 裡的 `.agent`，讓 agent 可以明確地停下來、交接、檢查、再繼續。

目前 v0 以 Codex CLI 為主。Claude Code 會放在後續 provider path。

## 它解決什麼問題

- Agent 跑到一半遇到 rate limit / usage limit / 429。
- Context 快滿或被 compact，重要細節可能消失。
- 新 session 不知道上一個 session 的精準狀態。
- 只靠記憶或 transcript summary 續工，容易重做、漏做、做錯。
- Overnight automation 需要安全閘門，而不是盲目自動跑下去。

Continuation Layer 的核心想法很簡單：**repo 裡的 durable state 比對話記憶可靠。**

## 目前能做什麼

- 初始化 `.agent` durable state。
- 寫入 handoff、next step、decision、snapshot、session log。
- 用 supervisor 啟動 Codex，捕捉 stdout/stderr log。
- 偵測 cooldown / rate limit / 429，記錄 reset 時間。
- cooldown 後 resume 同一個 Codex session。
- 透過 Codex skill / plugin / hooks 注入 continuity context。
- `SessionStart` 提醒 Codex 先讀 `.agent`。
- `Stop` 自動寫 snapshot。
- `PreCompact` 在 context pressure 前寫 handoff。
- `PostCompact` 記錄 compact 事件，提醒後續以 `.agent` 為準。
- context handoff 後，用 `codex fork` 開 child continuation。
- 預設不會自動開 child session，會先等 user confirmation。
- 明確啟用 overnight mode 後，才允許 gated auto-continuation。

## 這不是什麼

這不是 provider limit bypass，也不是 account rotation 工具。

它不會：

- 切換帳號繞過限制；
- 偽造 reset window；
- 在 hook 裡 sleep 好幾小時；
- 自動 commit 你的程式碼；
- 從不完整 handoff 自動續跑；
- 把 provider 私有 session storage 當成唯一真相。

所有 cooldown / API failure handling 都留在 supervisor。Provider-specific 行為不放進 core。

## `.agent` 裡有什麼

```text
.agent/
  config.json
  state.json
  HANDOFF.md
  NEXT.md
  DECISIONS.md
  AUTO_SNAPSHOT.md
  sessions.jsonl
```

重點檔案：

- `HANDOFF.md`：目前任務狀態、人類可讀交接。
- `NEXT.md`：下一個精準動作。
- `DECISIONS.md`：不可忘記的決策。
- `AUTO_SNAPSHOT.md`：git state + runtime state。
- `sessions.jsonl`：session chain 和事件紀錄。

## Quick Start

初始化：

```sh
node bin/continuity.mjs init --task-id my-task
```

查看狀態：

```sh
node bin/continuity.mjs status
node bin/continuity.mjs status --json
```

寫 snapshot：

```sh
node bin/continuity.mjs snapshot
```

用 supervisor 啟動 Codex：

```sh
node bin/continuity.mjs start "implement the next step"
```

只看 command，不真的啟動 Codex：

```sh
node bin/continuity.mjs start --dry-run "task prompt"
node bin/continuity.mjs resume --dry-run
node bin/continuity.mjs continue --dry-run
```

Context handoff 後續跑：

```sh
node bin/continuity.mjs continue
node bin/continuity.mjs continue --yes
```

`continue` 只會寫 handoff 並停下來等確認。`continue --yes` 會跑 recovery check，通過後用 `codex fork` 開 child continuation。

啟用 overnight automation：

```sh
node bin/continuity.mjs overnight enable
node bin/continuity.mjs continue
```

關閉：

```sh
node bin/continuity.mjs overnight disable
```

Overnight continuation 只有在 handoff、recovery、git state、parent session id 都通過時才會啟動。

## 目前狀態

v0 已完成 Codex-first 的核心功能：

- Durable state
- Supervisor
- Cooldown resume
- Codex skill/plugin/hooks
- Context handoff
- `codex fork` child continuation
- Guarded overnight mode

開源前還建議補 Phase 7：

- task completion；
- old handoff archive；
- stale state cleanup；
- log retention 文件；
- 新任務不要被舊 handoff 汙染。

Phase 8 / v1 方向會放 Claude Code：

- Claude provider adapter；
- `claude --resume`；
- `claude --continue`；
- `claude --fork-session`；
- `StopFailure` failure signal；
- Claude skill/plugin layout。

## 適合誰

這套適合：

- 常用 Codex CLI 做長任務的人；
- 會遇到 cooldown 或 context compaction 的人；
- 想讓 agent overnight 跑，但不想失控的人；
- 想要把 agent state 明確寫進 repo 的團隊；
- 想做 cross-provider CLI agent continuity 的開發者。

它不適合：

- 想繞過 provider 限制的人；
- 想做全自動亂跑、亂 commit 的 agent runner；
- 不想在 repo 中保存任務 state 的工作流。

## Development

跑測試：

```sh
npm test
```

跑 syntax check：

```sh
npm run check
```

驗證 Codex skill 和 plugin：

```sh
python3 /home/fnata_claw/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-continuity/skills/continuity
python3 /home/fnata_claw/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/codex-continuity
```
