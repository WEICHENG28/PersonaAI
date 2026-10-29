# 介面契約

> ⚠️ 待填：開場第一小時由全員一起定，之後由共用檔案管理人維護。
> 修改契約前先在群組講，相關的人都確認過才算數。

各角色之間的呼叫方式寫在這裡，大家照這份各寫各的，對方還沒好就先用 mock。

## 範例格式（定好後刪除）

### `POST /api/personas`（提供者：B，呼叫者：A）

請求：
```json
{ "name": "string", "description": "string" }
```

回應 `201`：
```json
{ "id": "string", "name": "string", "description": "string", "createdAt": "ISO 8601" }
```

錯誤：`400` 欄位缺漏，回傳 `{ "error": "說明" }`
