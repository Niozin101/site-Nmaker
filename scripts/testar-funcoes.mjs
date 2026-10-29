/* Testes das regras de pagamento (rodam no computador, sem chaves): npm run testar */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import catalogo from '../servidor/catalogo.json' with { type: 'json' };
import { calcularFrete } from '../servidor/frete.mjs';
import { validarEntrega, montarItens, calcularTotais, statusDoPagamento } from '../servidor/pedido.mjs';
import { paraFirestore, deFirestore, novoId } from '../servidor/google.mjs';

let ok = 0;
const teste = (nome, fn) => { fn(); ok++; console.log('✓', nome); };
const tabela = { gratisAcima: 200, porUF: { SP: 15 }, porRegiao: { Sudeste: 20, Sul: 25, 'Centro-Oeste': 28, Nordeste: 32, Norte: 38 } };
const entrega = { nome: 'Ana Souza', telefone: '(11) 98765-4321', cep: '01310-100', endereco: 'Av. Paulista', numero: '1000', bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'sp' };

teste('frete por estado, região e grátis', () => {
  assert.equal(calcularFrete('SP', 50, tabela), 15);
  assert.equal(calcularFrete('rj', 50, tabela), 20);
  assert.equal(calcularFrete('AM', 50, tabela), 38);
  assert.equal(calcularFrete('SP', 250, tabela), 0);
  assert.equal(calcularFrete('XX', 50, tabela), null);
});

teste('preço vem do catálogo, não do navegador', () => {
  const r = montarItens([{ chave: 'baby-trex', qtd: 2, preco: 0.01 }], catalogo);
  assert.equal(r.itens[0].preco, catalogo['baby-trex'].preco);
  assert.equal(r.itens[0].qtd, 2);
});

teste('variação usa o preço da variação', () => {
  const r = montarItens([{ chave: 'natal-trico#5', qtd: 1 }], catalogo);
  assert.equal(r.itens[0].preco, catalogo['natal-trico'].variantes[5].preco);
  assert.match(r.itens[0].nome, /\(Kit completo\)/);
});

teste('bloqueia produto inexistente, quantidade inválida e personalizado', () => {
  assert.ok(montarItens([{ chave: 'nao-existe', qtd: 1 }], catalogo).erro);
  assert.ok(montarItens([{ chave: 'baby-trex', qtd: 0 }], catalogo).erro);
  assert.ok(montarItens([{ chave: 'baby-trex', qtd: 1.5 }], catalogo).erro);
  assert.ok(montarItens([{ chave: 'baby-trex', qtd: 500 }], catalogo).erro);
  assert.ok(montarItens([{ chave: 'camiseta-bordada', qtd: 1 }], catalogo).erro);
  assert.ok(montarItens([{ chave: 'natal-trico#99', qtd: 1 }], catalogo).erro);
  assert.ok(montarItens([], catalogo).erro);
});

teste('valida o endereço no servidor', () => {
  assert.equal(validarEntrega(entrega).dados.uf, 'SP');
  assert.ok(validarEntrega({ ...entrega, nome: 'Ana' }).erro);
  assert.ok(validarEntrega({ ...entrega, cep: '123' }).erro);
  assert.ok(validarEntrega({ ...entrega, uf: 'XX' }).erro);
  assert.ok(validarEntrega({ ...entrega, telefone: '123' }).erro);
});

teste('totais com frete', () => {
  const { itens } = montarItens([{ chave: 'baby-trex', qtd: 2 }], catalogo);
  const t = calcularTotais(itens, 'SP', tabela);
  assert.equal(t.subtotal, Math.round(catalogo['baby-trex'].preco * 2 * 100) / 100);
  assert.equal(t.frete, 15);
  assert.equal(t.total, Math.round((t.subtotal + 15) * 100) / 100);
});

teste('status do pagamento', () => {
  assert.equal(statusDoPagamento('approved'), 'Pago');
  assert.equal(statusDoPagamento('pending'), null);
  assert.equal(statusDoPagamento('rejected'), null);
  assert.equal(statusDoPagamento('refunded'), 'Cancelado');
});

teste('conversão de dados do Firestore (ida e volta)', () => {
  const obj = { codigo: 'ABC123', total: 29.8, qtd: 2, pago: true, nada: null, itens: [{ nome: 'Hulk', preco: 149.9 }], mp: { status: 'approved' } };
  assert.deepEqual(deFirestore(paraFirestore(obj)), obj);
  assert.equal(paraFirestore(2).integerValue, '2');
  assert.equal(paraFirestore(2.5).doubleValue, 2.5);
  assert.match(novoId(), /^[A-Za-z0-9]{20}$/);
});

// assinatura do webhook (função do Cloudflare)
const { assinaturaValida } = await import('../functions/api/webhook-mercadopago.js');
{
  const segredo = 'segredo-teste', ts = '1700000000', reqId = 'abc-123', id = '123456';
  const v1 = createHmac('sha256', segredo).update(`id:${id};request-id:${reqId};ts:${ts};`).digest('hex');
  const req = h => ({ headers: new Map(Object.entries(h)) });
  assert.equal(await assinaturaValida(req({ 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': reqId }), id, segredo), true);
  assert.equal(await assinaturaValida(req({ 'x-signature': `ts=${ts},v1=${'0'.repeat(64)}`, 'x-request-id': reqId }), id, segredo), false);
  assert.equal(await assinaturaValida(req({}), id, segredo), false);
  ok++; console.log('✓ assinatura do aviso do Mercado Pago');
}

console.log(`\n${ok} testes passaram`);
