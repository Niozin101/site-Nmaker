/* =====================================================================
   NMAKER — conexão com o Firebase (usada pelo site e pelo painel admin)

   A configuração fica em js/config.js (FIREBASE_CONFIG e ADMIN_EMAILS).
   Com ?demo-conta no endereço, usa uma demonstração local (dados só no
   navegador), útil para ver as telas sem mexer nos dados reais.
   ===================================================================== */

export const STATUS = ['Aguardando pagamento', 'Pago', 'Em produção', 'Enviado', 'Entregue', 'Cancelado'];
export const cfg = window.FIREBASE_CONFIG || {};
export const configurado = !!(cfg.apiKey && cfg.projectId);
// O modo demonstração só funciona no seu computador (localhost), nunca no site publicado
const local = ['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname);
export const demo = local && new URLSearchParams(location.search).has('demo-conta');
export const ADMINS = (window.ADMIN_EMAILS || []).map(e => e.trim().toLowerCase()).filter(Boolean);

export const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const dinheiro = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const tempo = p => (p.criadoEm && p.criadoEm.toMillis ? p.criadoEm.toMillis() : (p.criadoEm || 0));
export const ms = v => (v && v.toMillis ? v.toMillis() : (v || 0));   // data do Firebase (ou número) em milissegundos
export const dataBR = ms => ms ? new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'agora';
export const ehAdminEmail = email => !!email && (ADMINS.includes(email.toLowerCase()) || (demo && email.toLowerCase().endsWith('@nmaker.demo')));

/* ---------------------------------------------------------------------
   Firebase de verdade
   --------------------------------------------------------------------- */
async function apiFirebase() {
  const v = '10.12.2';
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${v}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${v}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${v}/firebase-firestore.js`),
  ]);
  const app = initializeApp(cfg);
  const auth = A.getAuth(app);
  auth.languageCode = 'pt';
  const db = F.getFirestore(app);
  const usuario = u => u && { uid: u.uid, nome: u.displayName || '', email: u.email || '', verificado: u.emailVerified };
  const lista = s => s.docs.map(d => ({ id: d.id, ...d.data() }));
  return {
    onAuth: cb => A.onAuthStateChanged(auth, u => cb(usuario(u))),
    entrar: (email, senha) => A.signInWithEmailAndPassword(auth, email, senha),
    async cadastrar(nome, email, senha) {
      const cred = await A.createUserWithEmailAndPassword(auth, email, senha);
      await A.updateProfile(cred.user, { displayName: nome });
      A.sendEmailVerification(cred.user).catch(() => {});
      return usuario(cred.user);
    },
    entrarGoogle: () => A.signInWithPopup(auth, new A.GoogleAuthProvider()),
    sair: () => A.signOut(auth),
    recuperar: email => A.sendPasswordResetEmail(auth, email),
    idToken: () => auth.currentUser ? auth.currentUser.getIdToken() : Promise.resolve(null),
    async lerPerfil(uid) { const s = await F.getDoc(F.doc(db, 'usuarios', uid)); return s.exists() ? s.data() : null; },
    salvarPerfil: (uid, dados) => F.setDoc(F.doc(db, 'usuarios', uid), { ...dados, atualizadoEm: F.serverTimestamp() }, { merge: true }),
    novoIdPedido: () => F.doc(F.collection(db, 'pedidos')).id,
    salvarPedido: (id, dados) => F.setDoc(F.doc(db, 'pedidos', id), { ...dados, criadoEm: F.serverTimestamp() }),
    async meusPedidos(uid) {
      const s = await F.getDocs(F.query(F.collection(db, 'pedidos'), F.where('uid', '==', uid)));
      return lista(s).sort((a, b) => tempo(b) - tempo(a));
    },
    async todosPedidos() {
      return lista(await F.getDocs(F.query(F.collection(db, 'pedidos'), F.orderBy('criadoEm', 'desc'), F.limit(500))));
    },
    // Painel: recebe os pedidos em tempo real (novos pedidos aparecem sozinhos)
    ouvirPedidos(cb, erro) {
      return F.onSnapshot(F.query(F.collection(db, 'pedidos'), F.orderBy('criadoEm', 'desc'), F.limit(1000)),
        s => cb(lista(s)), erro);
    },
    async listarClientes() { return lista(await F.getDocs(F.collection(db, 'usuarios'))); },
    atualizarStatus: (id, status) => F.updateDoc(F.doc(db, 'pedidos', id), { status, atualizadoEm: F.serverTimestamp() }),
    async contarClientes() { const s = await F.getCountFromServer(F.collection(db, 'usuarios')); return s.data().count; },

    // ---- Chat da loja: conversas/{uid} (resumo) + conversas/{uid}/mensagens ----
    ouvirConversa: (uid, cb) => F.onSnapshot(F.doc(db, 'conversas', uid), s => cb(s.exists() ? s.data() : null), () => cb(null)),
    ouvirMensagens: (uid, cb, erro) => F.onSnapshot(
      F.query(F.collection(db, 'conversas', uid, 'mensagens'), F.orderBy('criadoEm', 'asc'), F.limitToLast(300)),
      { includeMetadataChanges: false }, s => cb(lista(s)), erro),
    ouvirConversas: (cb, erro) => F.onSnapshot(
      F.query(F.collection(db, 'conversas'), F.orderBy('atualizadoEm', 'desc'), F.limit(300)), s => cb(lista(s)), erro),
    // deLoja = resposta do painel; dadosCliente = { nome, email } de quem escreve pelo site
    enviarMensagem(uid, texto, deLoja, dadosCliente = {}) {
      const b = F.writeBatch(db), conversa = F.doc(db, 'conversas', uid);
      const resumo = { ultimaMsg: texto.slice(0, 140), ultimaDe: deLoja ? 'loja' : 'cliente', atualizadoEm: F.serverTimestamp() };
      if (deLoja) b.update(conversa, { ...resumo, naoLidaCliente: true, naoLidaLoja: false });
      else b.set(conversa, { ...resumo, ...dadosCliente, uid, naoLidaLoja: true, naoLidaCliente: false }, { merge: true });
      b.set(F.doc(F.collection(db, 'conversas', uid, 'mensagens')), { de: deLoja ? 'loja' : 'cliente', texto, criadoEm: F.serverTimestamp() });
      return b.commit();
    },
    marcarLida: (uid, deLoja) => F.updateDoc(F.doc(db, 'conversas', uid), deLoja ? { naoLidaLoja: false } : { naoLidaCliente: false }).catch(() => {}),
  };
}

/* ---------------------------------------------------------------------
   Demonstração local (NÃO é segura: serve só para visualizar as telas)
   --------------------------------------------------------------------- */
function apiDemo() {
  const ler = k => { try { return JSON.parse(localStorage.getItem('nmaker-demo-' + k)) || {}; } catch { return {}; } };
  const gravar = (k, v) => { try { localStorage.setItem('nmaker-demo-' + k, JSON.stringify(v)); } catch { /* sem armazenamento */ } };
  const ouvintes = [];
  let atual = ler('sessao').uid ? ler('sessao') : null;
  const avisar = () => ouvintes.forEach(cb => cb(atual));
  const erro = code => Object.assign(new Error(code), { code });
  const entrarComo = c => { atual = { uid: c.uid, nome: c.nome, email: c.email, verificado: true }; gravar('sessao', atual); avisar(); };
  const pedidos = () => Object.entries(ler('pedidos')).map(([id, d]) => ({ id, ...d })).sort((a, b) => tempo(b) - tempo(a));
  return {
    onAuth: cb => { ouvintes.push(cb); setTimeout(() => cb(atual), 0); },
    async entrar(email, senha) {
      const c = ler('contas')[email.toLowerCase()];
      if (!c || c.senha !== senha) throw erro('auth/invalid-credential');
      entrarComo(c);
    },
    async cadastrar(nome, email, senha) {
      const contas = ler('contas'), k = email.toLowerCase();
      if (contas[k]) throw erro('auth/email-already-in-use');
      if (senha.length < 6) throw erro('auth/weak-password');
      contas[k] = { uid: 'demo-' + Date.now().toString(36), nome, email: k, senha };
      gravar('contas', contas); entrarComo(contas[k]);
      return { uid: contas[k].uid, nome, email: k, verificado: true };
    },
    async entrarGoogle() {
      const contas = ler('contas'), k = 'dono@nmaker.demo';
      contas[k] = contas[k] || { uid: 'demo-dono', nome: 'Dono da loja (demo)', email: k, senha: '-' };
      gravar('contas', contas); entrarComo(contas[k]);
    },
    async sair() { atual = null; gravar('sessao', {}); avisar(); },
    async idToken() { return atual ? 'demo' : null; },
    async recuperar() { /* no demo não envia e-mail */ },
    async lerPerfil(uid) { return ler('perfis')[uid] || null; },
    async salvarPerfil(uid, dados) { const p = ler('perfis'); p[uid] = { ...(p[uid] || {}), ...dados }; gravar('perfis', p); },
    novoIdPedido: () => 'demo' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    async salvarPedido(id, dados) { const p = ler('pedidos'); p[id] = { ...dados, criadoEm: Date.now() }; gravar('pedidos', p); },
    async meusPedidos(uid) { return pedidos().filter(p => p.uid === uid); },
    async todosPedidos() { return pedidos(); },
    ouvirPedidos(cb) {
      cb(pedidos());
      const t = setInterval(() => cb(pedidos()), 3000);
      return () => clearInterval(t);
    },
    async listarClientes() { return Object.entries(ler('perfis')).map(([id, d]) => ({ id, ...d })); },
    async atualizarStatus(id, status) { const p = ler('pedidos'); if (p[id]) { p[id].status = status; gravar('pedidos', p); } },
    async contarClientes() { return Object.keys(ler('perfis')).length; },

    // Chat (demonstração: guardado neste navegador; outras abas veem a cada 1,5 s)
    ouvirConversa(uid, cb) { return vigiar(() => cb((ler('chat')[uid] || {}).conversa || null)); },
    ouvirMensagens(uid, cb) { return vigiar(() => cb((ler('chat')[uid] || {}).msgs || [])); },
    ouvirConversas(cb) {
      return vigiar(() => cb(Object.entries(ler('chat')).map(([id, x]) => ({ id, ...x.conversa })).sort((a, b) => ms(b.atualizadoEm) - ms(a.atualizadoEm))));
    },
    async enviarMensagem(uid, texto, deLoja, dadosCliente = {}) {
      const c = ler('chat'), x = c[uid] || { conversa: { uid }, msgs: [] };
      x.conversa = { ...x.conversa, ...(deLoja ? {} : dadosCliente), ultimaMsg: texto.slice(0, 140), ultimaDe: deLoja ? 'loja' : 'cliente',
        atualizadoEm: Date.now(), naoLidaLoja: !deLoja, naoLidaCliente: !!deLoja };
      x.msgs.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), de: deLoja ? 'loja' : 'cliente', texto, criadoEm: Date.now() });
      c[uid] = x; gravar('chat', c);
    },
    async marcarLida(uid, deLoja) { const c = ler('chat'); if (c[uid]) { c[uid].conversa[deLoja ? 'naoLidaLoja' : 'naoLidaCliente'] = false; gravar('chat', c); } },
  };
  function vigiar(f) { f(); const t = setInterval(f, 1500); return () => clearInterval(t); }
}

export async function criarApi() {
  if (configurado && !demo) return apiFirebase();
  if (demo) return apiDemo();
  return null;
}

export function mensagemErro(e) {
  const m = {
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/user-not-found': 'E-mail ou senha incorretos.',
    'auth/invalid-email': 'Esse e-mail não parece válido.',
    'auth/email-already-in-use': 'Já existe uma conta com esse e-mail. Tente entrar.',
    'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
    'auth/too-many-requests': 'Muitas tentativas. Espere alguns minutos e tente de novo.',
    'auth/popup-closed-by-user': 'A janela do Google foi fechada antes de terminar.',
    'auth/popup-blocked': 'O navegador bloqueou a janela do Google. Libere pop-ups e tente de novo.',
    'auth/network-request-failed': 'Sem conexão com a internet. Tente de novo.',
    'permission-denied': 'Sem permissão para isso. Confira as regras do Firebase.',
  };
  return m[e && e.code] || 'Algo deu errado. Tente de novo em instantes.';
}
