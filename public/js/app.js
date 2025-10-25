// ユーザー画面用JavaScript

let currentStudent = null;
let selectedOrg = null;
let rentalType = null; // 'room' または 'practice'
let selectedRoom = null;
let selectedPracticeRoom = null;
let selectedStorages = [];
let selectedStorageNames = [];
let practiceRooms = [];
let storageRooms = [];
let resourceUsage = {
  rooms: [],
  practiceRoomIds: [],
  storageIds: []
};
let currentStudentRentals = [];
let rentalItemsCache = new Map();

// ページ読み込み時の処理
document.addEventListener('DOMContentLoaded', async () => {
  // バーコード入力フィールドにフォーカス
  document.getElementById('barcodeInput').focus();

  // イベントリスナー設定
  document.getElementById('barcodeInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleBarcodeScan();
    }
  });

  document.getElementById('scanButton').addEventListener('click', handleBarcodeScan);
  document.getElementById('confirmButton').addEventListener('click', handleConfirmBorrow);
  document.getElementById('cancelButton').addEventListener('click', resetToScan);
  document.getElementById('newScanButton').addEventListener('click', resetToScan);

  // 初期データ読み込み
  await loadPracticeRooms();
  await loadStorageRooms();
  await loadCurrentRentals();
});

// 練習場一覧を取得
async function loadPracticeRooms() {
  try {
    const response = await fetch('/api/practice-rooms');
    practiceRooms = await response.json();
  } catch (error) {
    console.error('練習場取得エラー:', error);
  }
}

// 倉庫一覧を取得
async function loadStorageRooms() {
  try {
    const response = await fetch('/api/storage-rooms');
    storageRooms = await response.json();
  } catch (error) {
    console.error('倉庫取得エラー:', error);
  }
}

// 現在の貸出状況を取得
async function loadResourceUsage() {
  try {
    const response = await fetch('/api/rentals/usage');
    if (!response.ok) {
      throw new Error('リソース情報の取得に失敗しました');
    }
    resourceUsage = await response.json();
  } catch (error) {
    console.error('リソース状況取得エラー:', error);
    resourceUsage = {
      rooms: [],
      practiceRoomIds: [],
      storageIds: []
    };
  } finally {
    updateSelectionAvailability();
  }
}

function getOrgStorageIds(org) {
  if (!org || !org.storage_ids) {
    return [];
  }
  try {
    const ids = JSON.parse(org.storage_ids);
    return Array.isArray(ids) ? ids : [];
  } catch (error) {
    console.error('倉庫IDの解析に失敗しました:', error);
    return [];
  }
}

function updateSelectionAvailability() {
  if (!selectedOrg) {
    return;
  }

  const resultSection = document.getElementById('resultSection');
  if (resultSection && !resultSection.classList.contains('hidden')) {
    return;
  }

  renderRentalTypeSelection();

  const practiceSection = document.getElementById('practiceRoomSelection');
  if (!practiceSection.classList.contains('hidden') && rentalType === 'practice') {
    showPracticeRoomSelection();
  }

  const storageSection = document.getElementById('storageSelection');
  if (
    !storageSection.classList.contains('hidden') &&
    (rentalType === 'room' || rentalType === 'storage_only')
  ) {
    showStorageSelection();
  }
}

// バーコードスキャン処理
async function handleBarcodeScan() {
  const studentId = document.getElementById('barcodeInput').value.trim();

  if (!studentId) {
    alert('学籍番号を入力してください');
    return;
  }

  try {
    const response = await fetch(`/api/student/${studentId}`);
    const data = await response.json();

    if (!response.ok) {
      alert(data.error || '学生情報の取得に失敗しました');
      return;
    }

    currentStudent = {
      studentId: studentId,
      name: data[0].name,
      organizations: data
    };

    selectedOrg = null;
    rentalType = null;
    selectedRoom = null;
    selectedPracticeRoom = null;
    selectedStorages = [];
    selectedStorageNames = [];
    currentStudentRentals = [];
    rentalItemsCache = new Map();
    renderStudentRentals();
    updateOrganizationSummary();

    document.getElementById('rentalTypeSelection').classList.add('hidden');
    document.getElementById('practiceRoomSelection').classList.add('hidden');
    document.getElementById('storageSelection').classList.add('hidden');
    document.getElementById('confirmSection').classList.add('hidden');
    document.getElementById('resultSection').classList.add('hidden');

    await loadCurrentRentals();
    displayStudentInfo();
    displayOrganizationSelection();
  } catch (error) {
    console.error('エラー:', error);
    alert('サーバーとの通信に失敗しました');
  }
}

