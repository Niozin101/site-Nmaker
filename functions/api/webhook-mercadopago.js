/* =====================================================================
   POST /api/webhook-mercadopago   (Cloudflare Pages Functions)
   O Mercado Pago avisa aqui quando um pagamento muda. A função NÃO confia
   no aviso: consulta o pagamento direto na API do Mercado Pago (com a sua
   chave secreta) e só então atualiza o pedido.
   O próprio site também chama aqui (?origem=site) quando o cliente volta
   do checkout, como reforço caso o aviso do Mercado Pago atrase.
   Variáveis: MP_ACCESS_TOKEN, FIREBASE_SERVICE_ACCOUNT, MP_WEBHOOK_SECRET (opcional)
   ===================================================================== */
import { statusDoPagamento } from '../../servidor/pedido.mjs';
import { contaDeServico, firestore, APAGAR, AGORA } from '../../servidor/google.mjs';

const ok = (msg = 'ok') => new Response(msg, { status: 200 });

// Confere a assinatura do aviso (se a chave secreta do webhook estiver configurada)
export async function assinaturaValida(request, dataId, segredo) {
  if (!segredo) return true; // sem segredo: a segurança vem da consulta à API logo abaixo
  const partes = Object.fromEntries((request.headers.get('x-signature') || '').split(',').map(p => p.trim().split('=')));
  const requestId = request.headers.get('x-request-id') || '';
  if (!partes.ts || !partes.v1) return false;
  const manifesto = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${partes.ts};`;
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const assinatura = new Uint8Array(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(manifesto)));
  const esperado = Array.from(assinatura, b => b.toString(16).padStart(2, '0')).join('');
  if (esperado.length !== partes.v1.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ partes.v1.charCodeAt(i);
  return dif === 0;
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  let corpo = {};
  try { corpo = JSON.parse(await request.text() || '{}'); } catch { /* aviso sem corpo */ }
  const tipo = corpo.type || url.searchParams.get('type') || url.searchParams.get('topic');
  const pagamentoId = corpo?.data?.id || url.searchParams.get('data.id') || url.searchParams.get('id');
  if (tipo !== 'payment' || !pagamentoId || !/^\d+$/.test(String(pagamentoId))) return ok('ignorado');

  // Avisos do próprio site não têm assinatura; são seguros porque os dados usados
  // vêm da consulta à API do Mercado Pago logo abaixo, não do aviso
  const doSite = url.searchParams.get('origem') === 'site';
  if (!doSite && !(await assinaturaValida(request, url.searchParams.get('data.id') || pagamentoId, env.MP_WEBHOOK_SECRET))) {
    return new Response('assinatura inválida', { status: 401 });
  }

  // Busca o pagamento de verdade no Mercado Pago
  const r = await fetch(`https://api.mercadopago.com/v1/payments/${pagamentoId}`, {
    headers: { Authorization: `Bearer ${(env.MP_ACCESS_TOKEN || '').trim()}` },
  });
  if (r.status === 404) { console.log(`pagamento ${pagamentoId} não encontrado no Mercado Pago`); return ok('pagamento não encontrado'); }
  if (!r.ok) { console.error(`Mercado Pago respondeu ${r.status} ao consultar o pagamento ${pagamentoId}`); return new Response('erro ao consultar o Mercado Pago', { status: 502 }); } // o MP tenta de novo
  const pg = await r.json();
  if (!pg.external_reference || !/^[A-Za-z0-9]{10,40}$/.test(pg.external_reference)) { console.log(`pagamento ${pagamentoId} sem pedido ligado`); return ok('sem pedido'); }

  const db = firestore(contaDeServico(env.FIREBASE_SERVICE_ACCOUNT));
  const caminho = `pedidos/${pg.external_reference}`;
  // Grava só se ninguém mudou o pedido no meio do caminho (tenta de novo se mudou)
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const doc = await db.ler(caminho);
    if (!doc) return ok('pedido não encontrado');
    const pedido = doc.dados;
    const novo = statusDoPagamento(pg.status);
    // transaction_amount é só o valor dos produtos; o frete vem em shipping_amount.
    // total_paid_amount é o que o cliente pagou de fato (produtos + frete, sem juros do parcelamento)
    const valorPago = Math.max(pg.transaction_details?.total_paid_amount || 0, (pg.transaction_amount || 0) + (pg.shipping_amount || 0));
    const valorConfere = valorPago + 0.01 >= (pedido.total || 0);
    const atualizacao = {
      'mp.paymentId': String(pg.id), 'mp.status': pg.status, 'mp.detalhe': pg.status_detail || '',
      'mp.metodo': pg.payment_method_id || '', 'mp.tipo': pg.payment_type_id || '',
      'mp.parcelas': pg.installments || 1, 'mp.valorPago': valorPago,
      atualizadoEm: AGORA,
    };
    // Só vira "Pago" se ainda estava aguardando e o valor pago cobre o pedido
    if (novo === 'Pago' && pedido.status === 'Aguardando pagamento' && valorConfere) atualizacao.status = 'Pago';
    if (novo === 'Pago') atualizacao['mp.alerta'] = valorConfere ? APAGAR : 'Valor pago menor que o total do pedido';
    if (novo === 'Cancelado') atualizacao.status = 'Cancelado';
    try {
      await db.atualizar(caminho, atualizacao, doc.versao);
      // Registro para conferir no painel do Cloudflare (sem dados pessoais)
      console.log(`pedido ${pedido.codigo}: mp=${pg.status} pago=${valorPago} total=${pedido.total} antes=${pedido.status} depois=${atualizacao.status || pedido.status}${doSite ? ' (site)' : ''}`);
      return ok();
    } catch (e) {
      if (e.status !== 400 && e.status !== 409 && e.status !== 412) throw e; // 400/409/412 = alguém mudou o pedido: lê de novo
    }
  }
  return new Response('pedido ocupado, tente de novo', { status: 503 });
}

export const onRequest = () => new Response('Método não permitido', { status: 405 });
