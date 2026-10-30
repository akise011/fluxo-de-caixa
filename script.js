// ====== CONFIGURAÇÃO (cole os dados do seu projeto Supabase: Project Settings > API) ======
const SUPABASE_URL = 'https://fdgzdnmnggqdervvcdue.supabase.co';
const SUPABASE_KEY = 'sb_publishable_zvwyrLnd4p_TbSiK9N_vhA_8DIJ9-OT';
// =========================================================================================

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const CATS = {
  receita: ['vendas', 'serviços prestados', 'outras receitas'],
  despesa: ['aluguel', 'fornecedores', 'contas fixas', 'salários', 'impostos', 'outras despesas']
};
const TODAS = [...CATS.receita, ...CATS.despesa];

let uid = null, email = '', items = [], fila = [], tipo = 'receita', modoCadastro = false, metas = [], notas = [], verArquivadas = false;

// ---------- utilidades ----------
const centavos = v => Math.round(parseFloat(String(v).replace(',', '.')) * 100);
const brl = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = iso => iso.split('-').reverse().join('/');
const hoje = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const ler = (k, padrao) => { try { return JSON.parse(localStorage.getItem(k)) ?? padrao; } catch { return padrao; } };
const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('Cache local indisponível', e); } };
const salvarLocal = () => { gravar('mov:' + uid, items); gravar('fila:' + uid, fila); };
function toast(msg, acao) {
  const t = $('#toast'); t.replaceChildren(document.createTextNode(msg));
  if (acao) { const b = document.createElement('button'); b.className = 'toast-btn'; b.textContent = acao.rotulo; b.addEventListener('click', () => { t.hidden = true; acao.fn(); }); t.append(b); }
  t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, acao ? 7000 : 2600);
}
function celula(texto, classe) { const td = document.createElement('td'); td.textContent = texto; if (classe) td.className = classe; return td; }

// ---------- dados: banco (Supabase) + cache local + fila offline ----------
const paraLinha = m => ({ id: m.id, tipo: m.tipo, descricao: m.descricao, valor: m.valor / 100, data: m.data, categoria: m.categoria, observacao: m.observacao || null });
const deLinha = r => ({ id: r.id, tipo: r.tipo, descricao: r.descricao, valor: Math.round(Number(r.valor) * 100), data: r.data, categoria: r.categoria, observacao: r.observacao || '' });

async function sincronizar() {
  if (!uid || !navigator.onLine) return atualizarAviso();
  try {
    while (fila.length) {
      const op = fila[0];
      const { error } = op.op === 'add'
        ? await db.from('movimentacoes').upsert(op.row)
        : await db.from('movimentacoes').delete().eq('id', op.id);
      if (error) throw error;
      fila.shift(); salvarLocal();
    }
    const { data, error } = await db.from('movimentacoes').select('*').order('data', { ascending: false }).order('criado_em', { ascending: false });
    if (error) throw error;
    items = data.map(deLinha); salvarLocal();
  } catch (e) { console.warn('Sincronização pendente:', e.message || e); }
  render(); atualizarAviso();
}

async function adicionar(m) {
  items.unshift(m); salvarLocal(); render();
  try {
    const { error } = await db.from('movimentacoes').upsert(paraLinha(m));
    if (error) throw error;
  } catch { fila.push({ op: 'add', row: paraLinha(m) }); salvarLocal(); }
  atualizarAviso();
}

async function excluir(id) {
  const removido = items.find(m => m.id === id);
  items = items.filter(m => m.id !== id);
  const pendente = fila.findIndex(o => o.op === 'add' && o.row.id === id);
  if (pendente >= 0) fila.splice(pendente, 1); // nunca chegou ao banco: basta descartar
  salvarLocal(); render(); toast('Movimentação excluída', { rotulo: 'Desfazer', fn: () => { if (removido) { adicionar(removido); toast('Exclusão desfeita'); } } });
  if (pendente >= 0) return atualizarAviso();
  try {
    const { error } = await db.from('movimentacoes').delete().eq('id', id);
    if (error) throw error;
  } catch { fila.push({ op: 'del', id }); salvarLocal(); }
  atualizarAviso();
}

