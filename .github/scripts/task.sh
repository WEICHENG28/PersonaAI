#!/usr/bin/env bash
# 更新任務進度：Issue 留言＋進度看板狀態。需要 gh 已登入且有 project 權限（gh auth refresh -s project）。
# 用法：
#   bash .github/scripts/task.sh start <issue編號> ["說明"]   開工：指派自己、看板改 In Progress、留言
#   bash .github/scripts/task.sh note  <issue編號> "說明"     進度留言（卡住、改變做法、等別條線）
#   bash .github/scripts/task.sh done  <issue編號> "驗收結果" 完成回報；Issue 在 PR 合併時自動關閉並移到 Done
set -euo pipefail

REPO="WEICHENG28/PersonaAI"
OWNER="WEICHENG28"
PROJECT_TITLE="PersonaAI 進度"

cmd="${1:-}"
num="${2:-}"
msg="${3:-}"
usage() { sed -n '3,6p' "$0"; exit 1; }
[[ -z "$cmd" || -z "$num" ]] && usage

set_status() {
  local status="$1" pnum pid item fid oid
  pnum=$(gh project list --owner "$OWNER" --format json \
    --jq ".projects[] | select(.title==\"$PROJECT_TITLE\") | .number")
  if [[ -z "$pnum" ]]; then
    echo "找不到看板「$PROJECT_TITLE」，略過狀態更新"
    return 0
  fi
  pid=$(gh project view "$pnum" --owner "$OWNER" --format json --jq .id)
  item=$(gh project item-list "$pnum" --owner "$OWNER" --format json --limit 500 \
    --jq ".items[] | select(.content.number==$num) | .id")
  if [[ -z "$item" ]]; then
    item=$(gh project item-add "$pnum" --owner "$OWNER" \
      --url "https://github.com/$REPO/issues/$num" --format json --jq .id)
  fi
  fid=$(gh project field-list "$pnum" --owner "$OWNER" --format json \
    --jq '.fields[] | select(.name=="Status") | .id')
  oid=$(gh project field-list "$pnum" --owner "$OWNER" --format json \
    --jq ".fields[] | select(.name==\"Status\") | .options[] | select(.name==\"$status\") | .id")
  gh project item-edit --id "$item" --project-id "$pid" \
    --field-id "$fid" --single-select-option-id "$oid" >/dev/null
  echo "看板：#$num → $status"
}

case "$cmd" in
  start)
    gh issue edit "$num" -R "$REPO" --add-assignee @me >/dev/null
    set_status "In Progress" || echo "看板更新失敗（可能沒有看板權限），略過；Issue 照常更新"
    gh issue comment "$num" -R "$REPO" \
      --body "開始處理（分支 \`$(git branch --show-current)\`）${msg:+：$msg}" >/dev/null
    ;;
  note)
    [[ -z "$msg" ]] && usage
    gh issue comment "$num" -R "$REPO" --body "進度：$msg" >/dev/null
    ;;
  done)
    gh issue comment "$num" -R "$REPO" --body "完成，等待 PR 合併。${msg:+

$msg}" >/dev/null
    ;;
  *)
    usage
    ;;
esac
echo "Issue #$num 已更新"
