/* =====================================================================
   NMAKER — PAINEL DA LOJA (admin.html)
   Só os e-mails de ADMIN_EMAILS (js/config.js) entram. A segurança de
   verdade fica nas regras do Firebase (firestore.rules).
   ===================================================================== */
import { STATUS, demo, esc, dinheiro, tempo, ms, dataBR, ehAdminEmail, criarApi, mensagemErro } from './firebase-api.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const normalizar = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const stIdx = p => Math.max(0, STATUS.indexOf(p.status || STATUS[0]));
const ABERTOS = ['Aguardando pagamento', 'Pago', 'Em produção'];
const valido = p => p.status !== 'Cancelado';
const soDigitos = t => String(t || '').replace(/\D/g, '');
const diaKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

let api, usuario = null, pedidos = [], clientes = [], pararOuvir = null, primeiraCarga = true;
const conhecidos = new Set();
const filtro = { status: 'Todos', periodo: 'tudo', busca: '' };
let ordemClientes = { campo: 'gasto', desc: true };

function aviso(msg) {
  const a = $('#aviso'); a.textContent = msg; a.classList.add('mostrar');
  clearTimeout(aviso.t); aviso.t = setTimeout(() => a.classList.remove('mostrar'), 2600);
}

/* ---------------------------------------------------------------------
   Acesso
   --------------------------------------------------------------------- */
async function iniciar() {
  try { api = await criarApi(); } catch (e) { console.error(e); }
  if (!api) {
    $('#acesso').hidden = false;
    $('#acessoTexto').textContent = 'O Firebase ainda não está configurado (veja COMO-ATIVAR-LOGIN.md).';
    $('#btnGoogle').hidden = $('#formEntrar').hidden = true;
    return;
  }
  $('#selDemo').hidden = !demo;
  $('#btnGoogle').addEventListener('click', async () => {
    try { await api.entrarGoogle(); } catch (e) { $('#acessoErro').textContent = mensagemErro(e); }
  });
  $('#formEntrar').addEventListener('submit', async e => {
    e.preventDefault();
    try { await api.entrar($('#aEmail').value.trim(), $('#aSenha').value); }
    catch (err) { $('#acessoErro').textContent = mensagemErro(err); }
  });
  $('#btnSairAcesso').addEventListener('click', () => api.sair());
  api.onAuth(u => {
    usuario = u;
    if (pararOuvir) { pararOuvir(); pararOuvir = null; }
    pararTudoConversas();
    const admin = u && ehAdminEmail(u.email);
    $('#acesso').hidden = !!admin;
    $('#app').hidden = !admin;
    $('#aoVivo').hidden = !admin;
    $('#usuario').hidden = !u;
    if (u) {
      $('#usuario').innerHTML = `<span class="avatar">${esc((u.nome || u.email).charAt(0).toUpperCase())}</span><span class="nome">${esc(u.nome || u.email)}</span><button type="button" class="btn btn--sm" id="btnSair">Sair</button>`;
      $('#btnSair').addEventListener('click', () => api.sair());
    }
    if (u && !admin) {
      $('#acessoTexto').innerHTML = `A conta <strong>${esc(u.email)}</strong> não tem acesso ao painel.`;
      $('#btnGoogle').hidden = $('#formEntrar').hidden = true;
      $('#btnSairAcesso').hidden = false;
    } else if (!u) {
      $('#acessoTexto').textContent = 'Entre com a conta do dono da loja.';
      $('#btnGoogle').hidden = $('#formEntrar').hidden = false;
      $('#btnSairAcesso').hidden = true;
    }
    if (admin) carregar();
  });
}

function carregar() {
  primeiraCarga = true;
  pararOuvir = api.ouvirPedidos(lista => {
    // Avisa quando chega pedido novo enquanto o painel está aberto
    const novos = lista.filter(p => !conhecidos.has(p.id));
    novos.forEach(p => conhecidos.add(p.id));
    if (!primeiraCarga && novos.length) {
      aviso(novos.length === 1 ? `🔔 Novo pedido #${novos[0].codigo || novos[0].id.slice(-6).toUpperCase()}` : `🔔 ${novos.length} novos pedidos`);
      novos.forEach(p => p._novo = true);
    }
    primeiraCarga = false;
    pedidos = lista;
    desenharTudo();
  }, err => { aviso(mensagemErro(err)); console.error(err); });
  api.listarClientes().then(l => { clientes = l; desenharClientes(); desenharKpis(); }).catch(err => console.warn('clientes', err));
  ouvirConversas();
}