function atualizarAviso() {
  atualizarNotificacoes();
  $$('.status').forEach(el => { el.textContent = !navigator.onLine ? 'Offline' : fila.length ? 'Sincronizando…' : 'Online'; el.dataset.estado = navigator.onLine ? 'on' : 'off'; });
  const a = $('#aviso-rede');
  if (!navigator.onLine) { a.textContent = 'Sem conexão: você pode continuar usando. As alterações serão enviadas quando a internet voltar.'; a.hidden = false; }
  else if (fila.length) { a.textContent = fila.length + ' alteração(ões) aguardando envio ao banco…'; a.hidden = false; }
  else a.hidden = true;
}

// ---------- cálculo ----------
function totais(lista) {
  const rec = lista.filter(m => m.tipo === 'receita').reduce((s, m) => s + m.valor, 0);
  const des = lista.filter(m => m.tipo === 'despesa').reduce((s, m) => s + m.valor, 0);
  return { rec, des, saldo: rec - des };
}

// ---------- telas ----------
function filtrados() {
  const t = $('#f-tipo').value, c = $('#f-cat').value, i = $('#f-ini').value, f = $('#f-fim').value, q = $('#f-q').value.trim().toLowerCase();
  return items.filter(m => (!t || m.tipo === t) && (!c || m.categoria === c) && (!i || m.data >= i) && (!f || m.data <= f) && (!q || m.descricao.toLowerCase().includes(q)));
}

function botaoExcluir(id) {
  const b = document.createElement('button');
  b.className = 'x'; b.textContent = 'Excluir'; b.setAttribute('aria-label', 'Excluir movimentação');
  b.addEventListener('click', () => excluir(id));
  return b;
}

function render() {
  desenharGrafico(); atualizarNotificacoes();
  const t = totais(items);
  $('#g-saldo').textContent = $('#g-sal2').textContent = brl(t.saldo);
  $('#g-rec').textContent = brl(t.rec); $('#g-des').textContent = brl(t.des);
  $('#g-qtd').textContent = items.length + ' movimentaç' + (items.length === 1 ? 'ão registrada' : 'ões registradas');

  const ul = $('#g-lista'); ul.replaceChildren();
  if (!items.length) { const li = document.createElement('li'); li.className = 'suave'; li.textContent = 'Nenhuma movimentação ainda. Registre a primeira na aba Movimentações.'; ul.append(li); }
  items.slice(0, 5).forEach(m => {
    const li = document.createElement('li');
    const tag = document.createElement('span'); tag.className = 'tag ' + m.tipo; tag.textContent = m.tipo;
    const d = document.createElement('div'); d.className = 'desc';
    const s1 = document.createElement('span'); s1.textContent = m.descricao;
    const s2 = document.createElement('small'); s2.textContent = dataBR(m.data);
    d.append(s1, s2);
    const v = document.createElement('b'); v.className = m.tipo === 'receita' ? 'pos' : 'neg';
    v.textContent = (m.tipo === 'receita' ? '+ ' : '− ') + brl(m.valor);
    li.append(tag, d, v); ul.append(li);
  });

  const lista = filtrados(), corpo = $('#r-corpo'); corpo.replaceChildren();
  lista.forEach(m => {
    const tr = document.createElement('tr');
    const tdTipo = document.createElement('td'); const tg = document.createElement('span'); tg.className = 'tag ' + m.tipo; tg.textContent = m.tipo; tdTipo.append(tg);
    const tdAcao = document.createElement('td'); tdAcao.append(botaoExcluir(m.id));
    tr.append(tdTipo, celula(m.descricao), celula(m.categoria, 'col-cat'), celula(dataBR(m.data)),
      celula((m.tipo === 'receita' ? '+ ' : '− ') + brl(m.valor), 'num ' + (m.tipo === 'receita' ? 'pos' : 'neg')), tdAcao);
    corpo.append(tr);
  });
  $('#r-vazio').hidden = lista.length > 0;
  const p = totais(lista);
  $('#r-rec').textContent = brl(p.rec); $('#r-des').textContent = brl(p.des); $('#r-sal').textContent = brl(p.saldo);
}

function trocarAba(nome) {
  $$('[data-aba]').forEach(b => b.classList.toggle('ativa', b.dataset.aba === nome));
  ['geral', 'mov', 'rel', 'metas', 'notas'].forEach(n => $('#aba-' + n).hidden = n !== nome);
  if (nome === 'metas') carregarMetas();
  if (nome === 'notas') carregarNotas();
}

function montarCategorias() {
  $('#m-cat').replaceChildren(...CATS[tipo].map(c => new Option(c, c)));
  $('#f-cat').replaceChildren(new Option('todas', ''), ...TODAS.map(c => new Option(c, c)));
}