// 学生情報を表示
function displayStudentInfo() {
  document.getElementById('displayStudentId').textContent = currentStudent.studentId;
  document.getElementById('displayName').textContent = currentStudent.name;

  updateOrganizationSummary();

  document.getElementById('studentInfo').classList.remove('hidden');
}

function updateOrganizationSummary() {
  if (!currentStudent) {
    document.getElementById('organizationList').innerHTML = '';
    return;
  }

  const orgList = document.getElementById('organizationList');
  const rentalInfoByOrg = new Map();
  currentStudentRentals.forEach((rental) => {
    const summary = [];
    if (rental.rental_type === 'room' && rental.room_number) {
      summary.push(`部室 ${rental.room_number}`);
    }
    if (rental.rental_type === 'practice' && rental.practice_room_name) {
      summary.push(`練習場 ${rental.practice_room_name}`);
    }
    if (rental.storage_ids) {
      try {
        const ids = JSON.parse(rental.storage_ids);
        if (Array.isArray(ids) && ids.length > 0) {
          const names = storageRooms
            .filter((storage) => ids.includes(storage.storage_id))
            .map((storage) => storage.storage_name);
          if (names.length > 0) {
            summary.push(`倉庫 ${names.join(', ')}`);
          }
        }
      } catch (error) {
        console.error('storage_idsの解析に失敗しました:', error);
      }
    }
    const summaryText = summary.join(' / ') || '貸出中';
    const existing = rentalInfoByOrg.get(rental.org_id);
    rentalInfoByOrg.set(rental.org_id, existing ? `${existing}, ${summaryText}` : summaryText);
  });

  orgList.innerHTML = currentStudent.organizations
    .map(org => {
      const info = rentalInfoByOrg.get(org.org_id);
      return `
        <div class="org-summary">
          <span>${org.org_name} (${org.role})</span>
          ${info ? `<span class="org-rental-info">貸出中: ${info}</span>` : ''}
        </div>
      `;
    })
    .join('');
}

// 団体選択を表示
function displayOrganizationSelection() {
  const orgButtons = document.getElementById('orgButtons');
  orgButtons.innerHTML = '';

  currentStudent.organizations.forEach(org => {
    const button = document.createElement('button');
    button.className = 'org-button';
    button.innerHTML = `
      <div class="org-name">${org.org_name}</div>
      <div class="org-info">部室: ${org.room_number || 'なし'}</div>
      <div class="org-info">練習場利用: ${org.can_use_practice_rooms ? '可' : '不可'}</div>
    `;
    button.addEventListener('click', () => selectOrganization(org));
    orgButtons.appendChild(button);
  });

  document.getElementById('orgSelection').classList.remove('hidden');
}

// 学生の現在貸出中の鍵を表示
function renderStudentRentals() {
  const section = document.getElementById('studentRentalsSection');
  const list = document.getElementById('studentRentalsList');
  if (!section || !list) {
    return;
  }

  if (!currentStudent || currentStudentRentals.length === 0) {
    list.innerHTML = '<p class="loading">現在借りている鍵はありません</p>';
    section.classList.add('hidden');
    updateOrganizationSummary();
    return;
  }

  const cards = currentStudentRentals.map(rental => {
    const isSelectedOrg = selectedOrg && rental.org_id === selectedOrg.org_id;
    const items = rentalItemsCache.get(rental.log_id) || [];

    const practiceItem = items.find(item => item.item_type === 'practice_room');
    const practiceName = practiceItem ? practiceItem.practice_room_name : rental.practice_room_name;

    let location = '';
    if (rental.rental_type === 'room') {
      location = `部室: ${rental.room_number}`;
    } else if (rental.rental_type === 'practice') {
      location = `練習場: ${practiceName || '選択済み'}`;
    } else if (rental.rental_type === 'storage_only') {
      location = '倉庫のみ';
    } else {
      location = practiceName ? `練習場: ${practiceName}` : '貸出';
    }

    const storageNames = items
      .filter(item => item.item_type === 'storage')
      .map(item => item.storage_name)
      .join(', ');

    const itemButtonHtml = items.length > 0
      ? `
        <div class="item-buttons">
          ${items.map(item => {
            const itemName = item.item_type === 'practice_room'
              ? item.practice_room_name
              : item.storage_name;
            const displayName = itemName || (item.item_type === 'storage' ? '倉庫' : 'アイテム');
            const safeName = displayName.replace(/'/g, "\\'");
            const label = displayName;
            return `
              <button class="btn btn-secondary btn-small" onclick="handleReturnItem(${item.item_id}, '${safeName}')">
                ${label}返却
              </button>
            `;
          }).join('')}
        </div>
      `
      : '';

    return `
      <div class="rental-item student-rental-item ${isSelectedOrg ? 'highlight' : ''}">
        <div class="rental-info">
          <strong>${rental.org_name}</strong><br>
          ${location}${storageNames ? `<br>倉庫: ${storageNames}` : ''}<br>
          貸出時刻: ${new Date(rental.borrowed_at).toLocaleString('ja-JP')}
        </div>
        <div class="rental-actions">
          <button class="btn btn-success btn-small" onclick="handleReturn(${rental.log_id})">全て返却</button>
          ${itemButtonHtml}
        </div>
      </div>
    `;
  });

  list.innerHTML = cards.join('');
  section.classList.remove('hidden');
  updateOrganizationSummary();
}

