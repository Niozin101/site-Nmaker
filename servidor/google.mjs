/* =====================================================================
   Acesso do servidor ao Firebase SEM a biblioteca firebase-admin
   (que não roda no Cloudflare). Usa só padrões da web:
   - confere o login do cliente (token do Firebase Auth) com as chaves públicas do Google;
   - entra no Firestore com a conta de serviço (FIREBASE_SERVICE_ACCOUNT) pela API REST.
   A conta de serviço ignora as regras do Firestore: só o código do servidor usa isto.
   ===================================================================== */
import { createRemoteJWKSet, jwtVerify, SignJWT, importPKCS8 } from 'jose';

const CHAVES_LOGIN = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));

/** Lê a conta de serviço (JSON colado direto ou em base64). */
export function contaDeServico(bruto) {
  if (!bruto) throw new Error('FIREBASE_SERVICE_ACCOUNT não configurada');
  const texto = bruto.trim().startsWith('{') ? bruto : atob(bruto.trim());
  const sa = JSON.parse(texto);
  if (!sa.client_email || !sa.private_key || !sa.project_id) throw new Error('FIREBASE_SERVICE_ACCOUNT incompleta');
  return sa;
}

/** Confere o token de login enviado pelo site. Devolve { uid, email } ou lança erro. */
export async function verificarLogin(idToken, projetoId) {
  const { payload } = await jwtVerify(idToken, CHAVES_LOGIN, {
    issuer: `https://securetoken.google.com/${projetoId}`, audience: projetoId, algorithms: ['RS256'],
  });
  if (!payload.sub) throw new Error('token sem usuário');
  return { uid: payload.sub, email: payload.email || '' };
}

/* ---------- Token de acesso da conta de serviço (guardado ~50 min) ---------- */
let tokenCache = null;
async function tokenDeAcesso(sa) {
  if (tokenCache && tokenCache.email === sa.client_email && tokenCache.expira > Date.now()) return tokenCache.token;
  const agora = Math.floor(Date.now() / 1000);
  const chave = await importPKCS8(sa.private_key, 'RS256');
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/datastore' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email).setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(agora).setExpirationTime(agora + 3600).sign(chave);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error('Google recusou a conta de serviço: ' + (j.error_description || j.error || r.status));
  tokenCache = { email: sa.client_email, token: j.access_token, expira: Date.now() + 50 * 60 * 1000 };
  return j.access_token;
}

/* ---------- Conversão entre objetos JS e o formato do Firestore ---------- */
export function paraFirestore(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(paraFirestore) } };
  return { mapValue: { fields: campos(v) } };
}
const campos = obj => Object.fromEntries(Object.entries(obj).filter(([, x]) => x !== undefined).map(([k, x]) => [k, paraFirestore(x)]));

export function deFirestore(v) {
  if (!v) return null;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(deFirestore);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, deFirestore(x)]));
  return null;
}

// { 'mp.status': 'x', total: 1 } → { mp: { status: 'x' }, total: 1 }  (para gravar só alguns campos)
function aninhar(plano) {
  const obj = {};
  for (const [caminho, valor] of Object.entries(plano)) {
    const partes = caminho.split('.'); let alvo = obj;
    partes.slice(0, -1).forEach(p => { alvo = alvo[p] = alvo[p] || {}; });
    alvo[partes.at(-1)] = valor;
  }
  return obj;
}

/** Id aleatório de 20 caracteres, igual aos do Firestore. */
export function novoId() {
  const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const b = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(b, x => letras[x % letras.length]).join('');
}

/* ---------- Cliente do Firestore ---------- */
export const APAGAR = Symbol('apagar campo');
export const AGORA = Symbol('hora do servidor');

export function firestore(sa) {
  const base = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents`;
  const nome = caminho => `projects/${sa.project_id}/databases/(default)/documents/${caminho}`;
  const chamar = async (url, corpo, metodo = 'POST') => {
    const r = await fetch(url, {
      method: metodo,
      headers: { Authorization: `Bearer ${await tokenDeAcesso(sa)}`, 'Content-Type': 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(`Firestore ${r.status}: ${j.error?.message || ''}`); e.status = r.status; throw e; }
    return j;
  };

  // Monta uma escrita: campos normais + AGORA (hora do servidor) + APAGAR (remove o campo)
  function escrita(caminho, plano, { criar = false, mesclar = false, versao } = {}) {
    const normais = {}, agora = [], mascara = [];
    for (const [k, v] of Object.entries(plano)) {
      if (v === AGORA) agora.push(k);
      else { if (v !== APAGAR) normais[k] = v; mascara.push(k); }
    }
    const w = { update: { name: nome(caminho), fields: campos(aninhar(normais)) } };
    if (mesclar) w.updateMask = { fieldPaths: mascara.map(p => p.split('.').map(s => /^[A-Za-z_][A-Za-z_0-9]*$/.test(s) ? s : '`' + s + '`').join('.')) };
    if (agora.length) w.updateTransforms = agora.map(fieldPath => ({ fieldPath, setToServerValue: 'REQUEST_TIME' }));
    if (criar) w.currentDocument = { exists: false };
    else if (versao) w.currentDocument = { updateTime: versao };
    else if (mesclar) w.currentDocument = { exists: true };
    return w;
  }

  return {
    /** Lê um documento: { dados, versao } ou null se não existir. */
    async ler(caminho) {
      try {
        const d = await chamar(`${base}/${caminho}`, null, 'GET');
        return { dados: deFirestore({ mapValue: { fields: d.fields || {} } }), versao: d.updateTime };
      } catch (e) { if (e.status === 404) return null; throw e; }
    },
    /** Busca documentos de uma coleção com campo == valor (até "limite"). Devolve [{ id, dados }]. */
    async buscar(colecao, campo, valor, limite = 50) {
      const r = await chamar(`${base}:runQuery`, { structuredQuery: {
        from: [{ collectionId: colecao }],
        where: { fieldFilter: { field: { fieldPath: campo }, op: 'EQUAL', value: paraFirestore(valor) } },
        limit: limite,
      } });
      return r.filter(x => x.document).map(x => ({
        id: x.document.name.split('/').pop(),
        dados: deFirestore({ mapValue: { fields: x.document.fields || {} } }),
      }));
    },
    /** Cria um documento novo (falha se já existir). */
    criar: (caminho, plano) => chamar(`${base}:commit`, { writes: [escrita(caminho, plano, { criar: true })] }),
    /** Atualiza só os campos informados ("mp.status" atualiza dentro do mapa mp). versao = só grava se ninguém mexeu antes. */
    atualizar: (caminho, plano, versao) => chamar(`${base}:commit`, { writes: [escrita(caminho, plano, { mesclar: true, versao })] }),
  };
}