/* ---------------------------------------------------------------------
   Abas
   --------------------------------------------------------------------- */
function irPara(aba) {
  $$('.abas [data-aba]').forEach(b => b.setAttribute('aria-selected', b.dataset.aba === aba));
  $$('[data-painel]').forEach(p => p.hidden = p.dataset.painel !== aba);
  history.replaceState(null, '', (demo ? '?demo-conta' : location.pathname.split('/').pop()) + '#' + aba);
}
$('.abas').addEventListener('click', e => { const b = e.target.closest('[data-aba]'); if (b) irPara(b.dataset.aba); });
if (['pedidos', 'clientes', 'conversas'].includes(location.hash.slice(1))) irPara(location.hash.slice(1));

function desenharTudo() {
  const abertos = pedidos.filter(p => ABERTOS.includes(p.status || STATUS[0])).length;
  $('#contAbertos').textContent = abertos;
  $('#contAbertos').classList.toggle('alerta', pedidos.some(p => (p.status || STATUS[0]) === STATUS[0]));
  document.title = (abertos ? `(${abertos}) ` : '') + 'Painel da loja | NMAKER';
  desenharKpis(); desenharGrafico(); desenharFunil(); desenharUltimos(); desenharRanking();
  desenharChips(); desenharPedidos(); desenharClientes();
}

/* ---------------------------------------------------------------------
   Visão geral
   --------------------------------------------------------------------- */
function desenharKpis() {
  const agora = new Date(), hoje = diaKey(Date.now());
  const doMes = pedidos.filter(p => { const d = new Date(tempo(p) || Date.now()); return valido(p) && d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear(); });
  const fatMes = doMes.reduce((s, p) => s + (Number(p.total) || 0), 0);
  const validos = pedidos.filter(valido);
  const totalGeral = validos.reduce((s, p) => s + (Number(p.total) || 0), 0);
  const hojeQtd = pedidos.filter(p => diaKey(tempo(p) || Date.now()) === hoje).length;
  const kpi = (rotulo, valor, sub = '') => `<div class="kpi"><span>${rotulo}</span><strong>${valor}</strong>${sub ? `<small>${sub}</small>` : ''}</div>`;
  $('#kpis').innerHTML =
    kpi('Pedidos hoje', hojeQtd, `${pedidos.length} no total`) +
    kpi('Em aberto', pedidos.filter(p => ABERTOS.includes(p.status || STATUS[0])).length, `${pedidos.filter(p => (p.status || STATUS[0]) === STATUS[0]).length} aguardando pagamento`) +
    kpi('Vendas do mês', dinheiro(fatMes), `${doMes.length} pedidos`) +
    kpi('Ticket médio', dinheiro(validos.length ? totalGeral / validos.length : 0), 'por pedido') +
    kpi('Clientes', clientes.length || '—', 'com cadastro');
  $('#contClientes').textContent = clientes.length;
}

function desenharGrafico() {
  const dias = [...Array(14)].map((_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 13 + i); return d; });
  const somas = dias.map(d => pedidos.filter(p => valido(p) && diaKey(tempo(p) || Date.now()) === diaKey(d.getTime())).reduce((s, p) => s + (Number(p.total) || 0), 0));
  const max = Math.max(...somas, 1);
  $('#grafico').innerHTML = dias.map((d, i) => `
    <div class="barra" title="${d.toLocaleDateString('pt-BR')}: ${dinheiro(somas[i])}">
      <i class="${somas[i] ? '' : 'zero'}" style="height:${Math.max(2, somas[i] / max * 100)}%" data-v="${dinheiro(somas[i])}"></i>
      <span>${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}</span>
    </div>`).join('');
  $('#grafico').setAttribute('aria-label', 'Vendas por dia: ' + dias.map((d, i) => `${d.getDate()}/${d.getMonth() + 1} ${dinheiro(somas[i])}`).join(', '));
}