// 団体選択
async function selectOrganization(org) {
  selectedOrg = org;
  rentalType = null;
  selectedRoom = null;
  selectedPracticeRoom = null;
  selectedStorages = [];
  selectedStorageNames = [];

  // 既存の選択セクションを一旦非表示にする
  const rentalTypeSection = document.getElementById('rentalTypeSelection');
  rentalTypeSection.classList.add('hidden');
  rentalTypeSection.innerHTML = '';
  document.getElementById('practiceRoomSelection').classList.add('hidden');
  document.getElementById('storageSelection').classList.add('hidden');
  document.getElementById('confirmSection').classList.add('hidden');
  document.getElementById('resultSection').classList.add('hidden');

  await loadResourceUsage();
  renderStudentRentals();

  document.getElementById('rentalTypeSelection').scrollIntoView({ behavior: 'smooth' });
}

function renderRentalTypeSelection() {
  const rentalTypeSection = document.getElementById('rentalTypeSelection');

  if (!selectedOrg) {
    rentalTypeSection.classList.add('hidden');
    rentalTypeSection.innerHTML = '';
    return;
  }

  rentalTypeSection.innerHTML = '<h2>貸出タイプを選択</h2>';

  const typeButtons = document.createElement('div');
  typeButtons.className = 'type-buttons';

  // 部室があれば部室ボタンを表示
  if (selectedOrg.room_number) {
    const roomBtn = document.createElement('button');
    roomBtn.className = 'type-button';
    roomBtn.dataset.type = 'room';
    const roomInUse = resourceUsage.rooms.includes(selectedOrg.room_number);
    roomBtn.innerHTML = `
      <h3>部室</h3>
      <p>${selectedOrg.room_number}</p>
      ${roomInUse ? '<p class="status-badge">貸出中</p>' : ''}
    `;
    if (roomInUse) {
      roomBtn.classList.add('disabled');
      roomBtn.disabled = true;
    } else {
      roomBtn.addEventListener('click', () => selectRentalType('room'));
    }
    typeButtons.appendChild(roomBtn);
  }

  // 練習場利用可能なら練習場ボタンを表示
  if (selectedOrg.can_use_practice_rooms) {
    const practiceBtn = document.createElement('button');
    practiceBtn.className = 'type-button';
    practiceBtn.dataset.type = 'practice';
    practiceBtn.innerHTML = `
      <h3>練習場</h3>
      <p>利用可能な練習場から選択</p>
    `;
    practiceBtn.addEventListener('click', () => selectRentalType('practice'));
    typeButtons.appendChild(practiceBtn);
  }

  // 倉庫のみ貸出ボタン（倉庫が割り当てられている場合のみ）
  const orgStorageIds = getOrgStorageIds(selectedOrg);
  if (orgStorageIds.length > 0) {
    const storageOnlyBtn = document.createElement('button');
    storageOnlyBtn.className = 'type-button';
    storageOnlyBtn.dataset.type = 'storage_only';
    const availableCount = orgStorageIds.filter((id) => !resourceUsage.storageIds.includes(id)).length;
    const storageUnavailable = availableCount === 0;
    storageOnlyBtn.innerHTML = `
      <h3>倉庫のみ</h3>
      <p>${storageUnavailable ? '利用できる倉庫はありません' : '倉庫だけを借りる'}</p>
      ${storageUnavailable ? '<p class="status-badge">貸出中</p>' : ''}
    `;
    if (storageUnavailable) {
      storageOnlyBtn.classList.add('disabled');
      storageOnlyBtn.disabled = true;
    } else {
      storageOnlyBtn.addEventListener('click', () => selectRentalType('storage_only'));
    }
    typeButtons.appendChild(storageOnlyBtn);
  }

  typeButtons.querySelectorAll('.type-button').forEach(button => {
    button.classList.remove('active');
    if (button.dataset.type === rentalType && !button.disabled) {
      button.classList.add('active');
    }
  });

  rentalTypeSection.appendChild(typeButtons);
  rentalTypeSection.classList.remove('hidden');
}

