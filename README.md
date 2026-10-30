# NMAKER — camisetas, laser e impressão 3D personalizados

Loja virtual da **NMAKER**, que vende camisetas bordadas, peças com corte e gravação a laser e impressão 3D: presentes, lembrancinhas, brindes, colecionáveis e encomendas sob medida, com envio para todo o Brasil.

**No ar:** https://nmaker.com.br

## O que o site faz

- **Catálogo com carrinho**, busca e categorias, incluindo uma seção de fanarts impressas em 3D.
- **Pagamento online pelo Mercado Pago** (Pix, cartão e boleto). O preço e o frete são recalculados no servidor, então o navegador nunca decide o valor cobrado.
- **Confirmação automática do pagamento.** O Mercado Pago avisa o site por webhook, e a função não confia no aviso: consulta o pagamento direto na API antes de marcar o pedido como pago.
- **Frete por região**, calculado pela UF e pelo valor da compra, com a mesma regra no carrinho e no servidor.
- **Contas de cliente** com Firebase: cadastro, login, histórico de pedidos e favoritos.
- **Chat da loja.** O cliente conversa com a NMAKER sem sair do site, e a loja responde pelo painel.
- **Painel da loja** (`admin.html`): pedidos, mudança de status e conversas. Só e-mails autorizados entram, e a segurança de verdade fica nas regras do Firestore.

## Como é feito

- **HTML, CSS e JavaScript puros**, sem framework.
- **Cloudflare Pages** para hospedar e **Pages Functions** (`functions/api/`) para criar o pagamento e receber o webhook.
- **Firebase** (Auth + Firestore) para contas, pedidos, favoritos e chat, protegido por `firestore.rules`.
- **Regras de negócio separadas** em `servidor/` (pedido, frete e acesso ao Google), sem dependências externas, para poderem ser testadas no computador.
- **Scripts em Node e Python** (`scripts/`) que geram o catálogo usado pelo servidor e os produtos de fanart a partir das fotos.

## Estrutura

```
site/               o site (index.html, admin.html, js/, imagens/, dados/)
functions/api/      Cloudflare Pages Functions (criar-pagamento, webhook-mercadopago)
servidor/           regras do pedido, frete, catálogo e acesso ao Firebase
scripts/            gerar catálogo e fanarts, testes e publicação
firestore.rules     regras de segurança do Firestore
wrangler.toml       configuração do Cloudflare Pages
```

## Rodar, testar e publicar

```bash
npm install

# testar as regras de pagamento (não precisa de chaves)
npm run testar

# gerar o catálogo do servidor a partir do site
npm run build

# publicar no Cloudflare Pages
npx wrangler pages deploy site
```

As chaves do Mercado Pago (`MP_ACCESS_TOKEN`) e a conta de serviço do Firebase (`FIREBASE_SERVICE_ACCOUNT`) ficam só nas variáveis secretas do Cloudflare, nunca no código.