function desenharFunil() {
  $('#funil').innerHTML = STATUS.map((s, i) => `
    <button type="button" data-ir-status="${s}"><span class="st" data-st="${i}">${s}</span><b>${pedidos.filter(p => (p.status || STATUS[0]) === s).length}</b></button>`).join('');
}
$('#funil').addEventListener('click', e => {
  const b = e.target.closest('[data-ir-status]');
  if (!b) return;
  filtro.status = b.dataset.irStatus; desenharChips(); desenharPedidos(); irPara('pedidos');
});

function desenharUltimos() {
  const ult = pedidos.slice(0, 5);
  $('#ultimos').innerHTML = ult.length ? ult.map(htmlPedido).join('') : '<p class="vazio">Nenhum pedido ainda. Eles aparecem aqui na hora em que o cliente finaliza no site.</p>';
}

function desenharRanking() {
  const mapa = new Map();
  pedidos.filter(valido).forEach(p => (p.itens || []).forEach(i => {
    const nome = String(i.nome || '').replace(/\s*\(.*\)\s*$/, ''); // agrupa variações
    const r = mapa.get(nome) || { qtd: 0, valor: 0 };
    r.qtd += Number(i.qtd) || 0; r.valor += (Number(i.preco) || 0) * (Number(i.qtd) || 0);
    mapa.set(nome, r);
  }));
  const top = [...mapa.entries()].sort((a, b) => b[1].qtd - a[1].qtd).slice(0, 6);
  $('#ranking').innerHTML = top.length ? top.map(([nome, r], i) => `
    <li><span>${i + 1}</span><div>${esc(nome)}<small>${r.qtd} ${r.qtd === 1 ? 'unidade' : 'unidades'}</small></div><strong>${dinheiro(r.valor)}</strong></li>`).join('')
    : '<li class="vazio" style="display:block">Os mais vendidos aparecem com os primeiros pedidos.</li>';
}

/* ---------------------------------------------------------------------
   Pedidos
   --------------------------------------------------------------------- */
// Como o cliente pagou (informação que vem do Mercado Pago)
function formaPaga(mp) {
  const nomes = { pix: 'Pix', bolbradesco: 'Boleto', pec: 'Pagamento na lotérica', account_money: 'Saldo Mercado Pago' };
  if (nomes[mp.metodo]) return nomes[mp.metodo];
  if (mp.tipo === 'credit_card') return `Cartão ${String(mp.metodo || '').toUpperCase()}${mp.parcelas > 1 ? ` em ${mp.parcelas}x` : ' à vista'}`;
  if (mp.tipo === 'debit_card') return `Débito ${String(mp.metodo || '').toUpperCase()}`;
  return mp.metodo || 'Mercado Pago';
}