// ---------- cadastro de movimentação ----------
function definirTipo(t) {
  tipo = t;
  $$('.tipo button').forEach(b => b.setAttribute('aria-checked', b.dataset.tipo === t));
  $('#m-enviar').textContent = 'Registrar ' + t;
  $('#m-enviar').className = 'btn ' + (t === 'receita' ? 'btn-verde' : 'btn-verde');
  $('#m-cat').replaceChildren(...CATS[t].map(c => new Option(c, c)));
}

function validar() {
  const desc = $('#m-desc').value.trim(), valor = $('#m-valor').value.trim(), data = $('#m-data').value;
  if (!desc) return 'Informe a descrição.';
  if (!/^\d+([.,]\d{1,2})?$/.test(valor) || centavos(valor) <= 0) return 'Informe um valor maior que zero, por exemplo 150,00.';
  if (!data) return 'Informe a data.';
  if (!$('#m-cat').value) return 'Escolha a categoria.';
  return '';
}

$('#form-mov').addEventListener('submit', async e => {
  e.preventDefault();
  const erro = validar(); $('#m-erro').textContent = erro;
  if (erro) return;
  await adicionar({ id: crypto.randomUUID(), tipo, descricao: $('#m-desc').value.trim(), valor: centavos($('#m-valor').value), data: $('#m-data').value, categoria: $('#m-cat').value, observacao: $('#m-obs').value.trim() });
  e.target.reset(); $('#m-data').value = hoje(); definirTipo(tipo);
  toast((tipo === 'receita' ? 'Receita' : 'Despesa') + ' registrada');
  if ($('#dlg-mov').open) $('#dlg-mov').close();
});
$$('.tipo button').forEach(b => b.addEventListener('click', () => definirTipo(b.dataset.tipo)));
['#f-tipo', '#f-cat', '#f-ini', '#f-fim'].forEach(s => $(s).addEventListener('change', render));
$('#f-q').addEventListener('input', render);
$('#f-limpar').addEventListener('click', () => { ['#f-tipo', '#f-cat', '#f-ini', '#f-fim', '#f-q'].forEach(s => $(s).value = ''); render(); });

// ---------- exportação CSV ----------
const campoCSV = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
$('#f-csv').addEventListener('click', () => {
  const lista = filtrados();
  if (!lista.length) return toast('Não há registros para exportar com esses filtros.');
  const linhas = [['Tipo', 'Descrição', 'Categoria', 'Data', 'Valor', 'Observação']];
  lista.forEach(m => linhas.push([m.tipo, m.descricao, m.categoria, dataBR(m.data), brl(m.valor).replace(/\u00a0/g, ' '), m.observacao]));
  const csv = '\uFEFF' + linhas.map(l => l.map(campoCSV).join(';')).join('\r\n'); // BOM + ";" = abre certo no Excel pt-BR
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'movimentacoes_' + hoje() + '.csv' });
  document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  toast('CSV gerado com ' + lista.length + ' registro(s)');
});

// ---------- autenticação ----------
function mostrarAuth() {
  uid = null; $('#tela-app').hidden = true; $('#tela-auth').hidden = false; $('#aviso-rede').hidden = true;
}
function alternarModo() {
  modoCadastro = !modoCadastro;
  $('#auth-enviar').textContent = modoCadastro ? 'Criar conta' : 'Entrar';
  $('#auth-alternar').textContent = modoCadastro ? 'Já tenho conta' : 'Ainda não tenho conta';
  $('#auth-sub').textContent = modoCadastro ? 'Crie o acesso da sua empresa com e-mail e senha.' : 'Entre para ver as movimentações da sua empresa.';
  $('#auth-senha').autocomplete = modoCadastro ? 'new-password' : 'current-password';
  $('#auth-erro').textContent = '';
  $('#auth-nome-l').hidden = !modoCadastro;
}
$('#auth-alternar').addEventListener('click', alternarModo);