// 貸出タイプ選択
function selectRentalType(type) {
  if (!selectedOrg) {
    return;
  }

  rentalType = type;
  selectedRoom = null;
  selectedPracticeRoom = null;
  selectedStorages = [];
  selectedStorageNames = [];

  const practiceSection = document.getElementById('practiceRoomSelection');
  const storageSection = document.getElementById('storageSelection');
  const confirmSection = document.getElementById('confirmSection');

  practiceSection.classList.add('hidden');
  storageSection.classList.add('hidden');
  confirmSection.classList.add('hidden');

  if (type === 'room') {
    selectedRoom = selectedOrg.room_number;
    showStorageSelection();
  } else if (type === 'practice') {
    showPracticeRoomSelection();
  } else if (type === 'storage_only') {
    showStorageSelection();
  }
}

// 練習場選択を表示
function showPracticeRoomSelection() {
  if (!selectedOrg || !selectedOrg.can_use_practice_rooms) {
    return;
  }

  const practiceSection = document.getElementById('practiceRoomSelection');
  const practiceButtons = document.getElementById('practiceRoomButtons');
  practiceButtons.innerHTML = '';

  if (selectedPracticeRoom && resourceUsage.practiceRoomIds.includes(selectedPracticeRoom)) {
    selectedPracticeRoom = null;
  }

  // 練習場をカテゴリ別にグループ化
  const categories = {
    'music': { name: '音楽練習室', rooms: [] },
    'joint': { name: '合同練習室', rooms: [] },
    'meeting': { name: '集会室', rooms: [] },
    'group': { name: 'グループ練習室', rooms: [] },
    'other': { name: 'その他', rooms: [] }
  };

  practiceRooms.forEach(room => {
    let categoryKey = null;
    if (categories[room.room_type]) {
      categoryKey = room.room_type;
    } else {
      categoryKey = 'other';
    }

    if (categoryKey === 'other') {
      const name = room.room_name || '';
      if (
        name.includes('音楽練習室') ||
        name.includes('合同練習室') ||
        name.includes('グループ練習室') ||
        name.includes('集会室')
      ) {
        return;
      }
    }

    const category = categories[categoryKey];
    category.rooms.push(room);
  });

  // カテゴリごとに表示
  Object.values(categories).forEach(category => {
    if (category.rooms.length === 0) return;

    // カテゴリヘッダー
    const categoryHeader = document.createElement('h3');
    categoryHeader.textContent = category.name;
    categoryHeader.style.cssText = 'grid-column: 1 / -1; color: #001E62; margin: 10px 0 5px 0; font-size: 1.1rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px;';
    practiceButtons.appendChild(categoryHeader);

    // カテゴリ内の部屋ボタン
    category.rooms.forEach(room => {
      const button = document.createElement('button');
      button.className = 'practice-room-button';
      const inUse = resourceUsage.practiceRoomIds.includes(room.room_id);
      button.innerHTML = `
        <span class="room-name">${room.room_name}</span>
        ${inUse ? '<span class="status-badge badge-inline">貸出中</span>' : ''}
      `;
      button.dataset.roomId = room.room_id;
      if (inUse) {
        button.classList.add('disabled');
        button.disabled = true;
      } else {
        if (selectedPracticeRoom === room.room_id) {
          button.classList.add('selected');
        }
        button.addEventListener('click', () => {
          document.querySelectorAll('.practice-room-button').forEach(btn => {
            btn.classList.remove('selected');
          });
          button.classList.add('selected');
          selectedPracticeRoom = room.room_id;
          showStorageSelection();
        });
      }
      practiceButtons.appendChild(button);
    });
  });

  practiceSection.classList.remove('hidden');
}