function htmlPedido(p) {
  const cli = p.cliente || {};
  const cod = p.codigo || p.id.slice(-6).toUpperCase();
  const itens = p.itens || [];
  const qtdItens = itens.reduce((s, i) => s + (Number(i.qtd) || 0), 0);
  const tel = soDigitos(cli.telefone);
  const primeiroNome = (cli.nome || '').split(' ')[0] || 'tudo bem';
  const msgCliente = `Olá, ${primeiroNome}! Aqui é da NMAKER 🧡 Sobre o seu pedido #${cod}: ${p.status || STATUS[0]}.`;
  return `<details class="pedido${p._novo ? ' novo' : ''}" data-id="${esc(p.id)}">
    <summary>
      <div class="p-cod"><strong>#${esc(cod)}</strong><span>${dataBR(tempo(p))}</span></div>
      <div class="p-cli"><strong>${esc(cli.nome || 'Sem nome')}</strong><span>${esc(cli.email || '')}</span></div>
      <div class="p-itens"><div>${itens.map(i => `${esc(i.qtd)}x ${esc(i.nome)}`).join(', ')}</div><span>${qtdItens} ${qtdItens === 1 ? 'item' : 'itens'} · ${esc(p.forma || '')}</span></div>
      <div class="p-total">${dinheiro(p.total)}</div>
      <div class="p-status">
        <label class="visually-hidden" for="st-${esc(p.id)}">Status do pedido #${esc(cod)}</label>
        <select id="st-${esc(p.id)}" data-status="${esc(p.id)}" class="st-sel" style="color:${['#fbbf24', '#60a5fa', '#ffa24d', '#a78bfa', '#34d399', '#f87171'][stIdx(p)]}">
          ${STATUS.map(s => `<option ${s === (p.status || STATUS[0]) ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
    </summary>
    <div class="detalhe">
      <div>
        <h3>Itens</h3>
        <table><tbody>${itens.map(i => `<tr><td>${esc(i.qtd)}x ${esc(i.nome)}</td><td>${i.preco ? dinheiro(i.preco * i.qtd) : 'a confirmar'}</td></tr>`).join('')}</tbody>
        <tfoot>
          ${p.frete !== undefined ? `<tr><td>Produtos</td><td>${dinheiro(p.subtotal)}</td></tr><tr><td>Frete</td><td>${p.frete ? dinheiro(p.frete) : 'Grátis'}</td></tr>` : ''}
          <tr><td>Total</td><td>${dinheiro(p.total)}</td></tr>
        </tfoot></table>
        ${p.mp && p.mp.paymentId ? `<p class="pg-info">💳 ${esc(formaPaga(p.mp))} · Mercado Pago nº ${esc(p.mp.paymentId)} · ${esc(p.mp.status || '')}</p>` : ''}
        ${p.mp && p.mp.alerta ? `<p class="pg-alerta">⚠ ${esc(p.mp.alerta)}</p>` : ''}
      </div>
      <div class="contato">
        <h3>Cliente e entrega</h3>
        <p><strong>${esc(cli.nome || 'Sem nome')}</strong></p>
        ${cli.email ? `<p>${esc(cli.email)}</p>` : ''}
        ${cli.telefone ? `<p>WhatsApp: ${esc(cli.telefone)}</p>` : '<p style="color:var(--muted)">Sem WhatsApp no cadastro</p>'}
        ${cli.endereco ? `<p>${esc(cli.endereco)}</p>` : ''}${cli.cep ? `<p>CEP ${esc(cli.cep)}</p>` : ''}
        <div class="acoes">
          ${tel ? `<a class="btn btn--whats btn--sm" target="_blank" rel="noopener" href="https://wa.me/${tel.length <= 11 ? '55' + tel : tel}?text=${encodeURIComponent(msgCliente)}"><svg aria-hidden="true"><use href="#i-whats"/></svg>Avisar cliente</a>` : ''}
          ${cli.endereco || cli.cep ? `<button type="button" class="btn btn--sm" data-copiar="${esc([cli.nome, cli.endereco, cli.cep && 'CEP ' + cli.cep].filter(Boolean).join(' — '))}"><svg aria-hidden="true"><use href="#i-copiar"/></svg>Copiar endereço</button>` : ''}
        </div>
      </div>
    </div>
  </details>`;
}

function filtrados() {
  const agora = new Date(), inicioHoje = new Date(); inicioHoje.setHours(0, 0, 0, 0);
  const palavras = normalizar(filtro.busca).split(/\s+/).filter(Boolean);
  return pedidos.filter(p => {
    if (filtro.status !== 'Todos' && (p.status || STATUS[0]) !== filtro.status) return false;
    const t = tempo(p) || Date.now();
    if (filtro.periodo === 'hoje' && t < inicioHoje.getTime()) return false;
    if (['7', '30'].includes(filtro.periodo) && t < Date.now() - Number(filtro.periodo) * 864e5) return false;
    if (filtro.periodo === 'mes') { const d = new Date(t); if (d.getMonth() !== agora.getMonth() || d.getFullYear() !== agora.getFullYear()) return false; }
    if (palavras.length) {
      const c = p.cliente || {};
      const texto = normalizar([p.codigo, p.id, c.nome, c.email, c.telefone, c.endereco, c.cep, p.forma, ...(p.itens || []).map(i => i.nome)].join(' '));
      if (!palavras.every(w => texto.includes(w))) return false;
    }
    return true;
  });
}

function desenharChips() {
  const opcoes = ['Todos', ...STATUS];
  $('#chips').innerHTML = opcoes.map(s => `<button type="button" data-chip="${s}" aria-pressed="${filtro.status === s}">${s} (${s === 'Todos' ? pedidos.length : pedidos.filter(p => (p.status || STATUS[0]) === s).length})</button>`).join('');
}
$('#chips').addEventListener('click', e => { const b = e.target.closest('[data-chip]'); if (b) { filtro.status = b.dataset.chip; desenharChips(); desenharPedidos(); } });
$('#periodo').addEventListener('change', e => { filtro.periodo = e.target.value; desenharPedidos(); });
$('#buscaPedidos').addEventListener('input', e => { clearTimeout(desenharPedidos.t); desenharPedidos.t = setTimeout(() => { filtro.busca = e.target.value; desenharPedidos(); }, 150); });

function desenharPedidos() {
  const abertos = new Set($$('#listaPedidos details[open]').map(d => d.dataset.id));
  const lista = filtrados();
  const soma = lista.filter(valido).reduce((s, p) => s + (Number(p.total) || 0), 0);
  $('#resumoFiltro').textContent = `${lista.length} ${lista.length === 1 ? 'pedido' : 'pedidos'} · ${dinheiro(soma)} (sem cancelados)`;
  $('#listaPedidos').innerHTML = lista.length ? lista.map(htmlPedido).join('') : '<p class="vazio caixa">Nenhum pedido encontrado com esses filtros.</p>';
  abertos.forEach(id => { const d = $(`#listaPedidos details[data-id="${CSS.escape(id)}"]`); if (d) d.open = true; });
}

// Mudar status (em qualquer lista)
document.addEventListener('change', async e => {
  const sel = e.target.closest('[data-status]');
  if (!sel) return;
  const id = sel.dataset.status, novo = sel.value;
  sel.disabled = true;
  try {
    await api.atualizarStatus(id, novo);
    const p = pedidos.find(x => x.id === id); if (p) p.status = novo;
    sel.classList.add('salvo'); setTimeout(() => sel.classList.remove('salvo'), 1200);
    aviso(`Pedido atualizado: ${novo}`);
    desenharTudo();
  } catch (err) { aviso(mensagemErro(err)); }
  finally { sel.disabled = false; }
});
// O seletor de status fica dentro do resumo do pedido: clicar nele não abre/fecha o pedido
document.addEventListener('click', e => { if (e.target.closest('summary select, summary label')) e.preventDefault(); }, true);
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-copiar]');
  if (!b) return;
  try { await navigator.clipboard.writeText(b.dataset.copiar); aviso('Endereço copiado ✓'); } catch { aviso('Não foi possível copiar'); }
});