$('#form-auth').addEventListener('submit', async e => {
  e.preventDefault();
  const em = $('#auth-email').value.trim(), senha = $('#auth-senha').value, err = $('#auth-erro');
  err.textContent = '';
  const nome = $('#auth-nome').value.trim();
  if (modoCadastro && !nome) return err.textContent = 'Informe o nome da empresa.';
  if (!/^\S+@\S+\.\S+$/.test(em)) return err.textContent = 'Informe um e-mail válido.';
  if (senha.length < 6) return err.textContent = 'A senha precisa ter pelo menos 6 caracteres.';
  $('#auth-enviar').disabled = true;
  try {
    const { data, error } = modoCadastro ? await db.auth.signUp({ email: em, password: senha, options: { data: { nome_empresa: nome } } }) : await db.auth.signInWithPassword({ email: em, password: senha });
    if (error) throw error;
    if (!data.session) err.textContent = 'Conta criada. Confirme o e-mail que enviamos e depois entre.';
  } catch (ex) {
    err.textContent = /Invalid login/i.test(ex.message) ? 'E-mail ou senha incorretos.'
      : /already registered/i.test(ex.message) ? 'Este e-mail já tem conta. Use Entrar.'
      : !navigator.onLine ? 'Sem internet. O primeiro acesso precisa de conexão.' : ex.message;
  }
  $('#auth-enviar').disabled = false;
});

$$('.sair').forEach(b => b.addEventListener('click', async () => {
  localStorage.removeItem('ultimo_uid'); localStorage.removeItem('ultimo_email');
  try { await db.auth.signOut(); } catch { }
  mostrarAuth();
}));

async function entrar(id, em) {
  uid = id; email = em;
  localStorage.setItem('ultimo_uid', id); localStorage.setItem('ultimo_email', em);
  items = ler('mov:' + id, []); fila = ler('fila:' + id, []); metas = ler('metas:' + id, []); notas = ler('notas:' + id, []);
  pintarPerfil(ler('perfil:' + id, ''), em);
  $('#tela-auth').hidden = true; $('#tela-app').hidden = false;
  render(); atualizarAviso(); trocarAba('geral');
  carregarPerfil(); carregarMetas(); carregarNotas();
  await sincronizar();
}

db.auth.onAuthStateChange((evento, sessao) => {
  if (sessao && sessao.user.id !== uid) setTimeout(() => entrar(sessao.user.id, sessao.user.email), 0);
  if (evento === 'SIGNED_OUT') mostrarAuth();
});


// ---------- perfil da empresa, menu e gráfico ----------
function pintarPerfil(nome, em) {
  const n = nome || 'Minha empresa';
  $$('.nome-emp').forEach(e => e.textContent = n);
  $('#usuario').textContent = em;
  const ini = n.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('') || '?';
  let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) % 360;
  $$('.av').forEach(a => { a.textContent = ini; a.style.background = 'hsl(' + h + ' 45% 36%)'; });
}
async function carregarPerfil() {
  if (!uid || !navigator.onLine) return;
  try {
    const { data, error } = await db.from('perfis').select('nome_empresa').eq('id', uid).maybeSingle();
    if (error) throw error;
    if (data) { gravar('perfil:' + uid, data.nome_empresa); pintarPerfil(data.nome_empresa, email); }
  } catch (e) { console.warn('Perfil indisponível:', e.message || e); }
}

const ICONES = { geral: '<path d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z"/>', mov: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>', rel: '<path d="M4 6h16M4 12h16M4 18h10"/>', metas: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>', notas: '<path d="M5 3h10l4 4v14H5zM15 3v4h4M8 12h8M8 16h5"/>' };
const ROTULOS = { geral: 'Visão geral', mov: 'Movimentações', rel: 'Relatórios', metas: 'Metas', notas: 'Anotações' };
function montarNav() {
  $$('[data-nav]').forEach(nav => Object.keys(ROTULOS).forEach(k => {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.aba = k;
    b.innerHTML = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + ICONES[k] + '</svg><span class="rot">' + ROTULOS[k] + '</span>';
    b.addEventListener('click', () => trocarAba(k)); nav.append(b);
  }));
  $$('[data-nova]').forEach(b => b.addEventListener('click', abrirNovaMov));
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function desenharGrafico() {
  const alvo = $('#g-grafico'); alvo.replaceChildren();
  const agora = new Date(), meses = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    meses.push({ chave: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), rotulo: MESES[d.getMonth()], rec: 0, des: 0 });
  }
  items.forEach(m => { const x = meses.find(k => k.chave === m.data.slice(0, 7)); if (x) x[m.tipo === 'receita' ? 'rec' : 'des'] += m.valor; });
  const max = Math.max(1, ...meses.map(m => Math.max(m.rec, m.des)));
  const NS = 'http://www.w3.org/2000/svg', W = 600, H = 230, base = 200, topo = 24, larg = W / 6;
  const el = (n, a, t) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); if (t) e.textContent = t; return e; };
  const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Receitas e despesas dos últimos 6 meses' });
  svg.append(el('line', { x1: 0, x2: W, y1: base, y2: base, class: 'g-eixo' }));
  if (items.length) svg.append(el('text', { x: 0, y: 14, class: 'g-rot' }, 'máx. ' + brl(max)));
  meses.forEach((m, i) => {
    const x0 = i * larg + larg / 2;
    [['rec', -22, 'g-rec', 'receitas '], ['des', 4, 'g-des', 'despesas ']].forEach(([k, dx, cl, nome]) => {
      const h = Math.round((m[k] / max) * (base - topo));
      const r = el('rect', { x: x0 + dx, y: base - h, width: 18, height: h, rx: 3, class: cl });
      r.append(el('title', {}, m.rotulo + ': ' + nome + brl(m[k])));
      svg.append(r);
    });
    svg.append(el('text', { x: x0, y: base + 22, 'text-anchor': 'middle', class: 'g-rot' }, m.rotulo));
  });
  alvo.append(svg);
}

