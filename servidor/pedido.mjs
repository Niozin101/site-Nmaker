// Regras de negócio do pedido, sem dependências externas (fácil de testar)
import { calcularFrete } from './frete.mjs';

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const dig = v => String(v || '').replace(/\D/g, '');
const txt = (v, max) => String(v ?? '').trim().slice(0, max);

/** Confere o endereço (mesmas regras do site). Devolve { dados } ou { erro }. */
export function validarEntrega(e = {}) {
  const d = {
    nome: txt(e.nome, 100), telefone: txt(e.telefone, 20), cep: txt(e.cep, 10),
    endereco: txt(e.endereco, 150), numero: txt(e.numero, 10), complemento: txt(e.complemento, 80),
    bairro: txt(e.bairro, 80), cidade: txt(e.cidade, 80), uf: txt(e.uf, 2).toUpperCase(),
  };
  if (d.nome.split(/\s+/).length < 2) return { erro: 'Informe nome e sobrenome.' };
  const tel = dig(d.telefone);
  if (tel.length < 10 || tel.length > 11) return { erro: 'WhatsApp inválido.' };
  if (dig(d.cep).length !== 8) return { erro: 'CEP inválido.' };
  for (const [campo, rotulo] of [['endereco', 'a rua'], ['numero', 'o número'], ['bairro', 'o bairro'], ['cidade', 'a cidade']]) {
    if (d[campo].length < 1) return { erro: `Informe ${rotulo}.` };
  }
  if (!UFS.includes(d.uf)) return { erro: 'Estado (UF) inválido.' };
  return { dados: d };
}

/** Monta os itens com os preços do CATÁLOGO (nunca os enviados pelo navegador). */
export function montarItens(lista, catalogo) {
  if (!Array.isArray(lista) || lista.length < 1 || lista.length > 50) return { erro: 'Carrinho inválido.' };
  const itens = [];
  for (const it of lista) {
    const [id, vi] = String(it?.chave || '').split('#');
    const p = catalogo[id];
    const qtd = Number(it?.qtd);
    if (!p) return { erro: 'Um dos produtos não existe mais. Atualize a página.' };
    if (!Number.isInteger(qtd) || qtd < 1 || qtd > 99) return { erro: 'Quantidade inválida.' };
    if (p.personalizavel) return { erro: `"${p.nome}" é feito sob orçamento e não pode ser pago direto no site.` };
    let nome = p.nome, preco = p.preco;
    if (vi !== undefined) {
      const v = p.variantes[Number(vi)];
      if (!v) return { erro: 'Variação inválida. Atualize a página.' };
      nome = `${p.nome} (${v.nome})`; preco = v.preco;
    }
    if (!(preco > 0)) return { erro: `"${nome}" está sem preço definido.` };
    itens.push({ chave: vi !== undefined ? `${id}#${vi}` : id, nome, qtd, preco: Math.round(preco * 100) / 100 });
  }
  return { itens };
}

/** Subtotal, frete e total do pedido. */
export function calcularTotais(itens, uf, tabelaFrete) {
  const subtotal = Math.round(itens.reduce((s, i) => s + i.preco * i.qtd, 0) * 100) / 100;
  const frete = calcularFrete(uf, subtotal, tabelaFrete);
  if (frete === null) return { erro: 'Não entregamos para esse estado.' };
  return { subtotal, frete, total: Math.round((subtotal + frete) * 100) / 100 };
}

/** Status do pedido a partir do status do pagamento no Mercado Pago. */
export function statusDoPagamento(mpStatus) {
  if (mpStatus === 'approved') return 'Pago';
  if (mpStatus === 'refunded' || mpStatus === 'charged_back') return 'Cancelado';
  return null; // pendente, em análise, recusado...: continua "Aguardando pagamento"
}
