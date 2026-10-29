/* =====================================================================
   POST /api/criar-pagamento   (Cloudflare Pages Functions)
   1. Confere quem é o cliente (login do Firebase)
   2. Recalcula preços e frete no servidor (o navegador não decide o valor)
   3. Salva o pedido como "Aguardando pagamento"
   4. Cria o pagamento no Mercado Pago e devolve o link do checkout
   Variáveis (Cloudflare → Settings → Variables and Secrets):
     MP_ACCESS_TOKEN, FIREBASE_SERVICE_ACCOUNT  (secretas)   MP_MODO_TESTE = sim (opcional)
   ===================================================================== */
import catalogo from '../../servidor/catalogo.json';
import { validarEntrega, montarItens, calcularTotais } from '../../servidor/pedido.mjs';
import { contaDeServico, verificarLogin, firestore, novoId, AGORA } from '../../servidor/google.mjs';

const resposta = (status, corpo) => new Response(JSON.stringify(corpo), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export async function onRequestPost({ request, env }) {
  const tokenMP = (env.MP_ACCESS_TOKEN || '').trim();
  if (!tokenMP) return resposta(503, { erro: 'Pagamento online ainda não configurado.' });
  // Token colado errado (ex.: os pontinhos "•••" da tela, em vez do texto do token)
  if (!/^[\x21-\x7e]+$/.test(tokenMP)) {
    console.error('MP_ACCESS_TOKEN inválido: tem caracteres que não fazem parte de um token');
    return resposta(503, { erro: 'Pagamento online temporariamente indisponível.' });
  }
  let sa;
  try { sa = contaDeServico(env.FIREBASE_SERVICE_ACCOUNT); }
  catch (e) { console.error(e.message); return resposta(503, { erro: 'Pagamento online temporariamente indisponível.' }); }

  // ---- corpo da requisição (limitado) ----
  const bruto = await request.text();
  if (bruto.length > 20000) return resposta(413, { erro: 'Pedido grande demais.' });
  let dados;
  try { dados = JSON.parse(bruto); } catch { return resposta(400, { erro: 'Dados inválidos.' }); }

  // ---- quem está comprando ----
  const idToken = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  let usuario;
  try { usuario = await verificarLogin(idToken, sa.project_id); }
  catch { return resposta(401, { erro: 'Entre na sua conta para pagar.' }); }

  // ---- itens, entrega e valores (tudo conferido aqui) ----
  const entrega = validarEntrega(dados.entrega);
  if (entrega.erro) return resposta(400, { erro: entrega.erro });
  const montagem = montarItens(dados.itens, catalogo);
  if (montagem.erro) return resposta(400, { erro: montagem.erro });
  const totais = calcularTotais(montagem.itens, entrega.dados.uf);
  if (totais.erro) return resposta(400, { erro: totais.erro });

  const e = entrega.dados;
  const enderecoTexto = [`${e.endereco}, ${e.numero}`, e.complemento, e.bairro, `${e.cidade}/${e.uf}`].filter(Boolean).join(' - ');

  const db = firestore(sa);

  // ---- proteção contra abuso: no máximo 5 pedidos aguardando pagamento por cliente na última hora ----
  try {
    const umaHora = Date.now() - 60 * 60 * 1000;
    const recentes = (await db.buscar('pedidos', 'uid', usuario.uid, 100))
      .filter(p => p.dados.status === 'Aguardando pagamento' && Date.parse(p.dados.criadoEm || 0) > umaHora);
    if (recentes.length >= 5) {
      return resposta(429, { erro: 'Você já abriu vários pagamentos agora há pouco. Conclua um deles ou tente de novo daqui a uma hora.' });
    }
  } catch (e) { console.warn('limite de pedidos não conferido', e.message); }

  // ---- salva o pedido ----
  const id = novoId();
  const codigo = id.slice(-6).toUpperCase();
  await db.criar(`pedidos/${id}`, {
    uid: usuario.uid, codigo, forma: 'Mercado Pago', status: 'Aguardando pagamento',
    itens: montagem.itens.map(({ nome, qtd, preco }) => ({ nome, qtd, preco })),
    subtotal: totais.subtotal, frete: totais.frete, total: totais.total,
    cliente: { nome: e.nome, email: usuario.email || '', telefone: e.telefone, cep: e.cep, endereco: enderecoTexto },
    mp: { status: 'criado' },
    criadoEm: AGORA,
  });

  // ---- cria o checkout no Mercado Pago ----
  const site = (env.SITE_URL || new URL(request.url).origin).replace(/\/$/, '');
  const volta = s => `${site}/?pagamento=${s}&pedido=${codigo}`;
  const preferencia = {
    items: montagem.itens.map(i => ({ id: i.chave, title: i.nome.slice(0, 250), quantity: i.qtd, unit_price: i.preco, currency_id: 'BRL' })),
    shipments: { mode: 'not_specified', cost: totais.frete },
    payer: { name: e.nome, email: usuario.email || undefined },
    external_reference: id,
    statement_descriptor: 'NMAKER',
    back_urls: { success: volta('aprovado'), pending: volta('pendente'), failure: volta('falhou') },
    auto_return: 'approved',
    notification_url: `${site}/api/webhook-mercadopago`,
    payment_methods: { installments: 12 },
  };
  const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenMP}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': id },
    body: JSON.stringify(preferencia),
  });
  const mp = await r.json().catch(() => ({}));
  if (!r.ok || !mp.init_point) {
    console.error('Mercado Pago recusou a criação do pagamento', r.status, JSON.stringify(mp).slice(0, 500));
    await db.atualizar(`pedidos/${id}`, { status: 'Cancelado', 'mp.status': 'erro_ao_criar' }).catch(() => {});
    return resposta(502, { erro: 'Não foi possível abrir o pagamento agora. Tente de novo em instantes.' });
  }
  await db.atualizar(`pedidos/${id}`, { 'mp.preferenceId': mp.id, 'mp.status': 'aguardando' });

  // Credenciais de teste usam o checkout de testes (MP_MODO_TESTE=sim liga o modo teste)
  const teste = tokenMP.startsWith('TEST-') || /^(sim|1|true)$/i.test(env.MP_MODO_TESTE || '');
  const url = teste && mp.sandbox_init_point ? mp.sandbox_init_point : mp.init_point;
  return resposta(200, { url, codigo, total: totais.total });
}

export const onRequest = () => resposta(405, { erro: 'Método não permitido.' });