// 倉庫選択を表示
function showStorageSelection() {
  if (!selectedOrg) {
    return;
  }

  const storageSection = document.getElementById('storageSelection');
  const storageCheckboxes = document.getElementById('storageCheckboxes');
  storageCheckboxes.innerHTML = '';

  const orgStorageIds = getOrgStorageIds(selectedOrg);
  const assignedStorages = storageRooms.filter((storage) => orgStorageIds.includes(storage.storage_id));

  // 選択済みの倉庫から利用不可になったものを除外
  selectedStorages = selectedStorages.filter(
    (id) => orgStorageIds.includes(id) && !resourceUsage.storageIds.includes(id)
  );
  if (selectedStorages.length > 1) {
    selectedStorages = selectedStorages.slice(0, 1);
  }
  selectedStorageNames = selectedStorages.length === 0
    ? []
    : storageRooms
        .filter((storage) => selectedStorages.includes(storage.storage_id))
        .map((storage) => storage.storage_name);

  const existingNotice = document.getElementById('storageAvailabilityNotice');
  if (existingNotice) {
    existingNotice.remove();
  }

  if (assignedStorages.length === 0) {
    storageCheckboxes.innerHTML = '<p>この団体には倉庫が割り当てられていません</p>';
  } else {
    const allUnavailable = assignedStorages.every((storage) =>
      resourceUsage.storageIds.includes(storage.storage_id)
    );

    assignedStorages.forEach(storage => {
      const disabled = resourceUsage.storageIds.includes(storage.storage_id);
      const checked = !disabled && selectedStorages.includes(storage.storage_id);

      const label = document.createElement('label');
      label.className = `storage-checkbox${disabled ? ' disabled' : ''}`;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = storage.storage_id;
      checkbox.dataset.name = storage.storage_name;
      checkbox.disabled = disabled;
      checkbox.checked = checked;

      if (!disabled) {
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            document.querySelectorAll('#storageCheckboxes input[type="checkbox"]').forEach(cb => {
              if (cb !== checkbox) {
                cb.checked = false;
              }
            });
            selectedStorages = [parseInt(checkbox.value, 10)];
            selectedStorageNames = [checkbox.dataset.name];
          } else {
            selectedStorages = [];
            selectedStorageNames = [];
          }
        });
      }

      const nameSpan = document.createElement('span');
      nameSpan.className = 'storage-name';
      nameSpan.textContent = storage.storage_name;

      label.appendChild(checkbox);
      label.appendChild(nameSpan);

      if (disabled) {
        const badge = document.createElement('span');
        badge.className = 'status-badge badge-inline';
        badge.textContent = '貸出中';
        label.appendChild(badge);
      }

      storageCheckboxes.appendChild(label);
    });

    const checkedBox = storageCheckboxes.querySelector('input[type="checkbox"]:checked');
    if (!checkedBox) {
      selectedStorages = [];
      selectedStorageNames = [];
    }

    if (allUnavailable) {
      const notice = document.createElement('p');
      notice.id = 'storageAvailabilityNotice';
      notice.className = 'storage-status';
      notice.textContent = '現在選択できる倉庫はありません';
      const confirmBtn = document.getElementById('confirmSelectionButton');
      if (confirmBtn) {
        storageSection.insertBefore(notice, confirmBtn);
      } else {
        storageSection.appendChild(notice);
      }
    }
  }

  storageSection.classList.remove('hidden');

  // 確認ボタン
  let confirmSelectionBtn = document.getElementById('confirmSelectionButton');
  if (!confirmSelectionBtn) {
    const btn = document.createElement('button');
    btn.id = 'confirmSelectionButton';
    btn.className = 'btn btn-primary';
    btn.textContent = '確認画面へ';
    btn.addEventListener('click', showConfirmation);
    storageSection.appendChild(btn);
    confirmSelectionBtn = btn;
  }

  if (confirmSelectionBtn) {
    const assignedCount = assignedStorages.length;
    const availableCount = assignedStorages.filter(
      (storage) => !resourceUsage.storageIds.includes(storage.storage_id)
    ).length;
    const shouldDisable = rentalType === 'storage_only' && (assignedCount === 0 || availableCount === 0);
    confirmSelectionBtn.disabled = shouldDisable;
    confirmSelectionBtn.classList.toggle('disabled', shouldDisable);
  }
}

