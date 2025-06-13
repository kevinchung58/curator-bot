
# 內容策展機器人 - 後端代理架構 (Supabase + GitHub Actions)

本文檔詳細說明了內容策展機器人後端自動化代理 (Agent) 的架構設計與實現細節。該代理的核心目標是定期自動發現、處理和儲存符合特定策略的網路內容。

## 1. 核心架構選擇：Supabase + GitHub Actions

為了實現成本效益和開發便利性，我們選擇了以 Supabase 作為資料庫後端，並利用 GitHub Actions 進行任務排程與執行的方案。

### 1.1. 推薦的免費方案詳解

這個組合的優點是開發者體驗好、整合度高且在免費額度內功能強大。

#### 1.1.1. 資料庫 (Database)：Supabase

*   **為什麼推薦 Supabase？**
    *   **慷慨的免費額度 (Generous Free Tier)**：
        *   一個專案，內含 2 個免費的 PostgreSQL 資料庫。
        *   高達 500MB 的資料庫儲存空間（對於儲存文字內容來說非常充足）。
        *   高達 50,000 次的月活躍使用者。
        *   1GB 的檔案儲存和 2GB 的頻寬。
        *   500,000 次的 Edge Function 調用。
    *   **整合式後端即服務 (Backend-as-a-Service)**：不僅是資料庫，還內建使用者認證、邊緣函式 (Edge Functions) 和檔案儲存。
    *   **基於 PostgreSQL**：提供強大的 SQL 功能，同時也提供簡單易用的客戶端 SDK。

*   **如何使用 Supabase？**
    1.  在 Supabase 網站上建立一個免費帳號和新專案。
    2.  在 SQL Editor 中建立必要的表格 (Table)：
        *   `curated_content`: 儲存策展後的內容。
        *   `search_strategies`: 儲存使用者定義的搜尋策略。
    3.  Agent 腳本將使用 Supabase 提供的 SDK (例如 `@supabase/supabase-js`) 來查詢和插入資料。

#### 1.1.2. 排程與背景執行環境：GitHub Actions

*   **為什麼推薦 GitHub Actions？**
    *   **完全免費 (針對公開儲存庫)**：對於公開儲存庫，GitHub Actions 使用完全免費。私有儲存庫每月也有充裕的免費執行時間。
    *   **與程式碼高度整合**：排程設定檔 (`.yml`) 直接存放在程式碼庫中 (`.github/workflows/`)，方便版本控制。
    *   **簡單易用**：使用 YAML 語法設定，直觀易懂。

*   **如何使用 GitHub Actions？**
    1.  在專案根目錄下建立 `.github/workflows/cron.yml` 檔案。
    2.  在 `cron.yml` 中設定排程任務，例如每小時執行一次。
    3.  Workflow 步驟包括：Checkout 程式碼、設定 Node.js 環境、安裝依賴、執行 Agent 腳本。
    4.  **管理密鑰**：將敏感資訊（如 Supabase 金鑰、Next.js 應用程式 URL）儲存在 GitHub Secrets (Settings > Secrets and variables > Actions)。Agent 腳本透過環境變數讀取這些 Secrets。

**範例 `cron.yml` (`.github/workflows/cron.yml`)**
```yaml
name: Content Curator Agent

on:
  schedule:
    # 每小時執行一次
    - cron: '0 * * * *'
  workflow_dispatch: # 允許手動觸發

jobs:
  run-agent:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run the agent script
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
          NEXT_PUBLIC_APP_URL: ${{ secrets.NEXT_PUBLIC_APP_URL }}
        run: npx tsx src/agent/agent-script.ts
```

#### 1.1.3. 日誌与監控 (Logging & Monitoring)

*   **GitHub Actions Logs**：
    *   每次 GitHub Actions 任務執行時，`console.log` 和 `console.error` 的輸出都會被完整記錄。
    *   可在 GitHub 的 Actions 頁籤中查看詳細日誌，方便除錯。
