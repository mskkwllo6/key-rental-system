const roomList = document.getElementById('roomRentals');
const practiceList = document.getElementById('practiceRentals');
const storageList = document.getElementById('storageRentals');
const refreshButton = document.getElementById('refreshRentals');

document.addEventListener('DOMContentLoaded', () => {
  refreshButton.addEventListener('click', loadCurrentRentalsOverview);
  loadCurrentRentalsOverview();
});

async function loadCurrentRentalsOverview() {
  setLoading(roomList);
  setLoading(practiceList);
  setLoading(storageList);

  try {
    const response = await fetch('/api/rentals/current');
    if (!response.ok) {
      throw new Error('貸出状況の取得に失敗しました');
    }
    const rentals = await response.json();

    const itemsMap = new Map();
    await Promise.all(rentals.map(async (rental) => {
      const itemsResponse = await fetch(`/api/rental-items/${rental.log_id}`);
      if (!itemsResponse.ok) {
        throw new Error('貸出アイテムの取得に失敗しました');
      }
      const items = await itemsResponse.json();
      itemsMap.set(rental.log_id, items);
    }));

    renderRoomRentals(rentals, itemsMap);
    renderPracticeRentals(rentals, itemsMap);
    renderStorageRentals(rentals, itemsMap);
  } catch (error) {
    console.error('貸出状況取得エラー:', error);
    setError(roomList);
    setError(practiceList);
    setError(storageList);
  }
}

function renderRoomRentals(rentals, itemsMap) {
  const roomRentals = rentals.filter(rental => rental.rental_type === 'room');
  if (roomRentals.length === 0) {
    roomList.innerHTML = '<p class="loading">貸出中の部室はありません</p>';
    return;
  }

  roomList.innerHTML = roomRentals.map(rental => {
    const storageItems = (itemsMap.get(rental.log_id) || []).filter(item => item.item_type === 'storage');
    const storageNames = storageItems.map(item => item.storage_name || '倉庫').join(', ');
    return `
      <div class="rental-item">
        <div class="rental-info">
          <strong>${rental.room_number || '部室'}</strong> (${rental.org_name})<br>
          ${rental.name} (${rental.student_id})<br>
          貸出時刻: ${formatDate(rental.borrowed_at)}
          ${storageNames ? `<br>倉庫: ${storageNames}` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function renderPracticeRentals(rentals, itemsMap) {
  const practiceRentals = rentals.filter(rental => rental.rental_type === 'practice');
  if (practiceRentals.length === 0) {
    practiceList.innerHTML = '<p class="loading">貸出中の練習場はありません</p>';
    return;
  }

  practiceList.innerHTML = practiceRentals.map(rental => {
    const items = itemsMap.get(rental.log_id) || [];
    const storageNames = items.filter(item => item.item_type === 'storage').map(item => item.storage_name || '倉庫').join(', ');
    return `
      <div class="rental-item">
        <div class="rental-info">
          <strong>${rental.practice_room_name || '練習場'}</strong> (${rental.org_name})<br>
          ${rental.name} (${rental.student_id})<br>
          貸出時刻: ${formatDate(rental.borrowed_at)}
          ${storageNames ? `<br>倉庫: ${storageNames}` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function renderStorageRentals(rentals, itemsMap) {
  const storageEntries = [];

  rentals.forEach(rental => {
    const items = itemsMap.get(rental.log_id) || [];
    items
      .filter(item => item.item_type === 'storage')
      .forEach(item => {
        storageEntries.push({
          storageName: item.storage_name || '倉庫',
          orgName: rental.org_name,
          studentName: rental.name,
          studentId: rental.student_id,
          borrowedAt: rental.borrowed_at,
          baseLocation: rental.rental_type === 'room'
            ? `部室: ${rental.room_number || '不明'}`
            : rental.rental_type === 'practice'
              ? `練習場: ${rental.practice_room_name || '不明'}`
              : '倉庫のみ'
        });
      });
  });

  if (storageEntries.length === 0) {
    storageList.innerHTML = '<p class="loading">貸出中の倉庫鍵はありません</p>';
    return;
  }

  storageList.innerHTML = storageEntries.map(entry => `
    <div class="rental-item">
      <div class="rental-info">
        <strong>${entry.storageName}</strong> (${entry.orgName})<br>
        ${entry.studentName} (${entry.studentId})<br>
        ${entry.baseLocation}<br>
        貸出時刻: ${formatDate(entry.borrowedAt)}
      </div>
    </div>
  `).join('');
}

function setLoading(container) {
  container.innerHTML = '<p class="loading">読み込み中...</p>';
}

function setError(container) {
  container.innerHTML = '<p class="error-message">データの読み込みに失敗しました</p>';
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString('ja-JP') : '-';
}