// 確認画面表示
function showConfirmation() {
  // 選択された倉庫を取得
  const checkboxes = document.querySelectorAll('#storageCheckboxes input:checked');
  selectedStorages = Array.from(checkboxes).map(cb => parseInt(cb.value));
  const storageNames = Array.from(checkboxes).map(cb => cb.dataset.name);
  selectedStorageNames = storageNames;

  if (selectedStorages.length > 1) {
    alert('倉庫は1つだけ選択してください');
    return;
  }

  // 倉庫のみの場合は倉庫が必須
  if (rentalType === 'storage_only' && selectedStorages.length === 0) {
    alert('倉庫を1つ以上選択してください');
    return;
  }

  // 確認内容を表示
  let rentalInfo = '';
  if (rentalType === 'room') {
    rentalInfo = `<div><strong>部室:</strong> ${selectedRoom}</div>`;
  } else if (rentalType === 'practice') {
    const roomName = practiceRooms.find(r => r.room_id === selectedPracticeRoom).room_name;
    rentalInfo = `<div><strong>練習場:</strong> ${roomName}</div>`;
  } else if (rentalType === 'storage_only') {
    rentalInfo = `<div><strong>貸出タイプ:</strong> 倉庫のみ</div>`;
  }

  if (storageNames.length > 0) {
    rentalInfo += `<div><strong>倉庫:</strong> ${storageNames.join(', ')}</div>`;
  }

  document.getElementById('confirmOrgName').innerHTML = `
    <div><strong>団体:</strong> ${selectedOrg.org_name}</div>
    ${rentalInfo}
  `;

  document.getElementById('confirmSection').classList.remove('hidden');
  document.getElementById('confirmSection').scrollIntoView({ behavior: 'smooth' });
}

// 貸出確定
async function handleConfirmBorrow() {
  try {
    const response = await fetch('/api/borrow', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        studentId: currentStudent.studentId,
        orgId: selectedOrg.org_id,
        rentalType: rentalType,
        roomNumber: selectedRoom,
        practiceRoomId: selectedPracticeRoom,
        storageIds: selectedStorages
      })
    });

    const data = await response.json();

    if (response.ok) {
      let rentalDesc = '';
      if (rentalType === 'room') {
        rentalDesc = `部室: ${selectedRoom}`;
      } else if (rentalType === 'practice') {
        const room = practiceRooms.find(r => r.room_id === selectedPracticeRoom);
        rentalDesc = room ? `練習場: ${room.room_name}` : '練習場';
      } else if (rentalType === 'storage_only') {
        const names = selectedStorageNames.length > 0
          ? selectedStorageNames
          : storageRooms
              .filter(storage => selectedStorages.includes(storage.storage_id))
              .map(storage => storage.storage_name);
        rentalDesc = names.length > 0 ? `倉庫: ${names.join(', ')}` : '倉庫';
      } else {
        rentalDesc = '貸出';
      }

      showResult(true, `${rentalDesc}の鍵を貸し出しました`);
    } else {
      showResult(false, data.error || '貸出に失敗しました');
    }
  } catch (error) {
    console.error('エラー:', error);
    showResult(false, 'サーバーとの通信に失敗しました');
  } finally {
    await loadCurrentRentals();
  }
}

// 結果表示
function showResult(success, message) {
  document.getElementById('studentInfo').classList.add('hidden');
  document.getElementById('orgSelection').classList.add('hidden');
  document.getElementById('rentalTypeSelection').classList.add('hidden');
  document.getElementById('practiceRoomSelection').classList.add('hidden');
  document.getElementById('storageSelection').classList.add('hidden');
  document.getElementById('confirmSection').classList.add('hidden');

  const resultMessage = document.getElementById('resultMessage');
  resultMessage.textContent = message;
  resultMessage.className = success ? 'success-message' : 'error-message';

  document.getElementById('resultSection').classList.remove('hidden');
  document.getElementById('resultSection').scrollIntoView({ behavior: 'smooth' });
}