// ---------- tema claro / escuro ----------
const ICO_TEMA = {
  claro: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  escuro: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'
};
const temaAtual = () => document.documentElement.dataset.tema || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro');
function atualizarTema() {
  const alvo = temaAtual() === 'escuro' ? 'claro' : 'escuro';
  $$('.tema').forEach(b => {
    b.innerHTML = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + ICO_TEMA[alvo] + '</svg><span class="rot">Modo ' + alvo + '</span>';
    b.setAttribute('aria-label', 'Mudar para o modo ' + alvo);
  });
}
function iniciarTema() {
  $$('.tema').forEach(b => b.addEventListener('click', () => {
    const novo = temaAtual() === 'escuro' ? 'claro' : 'escuro';
    document.documentElement.dataset.tema = novo;
    try { localStorage.setItem('tema', novo); } catch { }
    atualizarTema();
  }));
  atualizarTema();
}

// ---------- nova movimentação rápida, metas, notas, notificações e alterar acesso ----------
const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const MESES_L = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const TIPOS_META = {
  economia: { nome: 'Economia', dica: 'Acompanhe o quanto você poupou (entradas − saídas).' },
  receita: { nome: 'Receita', dica: 'Acompanhe o total de entradas do mês.' },
  despesa: { nome: 'Limite de despesas', dica: 'Controle o total de saídas: o limite é o máximo que você quer gastar no mês.' }
};
const ICO_ACESSO = '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>';
const precisaRede = () => { if (navigator.onLine) return false; toast('Sem internet: conecte-se para fazer esta alteração.'); return true; };

// "+ Nova movimentação": abre o mesmo formulário em uma janela, de qualquer tela
function abrirNovaMov() {
  if (!$('#aba-mov').hidden) return $('#m-desc').focus();
  $('#slot-dlg-mov').append($('#form-mov')); $('#dlg-mov').showModal(); $('#m-desc').focus();
}

// ----- metas -----
function progressoMeta(m) {
  const t = totais(items.filter(i => i.data.slice(0, 7) === m.ano + '-' + String(m.mes).padStart(2, '0')));
  const alvo = Math.round(Number(m.valor) * 100), atual = m.tipo === 'economia' ? t.saldo : m.tipo === 'receita' ? t.rec : t.des;
  return { atual, alvo, pct: alvo > 0 ? Math.max(0, Math.round(atual / alvo * 100)) : 0 };
}
async function carregarMetas() {
  if (uid && navigator.onLine) {
    try {
      const { data, error } = await db.from('metas').select('*').order('ano', { ascending: false }).order('mes', { ascending: false });
      if (error) throw error; metas = data; gravar('metas:' + uid, metas);
    } catch (e) { console.warn('Metas indisponíveis:', e.message || e); }
  }
  desenharMetas(); atualizarNotificacoes();
}
function desenharMetas() {
  const box = $('#metas-lista'); box.replaceChildren();
  if (!metas.length) return box.append(mk('div', 'cartao vazio-g', 'Você ainda não definiu metas. Crie a primeira em “Nova meta”.'));
  metas.forEach(m => {
    const p = progressoMeta(m), c = mk('div', 'cartao meta'), topo = mk('div', 'meta-topo');
    topo.append(mk('strong', '', m.titulo), mk('span', 'tag ' + (m.tipo === 'despesa' ? 'despesa' : 'receita'), TIPOS_META[m.tipo].nome));
    const barra = mk('div', 'barra' + (m.tipo === 'despesa' ? (p.pct > 100 ? ' estouro' : p.pct >= 80 ? ' aviso-b' : '') : '')), i = document.createElement('i');
    i.style.width = Math.min(p.pct, 100) + '%'; barra.append(i);
    const x = mk('button', 'x', 'Excluir'); x.type = 'button'; x.addEventListener('click', () => excluirMeta(m.id));
    c.append(topo); if (m.descricao) c.append(mk('p', 'suave', m.descricao));
    const rod = mk('div', 'meta-rodape'); rod.append(mk('small', 'suave', MESES_L[m.mes - 1] + '/' + m.ano + ' · ' + brl(p.atual) + ' de ' + brl(p.alvo) + ' (' + p.pct + '%)'), x);
    c.append(barra, rod); box.append(c);
  });
}
async function excluirMeta(id) {
  if (precisaRede()) return;
  const { error } = await db.from('metas').delete().eq('id', id);
  if (error) return toast('Não foi possível excluir a meta.');
  toast('Meta excluída'); carregarMetas();
}

