/* =====================================================================
   NMAKER — configuração das contas (usada pelo site e pelo painel admin)
   Copie este arquivo para js/config.js e preencha. O config.js real não vai para o GitHub.
   ===================================================================== */

// CONTAS DE CLIENTE (login/cadastro). Cole aqui a configuração do seu projeto Firebase
// Vazio = área de conta desligada.
window.FIREBASE_CONFIG = {
  apiKey: 'COLE_A_CHAVE_AQUI',
  authDomain: 'nmaker-ba75d.firebaseapp.com',
  projectId: 'nmaker-ba75d',
  appId: '1:718730946416:web:1383f5f65e988bcd56d1b5',
};
// E-mails que acessam o painel da loja (admin.html). Repita-os em firestore.rules.
window.ADMIN_EMAILS = ['seu-email@exemplo.com'];

