-- Cole este arquivo inteiro no Supabase: SQL Editor > New query > Run
create table if not exists public.movimentacoes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo        text not null check (tipo in ('receita','despesa')),
  descricao   text not null check (char_length(trim(descricao)) > 0),
  valor       numeric(12,2) not null check (valor > 0),
  data        date not null,
  categoria   text not null,
  observacao  text,
  criado_em   timestamptz not null default now()
);

create index if not exists movimentacoes_user_data_idx on public.movimentacoes (user_id, data desc);

-- RLS: cada usuário só enxerga e altera as próprias linhas
alter table public.movimentacoes enable row level security;

create policy "ler as proprias"    on public.movimentacoes for select to authenticated using (user_id = auth.uid());
create policy "inserir as proprias" on public.movimentacoes for insert to authenticated with check (user_id = auth.uid());
create policy "excluir as proprias" on public.movimentacoes for delete to authenticated using (user_id = auth.uid());