// ----- notas -----
async function carregarNotas() {
  if (uid && navigator.onLine) {
    try {
      const { data, error } = await db.from('notas').select('*').order('atualizado_em', { ascending: false });
      if (error) throw error; notas = data; gravar('notas:' + uid, notas);
    } catch (e) { console.warn('Notas indisponíveis:', e.message || e); }
  }
  desenharNotas();
}
function desenharNotas() {
  const box = $('#notas-lista'), q = $('#n-busca').value.trim().toLowerCase(); box.replaceChildren();
  const lista = notas.filter(n => n.arquivada === verArquivadas && (!q || (n.titulo + ' ' + n.texto).toLowerCase().includes(q)));
  if (!lista.length) {
    const v = mk('div', 'vazio-g', verArquivadas ? 'Nenhuma anotação arquivada.' : q ? 'Nenhuma anotação encontrada.' : 'Você ainda não tem anotações.');
    if (!verArquivadas && !q) { const b = mk('button', 'btn btn-verde', '+ Criar primeira anotação'); b.type = 'button'; b.addEventListener('click', () => abrirNota()); v.append(document.createElement('br'), b); }
    return box.append(v);
  }
  const g = mk('div', 'notas');
  lista.forEach(n => {
    const c = mk('div', 'nota'), ac = mk('div', 'nota-acoes');
    const bt = (t, fn) => { const b = mk('button', 'x', t); b.type = 'button'; b.addEventListener('click', fn); return b; };
    ac.append(bt('Editar', () => abrirNota(n)), bt(n.arquivada ? 'Desarquivar' : 'Arquivar', () => alterarNota(n.id, { arquivada: !n.arquivada })), bt('Excluir', () => excluirNota(n.id)));
    c.append(mk('strong', '', n.titulo), mk('p', '', n.texto), mk('small', 'suave', 'Atualizada em ' + new Date(n.atualizado_em).toLocaleDateString('pt-BR')), ac); g.append(c);
  });
  box.append(g);
}
function abrirNota(n) {
  $('#form-nota').dataset.id = n ? n.id : ''; $('#nota-h').textContent = n ? 'Editar anotação' : 'Nova anotação';
  $('#nota-titulo').value = n ? n.titulo : ''; $('#nota-texto').value = n ? n.texto : ''; $('#nota-erro').textContent = '';
  $('#dlg-nota').showModal(); $('#nota-titulo').focus();
}
async function alterarNota(id, campos) {
  if (precisaRede()) return;
  const { error } = await db.from('notas').update({ ...campos, atualizado_em: new Date().toISOString() }).eq('id', id);
  if (error) return toast('Não foi possível alterar a anotação.');
  carregarNotas();
}
async function excluirNota(id) {
  if (precisaRede()) return;
  const { error } = await db.from('notas').delete().eq('id', id);
  if (error) return toast('Não foi possível excluir a anotação.');
  toast('Anotação excluída'); carregarNotas();
}

