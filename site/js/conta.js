/* =====================================================================
   NMAKER — CONTAS DE CLIENTE (login, cadastro, pedidos, favoritos, painel)

   Usa o Firebase (Google) para guardar contas e senhas com segurança.
   Enquanto FIREBASE_CONFIG (no index.html) estiver vazio, esta parte fica
   desligada e o botão de conta não aparece para os clientes.

   Para ver funcionando antes de configurar o Firebase, abra o site com
   ?demo-conta no final do endereço (ex.: index.html?demo-conta).
   No modo demonstração os dados ficam só no seu navegador.
   ===================================================================== */

import { STATUS, demo, configurado, esc, dinheiro, tempo, dataBR, ehAdminEmail, criarApi, mensagemErro } from './firebase-api.js';

const $c = (s, el = document) => el.querySelector(s);
const V = () => window.NMKValidar; // validações definidas no index.html

/* ---------------------------------------------------------------------
   2. Interface
   --------------------------------------------------------------------- */
async function iniciar() {
  let api;
  try { api = await criarApi(); }
  catch (e) { console.warn('NMAKER: não foi possível carregar o Firebase', e); return; }
  if (!api) return; // sem Firebase configurado: área de conta desligada

  let usuario = null, perfil = null, viewAtual = 'entrar', abaConta = 'pedidos';
  const ehAdmin = () => !!usuario && ehAdminEmail(usuario.email);

  // Botão de conta no topo
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'icon-btn conta-btn'; btn.id = 'contaBtn';
  btn.setAttribute('aria-label', 'Entrar ou criar conta');
  btn.innerHTML = '<svg aria-hidden="true"><use href="#i-user"/></svg><span class="conta-btn__ini" aria-hidden="true"></span>';
  $c('#cartOpen').before(btn);
  document.body.classList.add('tem-conta');

  // Janela
  const dlg = document.createElement('dialog');
  dlg.className = 'cmodal'; dlg.id = 'contaModal'; dlg.setAttribute('aria-labelledby', 'cmTitulo');
  dlg.innerHTML = `<div class="cmodal__inner">
      <button type="button" class="icon-btn cmodal__fechar" data-cm-fechar aria-label="Fechar"><svg aria-hidden="true"><use href="#i-close"/></svg></button>
      ${demo ? '<p class="cm-demo">Modo demonstração: os dados ficam só neste navegador.</p>' : ''}
      <div id="cmCorpo"></div>
    </div>`;
  document.body.appendChild(dlg);
  const corpo = $c('#cmCorpo', dlg);
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => { document.body.style.overflow = ''; avisoTopo = ''; if (!usuario) window.compraPendente = false; });
  dlg.querySelector('[data-cm-fechar]').addEventListener('click', () => dlg.close());

  let avisoTopo = '';
  function abrir(view, aviso = '') {
    viewAtual = view || (usuario ? 'conta' : 'entrar');
    avisoTopo = aviso;
    render();
    if (!dlg.open) { dlg.showModal(); document.body.style.overflow = 'hidden'; }
  }
  btn.addEventListener('click', () => abrir());
  window.abrirConta = abrir;

  const googleBtn = `<button type="button" class="btn btn--ghost btn--block cm-google" data-acao="google">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.6 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z"/></svg>
      Continuar com Google</button>`;

  function render() {
    const views = {
      entrar: () => `
        <h2 id="cmTitulo">Entrar</h2>
        <p class="cm-sub">Acompanhe seus pedidos, salve seus dados e seus favoritos.</p>
        ${googleBtn}
        <div class="cm-ou"><span>ou com e-mail</span></div>
        <form class="cm-form" data-form="entrar" novalidate>
          <div class="field"><label for="cmEmail">E-mail</label><input id="cmEmail" name="email" type="email" autocomplete="email" required></div>
          <div class="field"><label for="cmSenha">Senha</label><input id="cmSenha" name="senha" type="password" autocomplete="current-password" required></div>
          <p class="form__error" role="alert"></p>
          <button type="submit" class="btn btn--primary btn--block">Entrar</button>
        </form>
        <button type="button" class="cm-link" data-view="recuperar">Esqueci minha senha</button>
        <p class="cm-troca">Não tem conta? <button type="button" class="cm-link" data-view="cadastrar">Criar conta</button></p>`,
      cadastrar: () => `
        <h2 id="cmTitulo">Criar conta</h2>
        <p class="cm-sub">É rapidinho e grátis.</p>
        ${googleBtn}
        <div class="cm-ou"><span>ou com e-mail</span></div>
        <form class="cm-form" data-form="cadastrar" novalidate>
          <div class="field"><label for="cmNome">Nome</label><input id="cmNome" name="nome" type="text" autocomplete="name" required></div>
          <div class="field"><label for="cmEmail2">E-mail</label><input id="cmEmail2" name="email" type="email" autocomplete="email" required></div>
          <div class="field"><label for="cmSenha2">Senha (mínimo 6, com letras e números)</label><input id="cmSenha2" name="senha" type="password" autocomplete="new-password" minlength="6" required></div>
          <div class="field"><label for="cmSenha3">Confirme a senha</label><input id="cmSenha3" name="senha2" type="password" autocomplete="new-password" required></div>
          <p class="form__error" role="alert"></p>
          <button type="submit" class="btn btn--primary btn--block">Criar minha conta</button>
        </form>
        <p class="cm-troca">Já tem conta? <button type="button" class="cm-link" data-view="entrar">Entrar</button></p>`,
      recuperar: () => `
        <h2 id="cmTitulo">Recuperar senha</h2>
        <p class="cm-sub">Enviamos um link para você criar uma senha nova.</p>
        <form class="cm-form" data-form="recuperar" novalidate>
          <div class="field"><label for="cmEmail3">E-mail da conta</label><input id="cmEmail3" name="email" type="email" autocomplete="email" required></div>
          <p class="form__error" role="alert"></p>
          <button type="submit" class="btn btn--primary btn--block">Enviar link</button>
        </form>
        <button type="button" class="cm-link" data-view="entrar">← Voltar para entrar</button>`,
      conta: () => {
        const abas = [['pedidos', 'Meus pedidos'], ['dados', 'Dados de entrega'], ['favoritos', 'Favoritos']];
        if (ehAdmin()) abas.push(['loja', 'Painel']);
        return `
        <div class="cm-perfil">
          <span class="cm-avatar" aria-hidden="true">${esc((usuario.nome || usuario.email || '?').trim().charAt(0).toUpperCase())}</span>
          <div><h2 id="cmTitulo">${esc(usuario.nome || 'Minha conta')}</h2><p>${esc(usuario.email)}</p></div>
          <button type="button" class="btn btn--ghost btn--sm" data-acao="sair">Sair</button>
        </div>
        ${usuario.verificado === false ? '<p class="cm-aviso">Confirme seu e-mail pelo link que enviamos (veja também o spam).</p>' : ''}
        <div class="cm-abas" role="tablist">${abas.map(([id, nome]) => `<button type="button" role="tab" data-aba="${id}" aria-selected="${abaConta === id}">${nome}</button>`).join('')}</div>
        <div class="cm-painel" id="cmPainel" role="tabpanel"><p class="cm-carregando">Carregando…</p></div>`;
      },
    };
    corpo.innerHTML = (avisoTopo && viewAtual !== 'conta' ? `<p class="cm-aviso cm-aviso--compra">${/^\p{Extended_Pictographic}/u.test(avisoTopo) ? '' : '🛒 '}${esc(avisoTopo)}</p>` : '') + views[viewAtual]();
    if (viewAtual === 'conta') renderAba();
    const primeiro = corpo.querySelector('input, [role=tab][aria-selected=true]');
    if (primeiro && dlg.open) setTimeout(() => primeiro.focus(), 30);
  }

  /* ---- Ações dos formulários ---- */
  corpo.addEventListener('click', async e => {
    const v = e.target.closest('[data-view]');
    if (v) { viewAtual = v.dataset.view; render(); return; }
    const aba = e.target.closest('[data-aba]');
    if (aba) { abaConta = aba.dataset.aba; corpo.querySelectorAll('[data-aba]').forEach(b => b.setAttribute('aria-selected', b === aba)); renderAba(); return; }
    const acao = e.target.closest('[data-acao]');
    if (!acao) return;
    if (acao.dataset.acao === 'google') {
      try { await api.entrarGoogle(); } catch (err) { mostrarErro(mensagemErro(err)); }
    }
    if (acao.dataset.acao === 'sair') { await api.sair(); dlg.close(); window.avisar && avisar('Você saiu da sua conta'); }
  });
  function mostrarErro(msg) { const p = corpo.querySelector('.form__error'); if (p) p.textContent = msg; }

  corpo.addEventListener('submit', async e => {
    const f = e.target.closest('[data-form]');
    if (!f) return;
    e.preventDefault();
    const tipo = f.dataset.form, dados = Object.fromEntries(new FormData(f));
    const botao = f.querySelector('[type=submit]'), texto = botao.textContent;
    const { Validar, validarCampos } = V();
    const regras = {
      entrar: [[f.email, Validar.email], [f.senha, v => v ? '' : 'Informe sua senha.']],
      cadastrar: [[f.nome, Validar.nome], [f.email, Validar.email], [f.senha, Validar.senha],
        [f.senha2, v => !v ? 'Repita a senha.' : v !== f.senha.value ? 'As senhas não são iguais.' : '']],
      recuperar: [[f.email, Validar.email]],
    }[tipo];
    const erro = validarCampos(regras);
    if (erro) { mostrarErro(''); erro.focus(); return; }
    mostrarErro('');
    botao.disabled = true; botao.textContent = 'Aguarde…';
    try {
      if (tipo === 'entrar') await api.entrar(dados.email.trim(), dados.senha);
      if (tipo === 'cadastrar') {
        const u = await api.cadastrar(dados.nome.trim(), dados.email.trim(), dados.senha);
        if (u) {
          usuario = u;
          await api.salvarPerfil(u.uid, { nome: dados.nome.trim(), email: dados.email.trim(), criadoEm: Date.now() });
          perfil = { ...(perfil || {}), nome: dados.nome.trim() };
          viewAtual = 'conta'; render();
        }
      }
      if (tipo === 'recuperar') {
        await api.recuperar(dados.email.trim());
        f.outerHTML = '<p class="cm-ok">✓ Se existir uma conta com esse e-mail, você vai receber o link em instantes. Confira também o spam.</p>';
        return;
      }
    } catch (err) { mostrarErro(mensagemErro(err)); }
    finally { if (botao.isConnected) { botao.disabled = false; botao.textContent = texto; } }
  });

  /* ---- Abas da conta ---- */
  async function renderAba() {
    const painel = $c('#cmPainel', corpo);
    if (!painel) return;
    painel.innerHTML = '<p class="cm-carregando">Carregando…</p>';
    try {
      if (abaConta === 'pedidos') painel.innerHTML = htmlPedidos(await api.meusPedidos(usuario.uid), false);
      if (abaConta === 'dados') { painel.innerHTML = htmlDados(); ligarDados(painel); }
      if (abaConta === 'favoritos') painel.innerHTML = htmlFavoritos();
      if (abaConta === 'loja' && ehAdmin()) await renderLoja(painel);
    } catch (err) { painel.innerHTML = `<p class="form__error">${esc(mensagemErro(err))}</p>`; }
  }

  function htmlPedido(p, admin) {
    const st = STATUS.includes(p.status) ? p.status : STATUS[0];
    const cli = p.cliente || {};
    const telefone = String(cli.telefone || '').replace(/\D/g, '');
    return `<article class="cm-pedido">
      <header>
        <div><strong>Pedido #${esc(p.codigo || p.id.slice(0, 6).toUpperCase())}</strong><span>${dataBR(tempo(p))} · ${esc(p.forma || '')}</span></div>
        ${admin
          ? `<select class="cm-status" data-status="${esc(p.id)}" aria-label="Status do pedido">${STATUS.map(s => `<option ${s === st ? 'selected' : ''}>${s}</option>`).join('')}</select>`
          : `<span class="cm-chip" data-st="${STATUS.indexOf(st)}">${esc(st)}</span>`}
      </header>
      ${admin ? `<p class="cm-cliente">${esc(cli.nome || 'Sem nome')} · ${esc(cli.email || '')}${cli.telefone ? ` · <a href="https://wa.me/55${telefone}" target="_blank" rel="noopener">WhatsApp ${esc(cli.telefone)}</a>` : ''}${cli.endereco ? `<br>${esc(cli.endereco)}` : cli.cep ? `<br>CEP ${esc(cli.cep)}` : ''}</p>` : ''}
      <ul>${(p.itens || []).map(i => `<li>${esc(i.qtd)}x ${esc(i.nome)}<span>${i.preco ? dinheiro(i.preco * i.qtd) : 'a confirmar'}</span></li>`).join('')}</ul>
      <footer>Total dos produtos <strong>${dinheiro(p.total)}</strong></footer>
    </article>`;
  }
  function htmlPedidos(lista, admin) {
    if (!lista.length) return `<div class="cm-vazio"><p>Você ainda não fez pedidos pelo site.</p><a class="btn btn--primary btn--sm" href="#produtos" data-cm-fechar-link>Ver produtos</a></div>`;
    return `<div class="cm-lista">${lista.map(p => htmlPedido(p, admin)).join('')}</div>`;
  }

  function htmlDados() {
    const d = perfil || {};
    const campo = (id, rotulo, extra = '') => `<div class="field"><label for="cd-${id}">${rotulo}</label><input id="cd-${id}" name="${id}" value="${esc(d[id] || '')}" ${extra}></div>`;
    return `<form class="cm-form cm-dados" novalidate>
      <div class="form__row">${campo('nome', 'Nome completo', 'autocomplete="name"')}${campo('telefone', 'WhatsApp', 'type="tel" inputmode="tel" autocomplete="tel" placeholder="(00) 00000-0000"')}</div>
      <div class="form__row">${campo('cep', 'CEP', 'inputmode="numeric" autocomplete="postal-code" placeholder="00000-000"')}${campo('numero', 'Número', 'autocomplete="address-line2"')}</div>
      ${campo('endereco', 'Rua / Avenida', 'autocomplete="address-line1"')}
      <div class="form__row">${campo('complemento', 'Complemento (opcional)')}${campo('bairro', 'Bairro')}</div>
      <div class="form__row">${campo('cidade', 'Cidade', 'autocomplete="address-level2"')}${campo('uf', 'Estado (UF)', 'maxlength="2" autocomplete="address-level1"')}</div>
      <p class="form__error" role="alert"></p>
      <button type="submit" class="btn btn--primary btn--block">Salvar dados</button>
      <p class="form__note">Usamos estes dados para preencher seu pedido e calcular o frete.</p>
    </form>`;
  }
  function ligarDados(painel) {
    const f = $c('form', painel);
    const { Validar, validarCampos, validarAoVivo, mascaraTelefone, mascaraCep, autoPreencherCep } = V();
    const regras = [
      [f.nome, Validar.nome], [f.telefone, Validar.telefone], [f.cep, Validar.cep],
      [f.endereco, Validar.obrigatorio('a rua')], [f.numero, Validar.numero],
      [f.bairro, Validar.obrigatorio('o bairro')], [f.cidade, Validar.obrigatorio('a cidade')], [f.uf, Validar.uf],
    ];
    mascaraTelefone(f.telefone);
    mascaraCep(f.cep);
    f.cep.addEventListener('input', () => autoPreencherCep(f));
    f.uf.addEventListener('input', () => { f.uf.value = f.uf.value.replace(/[^a-z]/gi, '').toUpperCase(); });
    validarAoVivo(regras);
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const erro = validarCampos(regras);
      if (erro) { $c('.form__error', f).textContent = 'Confira os campos destacados.'; erro.focus(); return; }
      $c('.form__error', f).textContent = '';
      const dados = Object.fromEntries(new FormData(f));
      Object.keys(dados).forEach(k => dados[k] = dados[k].trim());
      dados.uf = dados.uf.toUpperCase();
      const b = f.querySelector('[type=submit]');
      b.disabled = true; b.textContent = 'Salvando…';
      try { await api.salvarPerfil(usuario.uid, dados); perfil = { ...(perfil || {}), ...dados }; b.textContent = '✓ Dados salvos'; }
      catch (err) { $c('.form__error', f).textContent = mensagemErro(err); b.textContent = 'Salvar dados'; }
      finally { b.disabled = false; setTimeout(() => { if (b.isConnected) b.textContent = 'Salvar dados'; }, 2000); }
    });
  }

  function htmlFavoritos() {
    const ids = window.nmakerFavoritos ? nmakerFavoritos.lista() : [];
    const itens = ids.map(produtoPorId).filter(Boolean);
    if (!itens.length) return `<div class="cm-vazio"><p>Toque no ♥ dos produtos para guardar seus favoritos aqui.</p><a class="btn btn--primary btn--sm" href="#produtos" data-cm-fechar-link>Ver produtos</a></div>`;
    return `<ul class="cm-favs">${itens.map(p => `
      <li>
        <img src="${imagemDe(p)}" alt="" width="64" height="64" loading="lazy">
        <div><strong>${esc(p.nome)}</strong><span>${p.personalizavel && !p.preco ? 'Sob orçamento' : dinheiro(p.preco)}</span></div>
        <a class="btn btn--ghost btn--sm" href="${p.personalizavel ? '#personalizados' : '#produto/' + p.id}" data-cm-fechar-link>Ver</a>
        <button type="button" class="icon-btn" data-fav="${p.id}" aria-label="Remover dos favoritos"><svg aria-hidden="true"><use href="#i-trash"/></svg></button>
      </li>`).join('')}</ul>`;
  }
  // Links dentro da janela fecham a janela antes de navegar
  corpo.addEventListener('click', e => {
    const l = e.target.closest('[data-cm-fechar-link]');
    if (l) { const destino = l.getAttribute('href'); dlg.close(); setTimeout(() => { location.hash = destino.slice(1); }, 50); e.preventDefault(); }
    const fav = e.target.closest('[data-fav]');
    if (fav && window.nmakerFavoritos) { nmakerFavoritos.alternar(fav.dataset.fav); renderAba(); }
  });

  /* ---- Painel da loja (só para os e-mails em ADMIN_EMAILS) ---- */
  async function renderLoja(painel) {
    const [pedidos, clientes] = await Promise.all([api.todosPedidos(), api.contarClientes().catch(() => '—')]);
    const validos = pedidos.filter(p => p.status !== 'Cancelado');
    const abertos = pedidos.filter(p => ['Aguardando pagamento', 'Pago', 'Em produção'].includes(p.status || STATUS[0])).length;
    painel.innerHTML = `
      <div class="cm-stats">
        <div><span>Pedidos</span><strong>${pedidos.length}</strong></div>
        <div><span>Em aberto</span><strong>${abertos}</strong></div>
        <div><span>Vendido</span><strong>${dinheiro(validos.reduce((s, p) => s + (Number(p.total) || 0), 0))}</strong></div>
        <div><span>Clientes</span><strong>${clientes}</strong></div>
      </div>
      <a class="btn btn--primary btn--block" href="admin.html${demo ? '?demo-conta' : ''}" target="_blank" rel="noopener">Abrir painel completo da loja →</a>
      <p class="form__note">No painel completo: pedidos em tempo real, filtros, gráfico de vendas, clientes e exportação para planilha.</p>`;
  }

  /* ---------------------------------------------------------------------
     3. Ligação com o resto do site (carrinho, favoritos)
     --------------------------------------------------------------------- */
  // Chat da loja (js/chat.js): usa a mesma conta
  import('./chat.js')
    .then(m => m.iniciarChat({ api, usuario: () => usuario, perfil: () => perfil, abrirConta: abrir }))
    .catch(e => console.warn('NMAKER: chat indisponível', e));

  api.onAuth(async u => {
    usuario = u; perfil = null; abaConta = 'pedidos';
    window.dispatchEvent(new CustomEvent('nmaker:auth'));
    if (window.limparEntregaCheckout) limparEntregaCheckout(); // troca de conta: não deixa dados da anterior no carrinho
    btn.classList.toggle('is-logado', !!u);
    const finalizar = document.getElementById('checkout');
    if (finalizar && typeof EXIGIR_LOGIN_PARA_COMPRAR !== 'undefined' && EXIGIR_LOGIN_PARA_COMPRAR) finalizar.textContent = u ? 'Continuar para pagamento' : 'Entrar e finalizar compra';
    btn.setAttribute('aria-label', u ? `Minha conta (${u.nome || u.email})` : 'Entrar ou criar conta');
    $c('.conta-btn__ini', btn).textContent = u ? (u.nome || u.email || '?').trim().charAt(0).toUpperCase() : '';
    if (u) {
      try { perfil = await api.lerPerfil(u.uid); } catch { perfil = null; }
      if (!perfil) {
        perfil = { nome: u.nome || '', email: u.email || '', criadoEm: Date.now() };
        api.salvarPerfil(u.uid, perfil).catch(() => {});
      }
      // Junta os favoritos deste aparelho com os da conta
      if (window.nmakerFavoritos) {
        const juntos = [...new Set([...(perfil && perfil.favoritos || []), ...nmakerFavoritos.lista()])];
        nmakerFavoritos.definir(juntos);
        if (juntos.length !== (perfil && perfil.favoritos || []).length) api.salvarPerfil(u.uid, { favoritos: juntos }).catch(() => {});
      }
      if (window.compraPendente) {
        window.compraPendente = false;
        if (dlg.open) dlg.close();
        setTimeout(() => { if (window.abrirCarrinho) abrirCarrinho(); setTimeout(() => document.getElementById('checkout').click(), 350); }, 200);
      } else if (dlg.open && viewAtual !== 'conta') { viewAtual = 'conta'; render(); }
    } else if (dlg.open && viewAtual === 'conta') { viewAtual = 'entrar'; render(); }
  });
  window.addEventListener('nmaker:favoritos', () => {
    if (usuario && window.nmakerFavoritos) api.salvarPerfil(usuario.uid, { favoritos: nmakerFavoritos.lista() }).catch(() => {});
  });

  // Usado pelo carrinho (index.html)
  window.nmakerConta = {
    logado: () => !!usuario,
    // Preenche os dados de entrega do carrinho com o que está salvo na conta
    preencherCheckout(form) {
      if (!usuario) return;
      const p = perfil || {};
      const valores = { ...p, nome: p.nome || usuario.nome || '' };
      ['nome', 'telefone', 'cep', 'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'uf'].forEach(n => {
        // os dados da conta têm prioridade (evita sobrar o endereço de outra pessoa no mesmo aparelho)
        if (form[n] && valores[n]) form[n].value = valores[n];
      });
    },
    // Guarda o endereço usado na compra para a próxima vez
    salvarEndereco(dados) {
      if (!usuario) return;
      perfil = { ...(perfil || {}), ...dados };
      api.salvarPerfil(usuario.uid, dados).catch(err => console.warn('NMAKER: endereço não salvo', err));
    },
    linhasExtras() { return usuario ? [`E-mail: ${usuario.email}`] : []; },
    // Pede ao servidor (Cloudflare) para criar o pagamento no Mercado Pago e devolve { url, codigo }
    async criarPagamento(itens, entrega) {
      if (!usuario) throw new Error('Entre na sua conta para pagar.');
      if (demo) { // demonstração: simula um pagamento aprovado sem sair do site
        const total = itens.reduce((s, i) => s + ((window.itensDoCarrinho && itensDoCarrinho().find(x => x.chave === i.chave)) || {}).preco * i.qtd, 0);
        const codigo = this.registrarPedido('Mercado Pago (demonstração)', itensDoCarrinho(), total, { ...entrega, endereco: `${entrega.endereco}, ${entrega.numero} - ${entrega.bairro} - ${entrega.cidade}/${entrega.uf}` });
        return { url: `${location.pathname}?demo-conta&pagamento=aprovado&pedido=${codigo}`, codigo };
      }
      const token = await api.idToken();
      let r;
      try {
        r = await fetch('/api/criar-pagamento', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ itens, entrega }),
        });
      } catch { throw new Error('Sem conexão. Verifique a internet e tente de novo.'); }
      if (r.status === 404) throw new Error('O pagamento online funciona no site publicado (não no seu computador).');
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.url) throw new Error(j.erro || 'Não foi possível abrir o pagamento agora.');
      return j;
    },
    // Salva o pedido na conta do cliente e devolve o código (o WhatsApp abre na hora)
    registrarPedido(forma, itens, total, extra = {}) {
      if (!usuario) return null;
      const id = api.novoIdPedido();
      const codigo = id.slice(-6).toUpperCase();
      const p = perfil || {};
      const end = [p.endereco, p.numero, p.complemento, p.bairro, p.cidade && `${p.cidade}/${p.uf || ''}`].filter(Boolean).join(', ');
      api.salvarPedido(id, {
        uid: usuario.uid, codigo, forma, status: STATUS[0],
        itens: itens.map(i => ({ nome: i.nome, qtd: i.qtd, preco: i.preco || 0 })),
        total: Number(total) || 0,
        cliente: { nome: extra.nome || p.nome || usuario.nome || '', email: usuario.email || '', telefone: extra.telefone || p.telefone || '', cep: extra.cep || p.cep || '', endereco: extra.endereco || end },
      }).catch(err => console.warn('NMAKER: pedido não salvo na conta', err));
      return codigo;
    },
  };
}

iniciar();
