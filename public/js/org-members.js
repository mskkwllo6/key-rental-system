const orgMembersList = document.getElementById('orgMembersList');
const searchInput = document.getElementById('orgSearchInput');
const clearButton = document.getElementById('clearSearch');
const refreshButton = document.getElementById('refreshMembers');

let organizations = [];
let filteredOrganizations = [];

document.addEventListener('DOMContentLoaded', () => {
  searchInput.addEventListener('input', handleSearch);
  clearButton.addEventListener('click', () => {
    searchInput.value = '';
    renderOrganizations(organizations);
    searchInput.focus();
  });
  refreshButton.addEventListener('click', loadOrganizations);

  loadOrganizations();
});

async function loadOrganizations() {
  setLoading(orgMembersList);
  try {
    const response = await fetch('/api/organizations/members');
    if (!response.ok) {
      throw new Error('団体情報の取得に失敗しました');
    }
    const data = await response.json();
    organizations = data.map(org => ({
      ...org,
      members: org.members.sort((a, b) => a.studentId.localeCompare(b.studentId))
    }));
    renderOrganizations(organizations);
  } catch (error) {
    console.error('団体メンバー取得エラー:', error);
    setError(orgMembersList, '団体情報の読み込みに失敗しました');
  }
}

function handleSearch() {
  const keyword = searchInput.value.trim().toLowerCase();
  if (!keyword) {
    renderOrganizations(organizations);
    return;
  }

  filteredOrganizations = organizations.filter(org => {
    if (org.orgName && org.orgName.toLowerCase().includes(keyword)) {
      return true;
    }
    return org.members.some(member =>
      member.name.toLowerCase().includes(keyword) ||
      member.studentId.toLowerCase().includes(keyword)
    );
  });

  renderOrganizations(filteredOrganizations);
}

function renderOrganizations(data) {
  if (!data.length) {
    orgMembersList.innerHTML = '<p class="loading">条件に合う団体が見つかりません</p>';
    return;
  }

  const cards = data.map(org => {
    const members = org.members;
    const storageInfo = org.storageIds && org.storageIds.length > 0
      ? `<span class="org-meta">倉庫: ${org.storageIds.join(', ')}</span>`
      : '';
    const practiceInfo = org.canUsePracticeRooms ? '<span class="org-meta">練習場利用可</span>' : '';

    const membersHtml = members.length > 0
      ? members.map(member => `
          <div class="member-item">
            <div class="member-main">
              <span class="member-name">${member.name}</span>
              <span class="member-id">${member.studentId}</span>
            </div>
            <div class="member-meta">
              ${member.email ? `<span class="member-email">${member.email}</span>` : ''}
            </div>
          </div>
        `).join('')
      : '<p class="empty">登録されているメンバーがいません</p>';

    return `
      <div class="org-card">
        <div class="org-header">
          <h3>${org.orgName}</h3>
          <div class="org-meta-group">
            ${org.roomNumber ? `<span class="org-meta">部室: ${org.roomNumber}</span>` : '<span class="org-meta">部室なし</span>'}
            ${practiceInfo}
            ${storageInfo}
          </div>
        </div>
        <div class="member-list">
          ${membersHtml}
        </div>
      </div>
    `;
  });

  orgMembersList.innerHTML = cards.join('');
}

function setLoading(container) {
  container.innerHTML = '<p class="loading">読み込み中...</p>';
}

function setError(container, message) {
  container.innerHTML = `<p class="error-message">${message}</p>`;
}
