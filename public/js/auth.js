// 簡易認証システム
const AUTH_KEY = 'key_rental_auth';
const CORRECT_PASSWORD = 'keio2024'; // パスワードを設定（必要に応じて変更してください）

// 認証状態をチェック
function checkAuth() {
  const isAuthenticated = sessionStorage.getItem(AUTH_KEY);
  if (!isAuthenticated) {
    showPasswordPrompt();
    return false;
  }
  return true;
}

// パスワード入力プロンプトを表示
function showPasswordPrompt() {
  const password = prompt('このページにアクセスするにはパスワードを入力してください:');

  if (password === null) {
    // キャンセルされた場合、ユーザー画面にリダイレクト
    window.location.href = '/';
    return;
  }

  if (password === CORRECT_PASSWORD) {
    sessionStorage.setItem(AUTH_KEY, 'true');
    // 認証成功、ページを再読み込み
    window.location.reload();
  } else {
    alert('パスワードが正しくありません');
    window.location.href = '/';
  }
}

// ログアウト機能
function logout() {
  sessionStorage.removeItem(AUTH_KEY);
  window.location.href = '/';
}

// ページロード時に認証チェック
document.addEventListener('DOMContentLoaded', () => {
  if (!checkAuth()) {
    // 認証されていない場合、ページの内容を隠す
    document.body.style.display = 'none';
  }
});