// ----- notificações (geradas a partir do que está acontecendo no sistema) -----
const lidas = () => ler('lidas:' + uid, []);
function gerarNotificacoes() {
  const l = [], t = totais(items);
  if (fila.length) l.push({ id: 'sync:' + fila.length, txt: fila.length + ' alteração(ões) aguardando envio ao banco de dados.' });
  if (t.saldo < 0) l.push({ id: 'saldo-neg:' + items.length, txt: 'Atenção: seu saldo está negativo (' + brl(t.saldo) + ').' });
  metas.forEach(m => {
    const p = progressoMeta(m);
    if (m.tipo === 'despesa') {
      if (p.pct > 100) l.push({ id: 'meta:' + m.id + ':estourou', txt: 'O limite de despesas “' + m.titulo + '” foi ultrapassado (' + p.pct + '%).' });
      else if (p.pct >= 80) l.push({ id: 'meta:' + m.id + ':80', txt: 'Você já usou ' + p.pct + '% do limite “' + m.titulo + '”.' });
    } else if (p.pct >= 100) l.push({ id: 'meta:' + m.id + ':ok', txt: 'Meta atingida: “' + m.titulo + '”!' });
  });
  return l;
}
function desenharNotif(l, ja) {
  const p = $('#notif'); p.replaceChildren();
  if (!l.length) return p.append(mk('div', 'notif-item', 'Nenhuma notificação no momento.'));
  l.forEach(x => p.append(mk('div', 'notif-item' + (ja.includes(x.id) ? '' : ' nova'), x.txt)));
}
function atualizarNotificacoes() {
  if (!uid) return;
  const l = gerarNotificacoes(), ja = lidas(), n = l.filter(x => !ja.includes(x.id)).length;
  $$('.sino-n').forEach(b => { b.textContent = n; b.hidden = !n; });
  if (!$('#notif').hidden) desenharNotif(l, ja);
}