*   **Uptime Kuma (可選，免費開源監控工具)**：
    *   可自行部署的輕量級監控服務。
    *   設定定期探測健康檢查端點或使用其 "心跳監控 (Heartbeat Monitoring)" 功能。
    *   Agent 腳本執行成功後呼叫 Uptime Kuma 提供的 Push URL。若 Uptime Kuma 未在預期時間內收到呼叫，則發出警報。

### 1.2. 整合後的工作流程

1.  **[排程]** GitHub Actions 根據 `cron.yml` 設定的時間自動觸發。
2.  **[執行]** Workflow Checkout 最新的程式碼，安裝依賴，並執行 Agent 腳本 (`src/agent/agent-script.ts`)。
3.  **[處理 - Agent 腳本]**
    *   從 GitHub Secrets 讀取金鑰，初始化 Supabase Client。
    *   從 Supabase `search_strategies` 表讀取搜尋策略。
    *   根據策略中的 `targetSites` 爬取網頁 (目前為直接處理 URL)。
    *   查詢 Supabase `curated_content` 表，檢查 URL 是否已存在 (防止重複)。
    *   對於新內容，呼叫部署在 Next.js 應用中的 API 端點 (`/api/agent/process-content`)，傳遞 `articleUrl` 和 `topic`。
    *   API 端點內部調用 Genkit Flow (例如 `generateContentSummary`) 進行 AI 處理。
    *   將 API 返回的處理結果 (包括標題、摘要、標籤、狀態、進度/錯誤訊息) 寫回 Supabase 的 `curated_content` 表。
4.  **[監控]**
    *   **日誌**：在 GitHub Actions 的執行歷史中查看詳細輸出。
    *   **警報 (可選)**：若整合 Uptime Kuma，可實現更主動的失敗警報。

## 2. Agent 核心腳本 (`src/agent/agent-script.ts`)

此腳本是自動化代理的核心，負責執行內容策展的主要邏輯。

### 2.1. 主要功能函式

*   `initializeSupabaseClient()`: 初始化 Supabase 客戶端。
*   `fetchStrategiesFromSupabase(supabaseClient)`: 從 Supabase `search_strategies` 表讀取搜尋策略。
    *   若讀取失敗或無策略，會返回一個預設的模擬策略以便測試。
*   `fetchWebContent(url)`: 從給定 URL 抓取網頁內容。
    *   包含 `User-Agent` 標頭。
    *   目前僅抓取原始 HTML，實際內容提取由後續 AI 流程處理。
*   `checkForDuplicates(supabaseClient, sourceUrl)`: 檢查 `sourceUrl` 是否已存在於 `curated_content` 表中。
*   `triggerAIProcessing(articleId, articleUrl, topic)`: 呼叫 Next.js API 端點 (`/api/agent/process-content`) 觸發 AI 內容處理。
    *   傳遞 `articleId` (由 agent 生成的唯一處理 ID), `articleUrl`, `topic`。
    *   處理 API 返回的 `ProcessedContent` 物件或錯誤信息。
*   `storeResultsInSupabase(supabaseClient, processedData)`: 將 `ProcessedContent` 物件儲存到 `curated_content` 表。
    *   包含欄位：`title`, `summary`, `tags`, `source_url`, `status`, `agent_progress_message`, `agent_error_message`。
*   `runAgent()`: 主執行函式，協調以上所有步驟。

### 2.2. 環境變數需求 (由 GitHub Secrets 提供)

*   `SUPABASE_URL`: Supabase 專案 URL。
*   `SUPABASE_ANON_KEY`: Supabase 專案公鑰 (anon key)。
*   `NEXT_PUBLIC_APP_URL`: 已部署的 Next.js 應用程式的公開 URL，用於 API 調用。

## 3. Next.js API 端點 (`/api/agent/process-content/route.ts`)

此 API 端點作為 Agent 腳本與 Next.js 應用內部 Genkit AI 流程之間的橋樑。

### 3.1. 功能

*   接收來自 Agent 腳本的 `POST` 請求。
*   請求 Body 包含：`articleId` (由 agent 生成), `articleUrl`, `topic`。
*   驗證請求 Body 的格式。
*   調用 `processDiscoveredContent` Server Action (位於 `src/lib/actions.ts`)。
    *   `processDiscoveredContent` 內部再調用 `generateContentSummary` Genkit Flow。