// スキャン画面に戻る
function resetToScan() {
  currentStudent = null;
  selectedOrg = null;
  rentalType = null;
  selectedRoom = null;
  selectedPracticeRoom = null;
  selectedStorages = [];
  selectedStorageNames = [];
  currentStudentRentals = [];
  rentalItemsCache = new Map();
  renderStudentRentals();
  updateOrganizationSummary();

  document.getElementById('barcodeInput').value = '';
  document.getElementById('studentInfo').classList.add('hidden');
  document.getElementById('orgSelection').classList.add('hidden');
  document.getElementById('rentalTypeSelection').classList.add('hidden');
  document.getElementById('practiceRoomSelection').classList.add('hidden');
  document.getElementById('storageSelection').classList.add('hidden');
  document.getElementById('confirmSection').classList.add('hidden');
  document.getElementById('resultSection').classList.add('hidden');

  document.getElementById('barcodeInput').focus();
}

// 現在貸出中の鍵を読み込み
async function loadCurrentRentals() {
  try {
    rentalItemsCache = new Map();
    const response = await fetch('/api/rentals/current');
    const rentals = await response.json();
    currentStudentRentals = currentStudent
      ? rentals.filter(rental => rental.student_id === currentStudent.studentId)
      : [];

    const rentalsList = document.getElementById('currentRentalsList');
    const needGlobalDisplay = Boolean(rentalsList);

    const targetRentals = needGlobalDisplay ? rentals : currentStudentRentals;
    if (targetRentals.length > 0) {
      await Promise.all(targetRentals.map(async (rental) => {
        const itemsResponse = await fetch(`/api/rental-items/${rental.log_id}`);
        const items = await itemsResponse.json();
        rentalItemsCache.set(rental.log_id, items);
      }));
    }

    if (needGlobalDisplay) {
      if (rentals.length === 0) {
        rentalsList.innerHTML = '<p class="loading">現在貸出中の鍵はありません</p>';
      } else {
        const rentalElements = rentals.map(rental => {
          let rentalLocation = '';
          if (rental.rental_type === 'room') {
            rentalLocation = `部室: ${rental.room_number}`;
          } else if (rental.rental_type === 'practice') {
            rentalLocation = `練習場: ${rental.practice_room_name}`;
          } else if (rental.rental_type === 'storage_only') {
            rentalLocation = '倉庫のみ';
          } else {
            rentalLocation = rental.practice_room_name ? `練習場: ${rental.practice_room_name}` : '貸出';
          }

          const items = rentalItemsCache.get(rental.log_id) || [];
          let buttons = '';
          if (rental.rental_type === 'room') {
            buttons = `<button class="btn btn-success" onclick="handleReturn(${rental.log_id})">全て返却</button>`;
          } else {
            buttons = '<div class="button-group">';
            buttons += `<button class="btn btn-success" onclick="handleReturn(${rental.log_id})">全て返却</button>`;
            buttons += '</div>';
          }

          let itemButtons = '';
          if (items.length > 0) {
            itemButtons = '<div class="item-buttons">';
            for (const item of items) {
              const itemName = item.item_type === 'practice_room'
                ? item.practice_room_name
                : item.storage_name;
              itemButtons += `
                <button class="btn btn-secondary btn-small" onclick="handleReturnItem(${item.item_id}, '${itemName}')">
                  ${itemName}返却
                </button>
              `;
            }
            itemButtons += '</div>';
          }

          return `
            <div class="rental-item">
              <div class="rental-info">
                <strong>${rental.org_name}</strong> - ${rentalLocation}<br>
                ${rental.name} (${rental.student_id})<br>
                貸出時刻: ${new Date(rental.borrowed_at).toLocaleString('ja-JP')}
              </div>
              <div class="rental-actions">
                ${buttons}
                ${itemButtons}
              </div>
            </div>
          `;
        });

        rentalsList.innerHTML = rentalElements.join('');
      }
    }
  } catch (error) {
    console.error('エラー:', error);
    const rentalsList = document.getElementById('currentRentalsList');
    if (rentalsList) {
      rentalsList.innerHTML = '<p class="error-message">データの読み込みに失敗しました</p>';
    }
    currentStudentRentals = [];
    rentalItemsCache = new Map();
  } finally {
    renderStudentRentals();
    await loadResourceUsage();
  }
}

// 鍵返却（全体）
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
      await loadCurrentRentals();
    } else {
      alert(data.error || '返却に失敗しました');
    }
  } catch (error) {
    console.error('エラー:', error);
    alert('サーバーとの通信に失敗しました');
  }
}

// 個別アイテム返却
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
      await loadCurrentRentals();
    } else {
      alert(data.error || '返却に失敗しました');
    }
  } catch (error) {
    console.error('エラー:', error);
    alert('サーバーとの通信に失敗しました');
  }
}
