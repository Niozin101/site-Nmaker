/* =====================================================================
   NMAKER — CHAT DA LOJA
   O cliente conversa com a NMAKER sem sair do site. As mensagens ficam
   no Firebase (conversas/{uid}) e a loja responde pelo Painel
   (admin.html → aba Conversas). Precisa estar logado para conversar.
   Ligado por js/conta.js (só quando o Firebase está configurado).
   ===================================================================== */
import { esc, ms } from './firebase-api.js';

const $c = (s, el = document) => el.querySelector(s);
const SUGESTOES = ['Qual o prazo de entrega?', 'Quero personalizar um produto', 'Como está meu pedido?'];
const hora = v => {
  const d = new Date(ms(v) || Date.now()), hoje = new Date();
  const h = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === hoje.toDateString() ? h : `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${h}`;
};

export function iniciarChat({ api, usuario, perfil, abrirConta }) {
  const botao = document.getElementById('whatsFloat');
  if (!botao) return;
  const whats = () => (typeof whatsGeral !== 'undefined' ? whatsGeral : botao.getAttribute('href'));

  // O botão flutuante do WhatsApp vira o botão do chat (o WhatsApp continua dentro do chat)
  botao.classList.add('chat-float');
  botao.removeAttribute('target');
  botao.setAttribute('href', '#chat');
  botao.setAttribute('aria-label', 'Abrir o chat com a NMAKER');
  botao.setAttribute('aria-controls', 'chat');
  botao.setAttribute('aria-expanded', 'false');
  botao.innerHTML = '<svg aria-hidden="true"><use href="#i-chat"/></svg><span class="chat-float__ponto" hidden></span>';

  const painel = document.createElement('section');
  painel.className = 'chat'; painel.id = 'chat'; painel.hidden = true;
  painel.setAttribute('role', 'dialog'); painel.setAttribute('aria-labelledby', 'chatTitulo');
  painel.innerHTML = `
    <header class="chat__topo">
      <span class="chat__avatar" aria-hidden="true"><svg><use href="#i-logo"/></svg></span>
      <div class="chat__quem"><strong id="chatTitulo">NMAKER</strong><small>Respondemos por aqui, normalmente no mesmo dia</small></div>
      <button type="button" class="icon-btn chat__fechar" aria-label="Fechar chat"><svg aria-hidden="true"><use href="#i-close"/></svg></button>
    </header>
    <div class="chat__msgs" id="chatMsgs" aria-live="polite"></div>
    <form class="chat__form" id="chatForm" novalidate>
      <label class="visually-hidden" for="chatTexto">Mensagem</label>
      <textarea id="chatTexto" rows="1" maxlength="1000" placeholder="Escreva sua mensagem..." enterkeyhint="send"></textarea>
      <button type="submit" class="chat__enviar" aria-label="Enviar mensagem">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5L4 12z" fill="currentColor"/></svg>
      </button>
    </form>
    <a class="chat__whats" target="_blank" rel="noopener"><svg aria-hidden="true"><use href="#i-whats"/></svg>Prefere o WhatsApp? Fale por lá</a>`;
  document.body.appendChild(painel);
  const lista = $c('#chatMsgs', painel), form = $c('#chatForm', painel), texto = $c('#chatTexto', painel), ponto = $c('.chat-float__ponto', botao);

  let mensagens = [], pararMsgs = null, pararConversa = null, uidAtual = null, enviando = false;

  /* ---------- Abrir / fechar ---------- */
  const aberto = () => !painel.hidden;
  // textoInicial: frase já escrita na caixa (ex.: dúvida sobre um produto), se ela estiver vazia
  function abrir(textoInicial) {
    if (typeof textoInicial === 'string' && !texto.value.trim()) { texto.value = textoInicial; setTimeout(ajustarAltura, 0); }
    painel.hidden = false;
    botao.setAttribute('aria-expanded', 'true');
    document.body.classList.add('chat-aberto');
    $c('.chat__whats', painel).href = whats();
    ouvirMensagens();
    desenhar();
    if (usuario()) {
      api.marcarLida(usuario().uid, false);
      setTimeout(() => { texto.focus({ preventScroll: true }); texto.setSelectionRange(texto.value.length, texto.value.length); }, 50);
    }
  }
  function fechar() {
    painel.hidden = true;
    botao.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('chat-aberto');
    if (pararMsgs) { pararMsgs(); pararMsgs = null; }
    botao.focus({ preventScroll: true });
  }
  botao.addEventListener('click', e => { e.preventDefault(); aberto() ? fechar() : abrir(); });
  $c('.chat__fechar', painel).addEventListener('click', fechar);
  painel.addEventListener('keydown', e => { if (e.key === 'Escape') fechar(); });
  window.abrirChat = abrir;

  /* ---------- Mensagens ---------- */
  function ouvirMensagens() {
    const u = usuario();
    if (pararMsgs || !u) return;
    pararMsgs = api.ouvirMensagens(u.uid, l => { mensagens = l; desenhar(); }, err => console.warn('NMAKER chat', err));
  }

  function desenhar() {
    const u = usuario();
    const boasVindas = `<div class="msg msg--loja"><p>Oi${u && (u.nome || '').trim() ? ', ' + esc(u.nome.trim().split(' ')[0]) : ''}! 👋 Como podemos ajudar? Pergunte sobre produtos, prazos, frete ou personalizados.</p></div>`;
    if (!u) {
      lista.innerHTML = boasVindas + `
        <div class="chat__entrar">
          <p>Entre na sua conta para conversar com a gente. Assim a resposta fica guardada aqui e você não perde nada.</p>
          <button type="button" class="btn btn--primary btn--sm btn--full" data-chat-entrar>Entrar ou criar conta</button>
        </div>`;
      texto.disabled = true; texto.placeholder = 'Entre na sua conta para enviar';
      $c('.chat__enviar', painel).disabled = true;
      return;
    }
    texto.disabled = false; texto.placeholder = 'Escreva sua mensagem...';
    $c('.chat__enviar', painel).disabled = false;
    const sugestoes = mensagens.length ? '' : `<div class="chat__sugestoes">${SUGESTOES.map(s => `<button type="button" data-sugestao>${esc(s)}</button>`).join('')}</div>`;
    lista.innerHTML = boasVindas + sugestoes + mensagens.map(m => `
      <div class="msg ${m.de === 'loja' ? 'msg--loja' : 'msg--eu'}">
        <p>${esc(m.texto)}</p><time>${m.criadoEm ? hora(m.criadoEm) : 'enviando...'}</time>
      </div>`).join('');
    lista.scrollTop = lista.scrollHeight;
  }

  lista.addEventListener('click', e => {
    if (e.target.closest('[data-chat-entrar]')) { abrirConta('entrar', '💬 Entre para conversar com a NMAKER pelo chat.'); return; }
    const s = e.target.closest('[data-sugestao]');
    if (s) { texto.value = s.textContent; texto.focus(); ajustarAltura(); }
  });

  /* ---------- Enviar ---------- */
  function ajustarAltura() {
    texto.style.height = 'auto';
    texto.style.height = Math.min(texto.scrollHeight, 120) + 'px';
    texto.style.overflowY = texto.scrollHeight > 120 ? 'auto' : 'hidden'; // barra de rolagem só quando precisa
  }
  texto.addEventListener('input', ajustarAltura);
  texto.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const u = usuario(), t = texto.value.trim().slice(0, 1000);
    if (!u || !t || enviando) return;
    enviando = true;
    const p = perfil() || {};
    try {
      await api.enviarMensagem(u.uid, t, false, { nome: (p.nome || u.nome || '').slice(0, 100), email: (u.email || '').slice(0, 150) });
      texto.value = ''; ajustarAltura();
    } catch (err) {
      console.warn('NMAKER chat', err);
      lista.insertAdjacentHTML('beforeend', '<p class="chat__erro">Não foi possível enviar agora. Tente de novo em instantes.</p>');
      lista.scrollTop = lista.scrollHeight;
    } finally { enviando = false; }
  });

  /* ---------- Login / logout e aviso de resposta nova ---------- */
  function trocouUsuario() {
    const u = usuario();
    if ((u && u.uid) === uidAtual) return;
    uidAtual = u && u.uid;
    if (pararMsgs) { pararMsgs(); pararMsgs = null; }
    if (pararConversa) { pararConversa(); pararConversa = null; }
    mensagens = []; ponto.hidden = true;
    if (u) {
      pararConversa = api.ouvirConversa(u.uid, c => {
        const nova = !!(c && c.naoLidaCliente);
        if (nova && aberto()) api.marcarLida(u.uid, false);
        ponto.hidden = !nova || aberto();
      });
    }
    if (aberto()) { ouvirMensagens(); desenhar(); }
  }
  window.addEventListener('nmaker:auth', trocouUsuario);
  trocouUsuario();
  if (location.hash === '#chat') abrir();
}
