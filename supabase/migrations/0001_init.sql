create extension if not exists vector;
create extension if not exists pgcrypto;

-- ===== 用戶與設定（A 建立，B、C 讀取）=====
create table users (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid unique references auth.users(id) on delete cascade,  -- 種子用戶為 null
  display_name text not null,
  avatar_url text,
  is_seed boolean not null default false,
  social_agent_enabled boolean not null default false,
  match_tier text not null default 'mutual' check (match_tier in ('one_way','mutual')),
  purposes text[] not null default '{friend}',
  preferences jsonb not null default '{"personality":"similar","conditions":[]}'::jsonb,
  daily_chat_limit int not null default 10,
  manual_minutes_per_chat int not null default 20,
  proactive_frequency text not null default 'normal' check (proactive_frequency in ('off','low','normal')),
  dev_mode boolean not null default false,
  created_at timestamptz not null default now()
);

-- ===== AI 朋友（A）=====
create table ai_friends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  persona_key text not null default 'ache',
  story_stage int not null default 0,
  life_state jsonb not null default '{}'::jsonb,
  shared_event_ids text[] not null default '{}',
  intro_done boolean not null default false,
  created_at timestamptz not null default now()
);

create table friend_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('user','friend')),
  kind text not null default 'chat' check (kind in ('chat','intro','life_update','report','task_card')),
  content text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table user_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  content text not null,
  source text not null default 'user_stated',
  confidence real not null check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table user_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  shareable_profile jsonb,                       -- ShareableProfile
  shareable_confirmed boolean not null default false,
  agent_profile jsonb,                           -- AgentProfile（Big Five 只給 B 用）
  fun_labels jsonb,                              -- 僅供娛樂
  card jsonb,                                    -- C 產生的大廳卡片快取
  embedding vector(1024),                        -- shareable_profile 的向量
  updated_at timestamptz not null default now()
);

-- ===== 社交 Agent（B）=====
create table agent_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null default 'search' check (kind in ('search','single')),
  raw_instruction text,
  restatement text,                              -- 給用戶確認的複述
  purpose text not null default 'friend',
  conditions jsonb not null default '[]'::jsonb,
  target_count int not null default 3,
  done_condition jsonb not null default '{}'::jsonb,
  target_user_id uuid references users(id),      -- kind = single 時使用
  status text not null default 'pending_confirm'
    check (status in ('pending_confirm','running','done','paused','failed','cancelled')),
  progress jsonb not null default '{"screened":0,"chats":0,"suitable":0}'::jsonb,
  active_conversation_id uuid,
  attempted_user_ids uuid[] not null default '{}',
  fail_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ===== 對話（C）=====
create table conversations (
  id uuid primary key default gen_random_uuid(),
  side_a uuid not null references users(id),     -- 發起方
  side_b uuid not null references users(id),
  side_a_controller text not null check (side_a_controller in ('human','twin')),
  side_b_controller text not null check (side_b_controller in ('human','twin')),
  status text not null default 'active' check (status in ('active','waiting_human','ended')),
  origin text not null check (origin in ('auto','manual')),
  task_id uuid references agent_tasks(id),
  opening_topic text,
  round_count int not null default 0,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references users(id),
  is_ai boolean not null,
  guard_rewritten boolean not null default false,
  content text not null,
  created_at timestamptz not null default now()
);

create table handoffs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references users(id),
  summary jsonb not null,
  created_at timestamptz not null default now()
);

-- ===== 判定與歷史（B）=====
create table match_scores (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  perspective_user_id uuid not null references users(id),
  round int not null,
  runs jsonb not null,                            -- 3 次判定的原始結果
  direction_score int not null,
  verdict text not null check (verdict in ('suitable','unsuitable','uncertain')),
  reason_type text,
  reason_text text,
  created_at timestamptz not null default now()
);

create table match_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  target_user_id uuid not null references users(id),
  conversation_id uuid not null references conversations(id),
  task_id uuid references agent_tasks(id),
  origin text not null check (origin in ('auto','manual')),
  result text not null check (result in ('mutual','one_way','unsuitable','ongoing')),
  reason_type text check (reason_type in ('not_mutual','condition_mismatch','friction')),
  reason_text text,
  outline jsonb,                                  -- Outline：這筆紀錄的用戶自己視角的大綱＋合適理由
  reopened_at timestamptz,
  created_at timestamptz not null default now()
);

-- ===== 言行異常（C）=====
create table anomaly_flags (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  flagged_user_id uuid not null references users(id),
  notify_user_id uuid not null references users(id),
  anomaly_type text not null check (anomaly_type in ('abuse','impersonation','pressure')),
  evidence jsonb not null,
  user_choice text check (user_choice in ('continue','end','report')),
  created_at timestamptz not null default now()
);

-- ===== 共用 =====
create table agent_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  task_id uuid,
  conversation_id uuid,
  agent text not null check (agent in ('friend','social','twin','judge','guard')),
  action text not null,
  reason text,
  detail jsonb,
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null check (type in ('match','request_human','friend_report','anomaly')),
  payload jsonb not null,
  response text check (response in ('now','later','decline')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index on friend_messages (user_id, created_at);
create index on messages (conversation_id, created_at);
create index on agent_logs (user_id, created_at);
create index on notifications (user_id, created_at);
create index on match_attempts (user_id, created_at);

-- ===== 權限：前端只能讀自己的資料；所有寫入都走伺服器端（service role）=====
create or replace function app_user_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from users where auth_id = auth.uid()
$$;

alter table users enable row level security;
alter table ai_friends enable row level security;
alter table friend_messages enable row level security;
alter table user_memory enable row level security;
alter table user_profiles enable row level security;
alter table agent_tasks enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table handoffs enable row level security;
alter table match_scores enable row level security;     -- 不建 policy：前端完全讀不到，避免看到對方視角分數
alter table match_attempts enable row level security;
alter table anomaly_flags enable row level security;
alter table agent_logs enable row level security;
alter table notifications enable row level security;

create policy own on users for select using (id = app_user_id());
create policy own on ai_friends for select using (user_id = app_user_id());
create policy own on friend_messages for select using (user_id = app_user_id());
create policy own on user_memory for select using (user_id = app_user_id());
create policy own on user_profiles for select using (user_id = app_user_id());
create policy own on agent_tasks for select using (user_id = app_user_id());
create policy own on match_attempts for select using (user_id = app_user_id());
create policy own on agent_logs for select using (user_id = app_user_id());
create policy own on notifications for select using (user_id = app_user_id());
create policy own on handoffs for select using (user_id = app_user_id());
create policy own on anomaly_flags for select using (notify_user_id = app_user_id());
create policy member on conversations for select using (app_user_id() in (side_a, side_b));
create policy member on messages for select using (
  exists (select 1 from conversations c where c.id = conversation_id and app_user_id() in (c.side_a, c.side_b))
);

-- ===== Realtime =====
alter publication supabase_realtime add table friend_messages, messages, agent_logs, notifications, agent_tasks;