// ----- ligações dos botões e formulários -----
function iniciarExtras() {
  $$('[data-acesso]').forEach(b => {
    b.innerHTML = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + ICO_ACESSO + '</svg><span class="rot">Alterar acesso</span>';
    b.setAttribute('aria-label', 'Alterar acesso');
    b.addEventListener('click', () => { $('#ac-nome').value = $('.nome-emp').textContent; $('#ac-senha').value = ''; $('#ac-erro').textContent = ''; $('#dlg-acesso').showModal(); $('#ac-senha').focus(); });
  });
  $$('[data-fechar]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  $('#dlg-mov').addEventListener('close', () => $('#slot-mov').append($('#form-mov')));

  $('#meta-mes').replaceChildren(...MESES_L.map((n, i) => new Option(n, i + 1)));
  const dica = () => $('#meta-dica').textContent = TIPOS_META[$('#meta-tipo').value].dica;
  $('#meta-tipo').addEventListener('change', dica);
  $('#meta-nova').addEventListener('click', () => {
    $('#form-meta').reset(); $('#meta-mes').value = new Date().getMonth() + 1; $('#meta-ano').value = new Date().getFullYear();
    $('#meta-erro').textContent = ''; dica(); $('#dlg-meta').showModal(); $('#meta-titulo').focus();
  });
  $('#form-meta').addEventListener('submit', async e => {
    e.preventDefault();
    const titulo = $('#meta-titulo').value.trim(), valor = $('#meta-valor').value.trim(), ano = +$('#meta-ano').value, err = $('#meta-erro');
    if (!titulo) return err.textContent = 'Informe o título.';
    if (!/^\d+([.,]\d{1,2})?$/.test(valor) || centavos(valor) <= 0) return err.textContent = 'Informe um valor maior que zero, por exemplo 1500,00.';
    if (!(ano >= 2000 && ano <= 2100)) return err.textContent = 'Informe um ano válido.';
    if (!navigator.onLine) return err.textContent = 'Sem internet: conecte-se para salvar metas.';
    const { error } = await db.from('metas').insert({ tipo: $('#meta-tipo').value, titulo, descricao: $('#meta-desc').value.trim() || null, valor: centavos(valor) / 100, mes: +$('#meta-mes').value, ano });
    if (error) return err.textContent = 'Não foi possível salvar: ' + error.message;
    $('#dlg-meta').close(); toast('Meta salva'); carregarMetas();
  });

  $('#nota-nova').addEventListener('click', () => abrirNota());
  $('#n-busca').addEventListener('input', desenharNotas);
  $('#n-ativas').addEventListener('click', () => { verArquivadas = false; $('#n-ativas').classList.add('ativa'); $('#n-arq').classList.remove('ativa'); desenharNotas(); });
  $('#n-arq').addEventListener('click', () => { verArquivadas = true; $('#n-arq').classList.add('ativa'); $('#n-ativas').classList.remove('ativa'); desenharNotas(); });
  $('#form-nota').addEventListener('submit', async e => {
    e.preventDefault();
    const titulo = $('#nota-titulo').value.trim(), texto = $('#nota-texto').value.trim(), id = e.target.dataset.id, err = $('#nota-erro');
    if (!titulo) return err.textContent = 'Informe o título da anotação.';
    if (!navigator.onLine) return err.textContent = 'Sem internet: conecte-se para salvar anotações.';
    const { error } = id
      ? await db.from('notas').update({ titulo, texto, atualizado_em: new Date().toISOString() }).eq('id', id)
      : await db.from('notas').insert({ titulo, texto });
    if (error) return err.textContent = 'Não foi possível salvar: ' + error.message;
    $('#dlg-nota').close(); toast('Anotação salva'); carregarNotas();
  });

  const fecharNotif = () => { $('#notif').hidden = true; $$('.sino').forEach(b => b.setAttribute('aria-expanded', 'false')); };
  $$('.sino').forEach(botao => botao.addEventListener('click', () => {
    const p = $('#notif');
    if (!p.hidden) return fecharNotif();
    p.hidden = false; $$('.sino').forEach(b => b.setAttribute('aria-expanded', 'true'));
    const l = gerarNotificacoes(), ja = lidas(); desenharNotif(l, ja);
    gravar('lidas:' + uid, [...new Set([...ja, ...l.map(x => x.id)])]);
    $$('.sino-n').forEach(b => b.hidden = true);
  }));
  document.addEventListener('click', e => { if (!e.target.closest('.sino') && !e.target.closest('#notif')) fecharNotif(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharNotif(); });

  $('#form-acesso').addEventListener('submit', async e => {
    e.preventDefault();
    const nome = $('#ac-nome').value.trim(), senha = $('#ac-senha').value, err = $('#ac-erro');
    if (!nome) return err.textContent = 'Informe o nome da empresa.';
    if (!senha) return err.textContent = 'Digite sua senha para confirmar.';
    if (!navigator.onLine) return err.textContent = 'Sem internet: conecte-se para alterar o acesso.';
    const { error: e1 } = await db.auth.signInWithPassword({ email, password: senha });
    if (e1) return err.textContent = 'Senha incorreta.';
    const { error: e2 } = await db.from('perfis').update({ nome_empresa: nome }).eq('id', uid);
    if (e2) return err.textContent = 'Não foi possível salvar: ' + e2.message;
    gravar('perfil:' + uid, nome); pintarPerfil(nome, email);
    $('#dlg-acesso').close(); toast('Dados de acesso atualizados');
  });
}

// ---------- menu da conta (avatar no canto superior direito) ----------
function iniciarMenuPerfil() {
  const menu = $('#menu-perfil'), btn = $('#av-btn');
  const fechar = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', () => { const abrir = menu.hidden; fechar(); if (abrir) { menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); } });
  // composedPath() guarda o caminho do clique mesmo se o botão for redesenhado (o botão de tema troca o próprio ícone)
  menu.addEventListener('click', e => { const b = e.composedPath().find(n => n.tagName === 'BUTTON'); if (b && !b.classList.contains('tema')) fechar(); });
  document.addEventListener('click', e => { if (!e.composedPath().some(n => n === menu || n === btn)) fechar(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') fechar(); });
}

// ---------- inicialização ----------
window.addEventListener('online', sincronizar);
window.addEventListener('offline', atualizarAviso);
for (const f of [montarNav, iniciarTema, iniciarExtras, iniciarMenuPerfil]) { try { f(); } catch (e) { console.error('Falha ao iniciar', f.name, e); } }
montarCategorias(); definirTipo('receita'); $('#m-data').value = hoje();
(async () => {
  let sessao = null;
  try { sessao = (await db.auth.getSession()).data.session; } catch { }
  if (sessao) return entrar(sessao.user.id, sessao.user.email);
  // sem rede e já logado antes: abre com os dados salvos neste aparelho
  if (!navigator.onLine && localStorage.getItem('ultimo_uid')) return entrar(localStorage.getItem('ultimo_uid'), localStorage.getItem('ultimo_email') || '');
  mostrarAuth();
})();

// ---------- offline: Service Worker ----------
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW não registrado', e)));