*   將 `processDiscoveredContent` 返回的結果 (包含 `ProcessedContent` 物件或錯誤) 以 JSON 格式回應給 Agent 腳本。

## 4. 資料庫表結構 (Supabase PostgreSQL)

### 4.1. `curated_content` 表

用於儲存策展和處理後的內容。

*   `id` (UUID, Primary Key, Auto-generated by Supabase or Agent - current let Supabase generate)
*   `title` (TEXT) - AI 生成的標題
*   `summary` (TEXT) - AI 生成的摘要
*   `tags` (TEXT[]) - AI 生成的標籤陣列
*   `source_url` (TEXT, **UNIQUE**) - 原始內容的 URL
*   `status` (TEXT) - 內容狀態 (e.g., 'processed', 'error', 'new')
*   `agent_progress_message` (TEXT, Nullable) - AI 處理過程中的進度訊息
*   `agent_error_message` (TEXT, Nullable) - AI 處理過程中的錯誤訊息
*   `created_at` (TIMESTAMP WITH TIME ZONE, Default: `now()`) - 記錄創建時間
*   `updated_at` (TIMESTAMP WITH TIME ZONE, Default: `now()`) - 記錄更新時間
*   `image_url` (TEXT, Nullable) - 生成圖像的 Data URI (若適用)
*   `image_ai_hint` (TEXT, Nullable) - 生成圖像的提示詞
*   `image_status` (TEXT, Nullable) - 圖像生成狀態 (e.g., 'none', 'generating', 'generated', 'error')
*   `image_error_message` (TEXT, Nullable) - 圖像生成錯誤訊息

### 4.2. `search_strategies` 表

用於儲存使用者或系統定義的內容搜尋策略。

*   `id` (UUID, Primary Key, Auto-generated)
*   `name` (TEXT, Nullable) - 策略名稱
*   `keywords` (TEXT[]) - 相關的搜尋關鍵字
*   `target_sites` (TEXT[]) - 目標監控的網站 URL 列表
*   `content_types_to_monitor` (TEXT[]) - 要監控的內容類型 (e.g., 'articles', 'blog posts')
*   `user_id` (UUID, Nullable, Foreign Key to users table if multi-user) - 關聯的使用者 ID
*   `is_active` (BOOLEAN, Default: `true`) - 此策略是否啟用
*   `created_at` (TIMESTAMP WITH TIME ZONE, Default: `now()`)
*   `updated_at` (TIMESTAMP WITH TIME ZONE, Default: `now()`)

## 5. Next.js 應用所需環境變數

除了 Agent 所需的，Next.js 應用本身（用於 AI 處理、LINE 通知、GitHub 發布）需要以下環境變數（通常設定在 App Hosting 環境中）：

*   `GOOGLE_API_KEY`: Google AI (Gemini) API 金鑰。
*   `LINE_CHANNEL_ACCESS_TOKEN`: LINE Messaging API 的 Channel Access Token。
*   `GITHUB_PAT`: GitHub Personal Access Token，用於將內容發布到儲存庫。

## 6. 安全性考量

*   **API 端點安全**：`/api/agent/process-content` 端點應考慮增加一層保護，例如使用一個共享的密鑰 (`AGENT_API_KEY`)，由 Agent 腳本在請求時提供，並由 API 端點驗證。此密鑰也應儲存在 GitHub Secrets 中。
*   **Supabase 金鑰**：Agent 使用的是 `anon_key`，其權限應透過 Supabase 的行級安全 (RLS) 策略進行限制，確保它只能執行必要的操作。

## 7. 未來擴展方向

*   **更複雜的策略執行**：Agent 腳本可以擴展為不僅僅處理 `targetSites` 中的 URL，還可以執行基於 `keywords` 的搜尋 (例如透過搜尋引擎 API)，或解析 RSS Feeds。
*   **錯誤重試機制**：為網路請求和 API 調用失敗添加重試邏輯。
*   **狀態回報**：Agent 可以將其運行狀態 (例如，上次成功運行時間、處理的文章數量、遇到的錯誤) 寫入 Supabase 的一個專用狀態表，供前端展示。
