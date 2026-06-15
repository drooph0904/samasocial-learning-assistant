create extension if not exists vector;

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  type text not null,
  title text,
  summary text,
  status text not null default 'processing',
  error text,
  created_at timestamptz default now()
);

create table if not exists chunks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  source_id uuid references sources(id) on delete cascade,
  content text not null,
  embedding vector(1536),
  metadata jsonb default '{}'::jsonb
);
create index if not exists chunks_session_idx on chunks(session_id);
create index if not exists chunks_embedding_idx on chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  role text not null,
  content text not null,
  citations jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

create or replace function match_chunks(
  query_embedding vector(1536),
  p_session_id uuid,
  match_count int default 6
)
returns table (id uuid, source_id uuid, content text, metadata jsonb, similarity float)
language sql stable as $$
  select c.id, c.source_id, c.content, c.metadata,
         1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  where c.session_id = p_session_id
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
