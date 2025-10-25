// 管理者画面用JavaScript

let storageRooms = [];

// ページ読み込み時の処理
document.addEventListener('DOMContentLoaded', async () => {
  // タブ切り替え
  setupTabs();

  // 倉庫データを読み込み
  await loadStorageRooms();

  // 倉庫チェックボックスを生成
  renderStorageCheckboxes();

  // イベントリスナー設定
  document.getElementById('uploadButton').addEventListener('click', handleCSVUpload);
  const orgCsvUploadButton = document.getElementById('orgCsvUploadButton');
  if (orgCsvUploadButton) {
    orgCsvUploadButton.addEventListener('click', handleOrgCsvUpload);
  }
  document.getElementById('addOrgForm').addEventListener('submit', handleAddOrganization);
  document.getElementById('cancelEditButton').addEventListener('click', resetOrgForm);
  document.getElementById('refreshCurrentButton').addEventListener('click', loadCurrentRentals);
  document.getElementById('refreshHistoryButton').addEventListener('click', loadHistory);

  // 初期データ読み込み
  loadOrganizations();
  loadCurrentRentals();
  loadHistory();
});

// 倉庫データを読み込み
async function loadStorageRooms() {
  try {
    const response = await fetch('/api/storage-rooms');
    storageRooms = await response.json();
  } catch (error) {
    console.error('倉庫データ読み込みエラー:', error);
  }
}

// 倉庫チェックボックスを生成
function renderStorageCheckboxes(selectedIds = []) {
  const container = document.getElementById('storageCheckboxes');
  container.innerHTML = '';

  if (!storageRooms.length) {
    container.innerHTML = '<p class="form-hint">利用可能な倉庫がまだ登録されていません</p>';
    return;
  }

  storageRooms.forEach(storage => {
    const label = document.createElement('label');
    label.className = 'storage-checkbox';
    const checked = selectedIds.includes(storage.storage_id) ? 'checked' : '';
    label.innerHTML = `
      <input type="checkbox" value="${storage.storage_id}" ${checked}>
      ${storage.storage_name}
    `;
    container.appendChild(label);
  });
}

// タブ切り替え設定
function setupTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-tab');

      // すべてのタブをリセット
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));

      // 選択されたタブをアクティブに
      button.classList.add('active');
      document.getElementById(targetTab).classList.add('active');
    });
  });
}