// Exportar planilha (abre no Excel / Google Planilhas)
$('#exportar').addEventListener('click', () => {
  const lista = filtrados();
  const cel = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const linhas = [['Código', 'Data', 'Status', 'Cliente', 'E-mail', 'WhatsApp', 'Endereço', 'CEP', 'Itens', 'Total', 'Pagamento']]
    .concat(lista.map(p => { const c = p.cliente || {}; return [
      p.codigo || p.id, dataBR(tempo(p)), p.status || STATUS[0], c.nome, c.email, c.telefone, c.endereco, c.cep,
      (p.itens || []).map(i => `${i.qtd}x ${i.nome}`).join(' | '), String((Number(p.total) || 0).toFixed(2)).replace('.', ','), p.forma,
    ]; }));
  const csv = '﻿' + linhas.map(l => l.map(cel).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `pedidos-nmaker-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  aviso(`${lista.length} pedidos exportados ✓`);
});

/* ---------------------------------------------------------------------
   Clientes
   --------------------------------------------------------------------- */
function desenharClientes() {
  const porUid = new Map();
  pedidos.forEach(p => {
    const r = porUid.get(p.uid) || { pedidos: 0, gasto: 0 };
    r.pedidos++; if (valido(p)) r.gasto += Number(p.total) || 0;
    porUid.set(p.uid, r);
  });
  const palavras = normalizar($('#buscaClientes').value).split(/\s+/).filter(Boolean);
  const linhas = clientes.map(c => {
    const r = porUid.get(c.id) || { pedidos: 0, gasto: 0 };
    const desde = typeof c.criadoEm === 'number' ? c.criadoEm : tempo(c);
    return { ...c, ...r, desde, contato: c.email || '', cidade: [c.cidade, c.uf].filter(Boolean).join('/') };
  }).filter(c => !palavras.length || palavras.every(w => normalizar([c.nome, c.email, c.telefone, c.cidade, c.uf].join(' ')).includes(w)));
  const { campo, desc } = ordemClientes;
  linhas.sort((a, b) => { const x = a[campo], y = b[campo]; const r = typeof x === 'number' ? x - y : String(x || '').localeCompare(String(y || ''), 'pt-BR'); return desc ? -r : r; });
  $('#listaClientes').innerHTML = linhas.length ? linhas.map(c => {
    const tel = soDigitos(c.telefone);
    return `<tr>
      <td><strong>${esc(c.nome || 'Sem nome')}</strong></td>
      <td>${esc(c.email || '')}${c.telefone ? `<small><a href="https://wa.me/${tel.length <= 11 ? '55' + tel : tel}" target="_blank" rel="noopener">${esc(c.telefone)}</a></small>` : ''}</td>
      <td>${esc(c.cidade || '—')}</td>
      <td class="num">${c.pedidos}</td>
      <td class="num">${dinheiro(c.gasto)}</td>
      <td class="num">${c.desde ? new Date(c.desde).toLocaleDateString('pt-BR') : '—'}</td>
    </tr>`; }).join('') : '<tr><td colspan="6" class="vazio">Nenhum cliente encontrado.</td></tr>';
}
$('#buscaClientes').addEventListener('input', desenharClientes);
$('.tabela thead').addEventListener('click', e => {
  const th = e.target.closest('[data-ord]');
  if (!th) return;
  ordemClientes = { campo: th.dataset.ord, desc: ordemClientes.campo === th.dataset.ord ? !ordemClientes.desc : true };
  desenharClientes();
});

/* ---------------------------------------------------------------------
   Conversas (chat do site: conversas/{uid} + mensagens)
   --------------------------------------------------------------------- */
let conversas = [], convAberta = null, pararMsgsConv = null, pararConversas = null, convPrimeira = true;
const ultimaVista = new Map(); // uid → hora da última mensagem já vista (para avisar as novas)
const horaMsg = v => {
  const d = new Date(ms(v) || Date.now()), hoje = new Date();
  const h = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === hoje.toDateString() ? h : `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${h}`;
};

function ouvirConversas() {
  convPrimeira = true;
  pararConversas = api.ouvirConversas(lista => {
    lista.forEach(c => {
      const t = ms(c.atualizadoEm);
      if (!convPrimeira && c.naoLidaLoja && c.ultimaDe === 'cliente' && t !== ultimaVista.get(c.id)) {
        aviso(`💬 Nova mensagem de ${c.nome || c.email || 'cliente'}`);
      }
      ultimaVista.set(c.id, t);
    });
    convPrimeira = false;
    conversas = lista;
    const aberta = conversas.find(c => c.id === convAberta);
    if (aberta && aberta.naoLidaLoja && !$('[data-painel="conversas"]').hidden && !document.hidden) api.marcarLida(aberta.id, true);
    desenharConversas();
  }, err => console.warn('conversas', err));
}
function pararTudoConversas() {
  if (pararConversas) { pararConversas(); pararConversas = null; }
  if (pararMsgsConv) { pararMsgsConv(); pararMsgsConv = null; }
  convAberta = null;
}

function desenharConversas() {
  const naoLidas = conversas.filter(c => c.naoLidaLoja).length;
  $('#contConversas').textContent = naoLidas;
  $('#contConversas').classList.toggle('alerta', naoLidas > 0);
  $('#convLista').innerHTML = conversas.length ? conversas.map(c => `
    <button type="button" class="conv__item${c.naoLidaLoja ? ' nao-lida' : ''}" data-conv="${esc(c.id)}" aria-current="${c.id === convAberta}">
      <strong>${esc(c.nome || c.email || 'Cliente')}</strong><time>${c.atualizadoEm ? horaMsg(c.atualizadoEm) : ''}</time>
      <span>${c.ultimaDe === 'loja' ? 'Você: ' : ''}${esc(c.ultimaMsg || '')}</span>
    </button>`).join('') : '<p class="vazio">Nenhuma conversa ainda. Quando um cliente escrever no chat do site, aparece aqui.</p>';
}
$('#convLista').addEventListener('click', e => { const b = e.target.closest('[data-conv]'); if (b) abrirConversa(b.dataset.conv); });

function abrirConversa(uid) {
  if (pararMsgsConv) { pararMsgsConv(); pararMsgsConv = null; }
  convAberta = uid;
  const c = conversas.find(x => x.id === uid) || {};
  const cli = clientes.find(x => x.id === uid) || {};
  const tel = soDigitos(cli.telefone);
  $('.conv').classList.add('com-aberta');
  $('#convAberta').innerHTML = `
    <div class="conv__topo">
      <button type="button" class="btn btn--sm conv__voltar" data-conv-voltar>← Conversas</button>
      <div><strong>${esc(c.nome || cli.nome || 'Cliente')}</strong><small>${esc(c.email || cli.email || '')}${cli.cidade ? ' · ' + esc(cli.cidade + (cli.uf ? '/' + cli.uf : '')) : ''}</small></div>
      <button type="button" class="btn btn--sm" data-conv-pedidos>Ver pedidos</button>
      ${tel ? `<a class="btn btn--sm btn--whats" href="https://wa.me/${tel.length <= 11 ? '55' + tel : tel}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
    </div>
    <div class="conv__msgs" id="convMsgs"><p class="vazio">Carregando...</p></div>
    <form class="conv__form" id="convForm">
      <label class="visually-hidden" for="convTexto">Resposta</label>
      <textarea id="convTexto" rows="1" maxlength="1000" placeholder="Escreva a resposta... (Enter envia, Shift+Enter quebra linha)"></textarea>
      <button type="submit" class="btn btn--primario">Enviar</button>
    </form>`;
  pararMsgsConv = api.ouvirMensagens(uid, msgs => {
    const caixa = $('#convMsgs');
    if (!caixa || convAberta !== uid) return;
    caixa.innerHTML = msgs.length ? msgs.map(m => `
      <div class="cmsg cmsg--${m.de === 'loja' ? 'loja' : 'cliente'}"><p>${esc(m.texto)}</p><time>${m.criadoEm ? horaMsg(m.criadoEm) : 'enviando...'}</time></div>`).join('')
      : '<p class="vazio">Sem mensagens.</p>';
    caixa.scrollTop = caixa.scrollHeight;
  }, err => { aviso(mensagemErro(err)); console.error(err); });
  api.marcarLida(uid, true);
  desenharConversas();
  const t = $('#convTexto');
  t.addEventListener('input', () => {
    t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 140) + 'px';
    t.style.overflowY = t.scrollHeight > 140 ? 'auto' : 'hidden';
  });
  t.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#convForm').requestSubmit(); } });
  $('#convForm').addEventListener('submit', async e => {
    e.preventDefault();
    const texto = t.value.trim().slice(0, 1000);
    if (!texto) return;
    t.disabled = true;
    try { await api.enviarMensagem(uid, texto, true); t.value = ''; t.style.height = ''; }
    catch (err) { aviso(mensagemErro(err)); console.error(err); }
    finally { t.disabled = false; t.focus(); }
  });
  if (matchMedia('(min-width: 901px)').matches) t.focus();
}
$('#convAberta').addEventListener('click', e => {
  if (e.target.closest('[data-conv-voltar]')) {
    if (pararMsgsConv) { pararMsgsConv(); pararMsgsConv = null; }
    convAberta = null;
    $('.conv').classList.remove('com-aberta');
    $('#convAberta').innerHTML = '<p class="vazio">Escolha uma conversa para responder.</p>';
    desenharConversas();
  }
  if (e.target.closest('[data-conv-pedidos]')) {
    const c = conversas.find(x => x.id === convAberta) || {};
    irPara('pedidos');
    const busca = $('#buscaPedidos');
    busca.value = c.email || c.nome || '';
    busca.dispatchEvent(new Event('input'));
  }
});

iniciar();