// CSVアップロード処理
async function handleCSVUpload() {
  const fileInput = document.getElementById('csvFileInput');
  const file = fileInput.files[0];
  const updateMode = document.getElementById('updateMode').checked;

  if (!file) {
    alert('CSVファイルを選択してください');
    return;
  }

  if (updateMode && !confirm('更新モードが有効です。既存の団体メンバーが削除され、新しいデータで上書きされます。\n続行しますか？')) {
    return;
  }

  const formData = new FormData();
  formData.append('csvFile', file);
  formData.append('updateMode', updateMode);

  try {
    const response = await fetch('/api/import-csv', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();
    const resultDiv = document.getElementById('uploadResult');

    if (response.ok) {
      resultDiv.className = 'upload-result success-message';
      resultDiv.textContent = data.message;
      fileInput.value = '';
      document.getElementById('updateMode').checked = false;
    } else {
      resultDiv.className = 'upload-result error-message';
      resultDiv.textContent = data.error || 'アップロードに失敗しました';
    }

    resultDiv.classList.remove('hidden');

    // 5秒後に非表示
    setTimeout(() => {
      resultDiv.classList.add('hidden');
    }, 5000);
  } catch (error) {
    console.error('エラー:', error);
    alert('サーバーとの通信に失敗しました');
  }
}

// 団体CSVアップロード処理
async function handleOrgCsvUpload() {
  const fileInput = document.getElementById('orgCsvFileInput');
  const file = fileInput.files[0];
  const resultDiv = document.getElementById('orgCsvUploadResult');

  if (!file) {
    alert('CSVファイルを選択してください');
    return;
  }

  const formData = new FormData();
  formData.append('csvFile', file);

  try {
    const response = await fetch('/api/organizations/import-csv', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (response.ok) {
      resultDiv.className = 'upload-result success-message';
      resultDiv.textContent = data.message || '団体を登録しました';
      fileInput.value = '';
      loadOrganizations();
    } else {
      resultDiv.className = 'upload-result error-message';
      resultDiv.textContent = data.error || '団体データの登録に失敗しました';
    }

    resultDiv.classList.remove('hidden');
    setTimeout(() => {
      resultDiv.classList.add('hidden');
    }, 5000);
  } catch (error) {
    console.error('団体CSVアップロードエラー:', error);
    alert('サーバーとの通信に失敗しました');
  }
}

// 団体追加・更新処理
async function handleAddOrganization(e) {
  e.preventDefault();

  const editingOrgId = document.getElementById('editingOrgId').value;
  const orgId = document.getElementById('orgId').value.trim();
  const orgName = document.getElementById('orgName').value.trim();
  const roomNumber = document.getElementById('roomNumber').value.trim();
  const canUsePracticeRooms = document.getElementById('canUsePracticeRooms').checked;

  // 選択された倉庫IDを取得
  const storageCheckboxes = document.querySelectorAll('#storageCheckboxes input[type="checkbox"]:checked');
  const storageIds = Array.from(storageCheckboxes).map(cb => parseInt(cb.value));

  if (!orgName) {
    alert('団体名は必須です');
    return;
  }

  try {
    let response;

    if (editingOrgId) {
      // 編集モード
      response = await fetch(`/api/organizations/${editingOrgId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ orgName, roomNumber, canUsePracticeRooms, storageIds })
      });
    } else {
      // 新規追加モード
      response = await fetch('/api/organizations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ orgName, roomNumber, canUsePracticeRooms, storageIds, orgId })
      });
    }

    const data = await response.json();

    if (response.ok) {
      alert(data.message);
      resetOrgForm();
      loadOrganizations();
    } else {
      alert(data.error || '処理に失敗しました');
    }
  } catch (error) {
    console.error('エラー:', error);
    alert('サーバーとの通信に失敗しました');
  }
}

// フォームをリセット
function resetOrgForm() {
  document.getElementById('addOrgForm').reset();
  document.getElementById('editingOrgId').value = '';
  document.getElementById('orgId').disabled = false;
  document.getElementById('orgFormTitle').textContent = '新しい団体を登録';
  document.getElementById('submitOrgButton').textContent = '団体を追加';
  document.getElementById('cancelEditButton').classList.add('hidden');
  renderStorageCheckboxes([]);
}

// 団体を編集モードに設定
function editOrg(org) {
  document.getElementById('editingOrgId').value = org.org_id;
  document.getElementById('orgId').value = org.org_id;
  document.getElementById('orgId').disabled = true;
  document.getElementById('orgName').value = org.org_name;
  document.getElementById('roomNumber').value = org.room_number || '';
  document.getElementById('canUsePracticeRooms').checked = org.can_use_practice_rooms == 1;

  // 既存の倉庫割り当てを表示
  const orgStorageIds = org.storage_ids ? JSON.parse(org.storage_ids) : [];
  renderStorageCheckboxes(orgStorageIds);

  document.getElementById('orgFormTitle').textContent = '団体を編集';
  document.getElementById('submitOrgButton').textContent = '更新';
  document.getElementById('cancelEditButton').classList.remove('hidden');

  // フォームまでスクロール
  document.getElementById('addOrgForm').scrollIntoView({ behavior: 'smooth' });
}

// 団体一覧を読み込み
async function loadOrganizations() {
  try {
    const response = await fetch('/api/organizations');
    const organizations = await response.json();

    const orgList = document.getElementById('orgList');

    if (organizations.length === 0) {
      orgList.innerHTML = '<p class="loading">登録されている団体はありません</p>';
      return;
    }

    orgList.innerHTML = organizations.map(org => `
      <div class="org-item">
        <div class="org-details">
          <span class="org-id">ID: ${org.org_id}</span>
          <strong>${org.org_name}</strong>
          <span>部屋: ${org.room_number || 'なし'}</span>
          <span>練習場利用: ${org.can_use_practice_rooms ? '可' : '不可'}</span>
        </div>
        <div class="org-actions">
          <button class="btn btn-secondary" onclick='editOrg(${JSON.stringify(org)})'>編集</button>
          <button class="btn btn-danger" onclick="deleteOrg(${org.org_id}, '${org.org_name}')">削除</button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('エラー:', error);
    document.getElementById('orgList').innerHTML = '<p class="error-message">データの読み込みに失敗しました</p>';
  }
}

// 現在貸出中の鍵を読み込み
async function loadCurrentRentals() {
  try {
    const response = await fetch('/api/rentals/current');
    const rentals = await response.json();

    const tableDiv = document.getElementById('currentRentalsTable');

    if (rentals.length === 0) {
      tableDiv.innerHTML = '<p class="loading">現在貸出中の鍵はありません</p>';
      return;
    }

    const rows = [];
    for (const rental of rentals) {
      let location = '';
      if (rental.rental_type === 'room') {
        location = `部室: ${rental.room_number}`;
      } else if (rental.rental_type === 'practice') {
        location = `練習場: ${rental.practice_room_name}`;
      } else if (rental.rental_type === 'storage_only') {
        location = '倉庫のみ';
      } else {
        location = rental.practice_room_name ? `練習場: ${rental.practice_room_name}` : '貸出中';
      }

      // 個別アイテムを取得
      const itemsResponse = await fetch(`/api/rental-items/${rental.log_id}`);
      const items = await itemsResponse.json();

      // 個別返却ボタンを生成
      let itemButtons = `<button class="btn btn-success btn-small" onclick="handleReturn(${rental.log_id})">全て返却</button><br>`;
      if (items.length > 0) {
        for (const item of items) {
          const itemName = item.item_type === 'practice_room'
            ? item.practice_room_name
            : item.storage_name;
          itemButtons += `
            <button class="btn btn-secondary btn-small" style="margin-top: 5px;" onclick="handleReturnItem(${item.item_id}, '${itemName}')">
              ${itemName}返却
            </button>
          `;
        }
      }

      rows.push(`
        <tr>
          <td>${rental.student_id}</td>
          <td>${rental.name}</td>
          <td>${rental.org_name}</td>
          <td>${location}</td>
          <td>${items.filter(i => i.item_type === 'storage').map(i => i.storage_name).join(', ') || 'なし'}</td>
          <td>${new Date(rental.borrowed_at).toLocaleString('ja-JP')}</td>
          <td>${itemButtons}</td>
        </tr>
      `);
    }

    tableDiv.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>学籍番号</th>
            <th>氏名</th>
            <th>団体</th>
            <th>場所</th>
            <th>倉庫</th>
            <th>貸出時刻</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${rows.join('')}
        </tbody>
      </table>
    `;
  } catch (error) {
    console.error('エラー:', error);
    document.getElementById('currentRentalsTable').innerHTML = '<p class="error-message">データの読み込みに失敗しました</p>';
  }
}

// 貸出履歴を読み込み
async function loadHistory() {
  try {
    const response = await fetch('/api/rentals/history?limit=100');
    const history = await response.json();

    const tableDiv = document.getElementById('historyTable');

    if (history.length === 0) {
      tableDiv.innerHTML = '<p class="loading">履歴がありません</p>';
      return;
    }

    tableDiv.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>学籍番号</th>
            <th>氏名</th>
            <th>団体</th>
            <th>場所</th>
            <th>倉庫</th>
            <th>貸出時刻</th>
            <th>返却時刻</th>
            <th>状態</th>
          </tr>
        </thead>
        <tbody>
          ${history.map(record => {
            let location = '';
            if (record.rental_type === 'room') {
              location = `部室: ${record.room_number}`;
            } else if (record.rental_type === 'practice') {
              location = `練習場: ${record.practice_room_name}`;
            } else if (record.rental_type === 'storage_only') {
              location = '倉庫のみ';
            } else {
              location = record.practice_room_name ? `練習場: ${record.practice_room_name}` : '貸出';
            }
            const storages = record.storage_ids
              ? JSON.parse(record.storage_ids).join(', ')
              : 'なし';
            return `
            <tr>
              <td>${record.student_id}</td>
              <td>${record.name}</td>
              <td>${record.org_name}</td>
              <td>${location}</td>
              <td>${storages}</td>
              <td>${new Date(record.borrowed_at).toLocaleString('ja-JP')}</td>
              <td>${record.returned_at ? new Date(record.returned_at).toLocaleString('ja-JP') : '-'}</td>
              <td>${record.status}</td>
            </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  } catch (error) {
    console.error('エラー:', error);
    document.getElementById('historyTable').innerHTML = '<p class="error-message">データの読み込みに失敗しました</p>';
  }
}

// 団体削除処理
async function deleteOrg(orgId, orgName) {
  if (!confirm(`本当に「${orgName}」を削除しますか?\nこの操作は取り消せません。`)) {
    return;
  }

  try {
    const response = await fetch(`/api/organizations/${orgId}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (response.ok) {
      alert('団体を削除しました');
      loadOrganizations();
    } else {
      alert(data.error || '団体の削除に失敗しました');
    }
  } catch (error) {
    console.error('エラー:', error);
    alert('サーバーとの通信に失敗しました');
  }
}

// 鍵返却処理（全体）
async function handleReturn(logId) {
  if (!confirm('全ての鍵を返却しますか?')) {
    return;
  }

  try {
    const response = await fetch(`/api/return/${logId}`, {
      method: 'POST'
    });

    const data = await response.json();

    if (response.ok) {
      alert('鍵を返却しました');
      loadCurrentRentals();
      loadHistory();
    } else {
      alert(data.error || '返却に失敗しました');
    }
  } catch (error) {
    console.error('エラー:', error);
    alert('サーバーとの通信に失敗しました');
  }
}

// 個別アイテム返却処理
async function handleReturnItem(itemId, itemName) {
  if (!confirm(`${itemName}を返却しますか?`)) {
    return;
  }

  try {
    const response = await fetch(`/api/return-item/${itemId}`, {
      method: 'POST'
    });

    const data = await response.json();

    if (response.ok) {
      alert(`${itemName}を返却しました`);
      loadCurrentRentals();
      loadHistory();
    } else {
      alert(data.error || '返却に失敗しました');
    }
  } catch (error) {
    console.error('エラー:', error);
    alert('サーバーとの通信に失敗しました');
  }
}
