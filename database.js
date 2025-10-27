const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data', 'key_rental.db'));

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = columns.some((column) => column.name === columnName);
  if (!exists) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function resolveDuplicateActiveRentals() {
  const closeRental = db.prepare(`
    UPDATE rental_logs
    SET status = '返却済み',
        returned_at = COALESCE(returned_at, datetime('now', 'localtime'))
    WHERE log_id = ?
  `);
  const closeItems = db.prepare(`
    UPDATE rental_items
    SET status = '返却済み',
        returned_at = COALESCE(returned_at, datetime('now', 'localtime'))
    WHERE rental_log_id = ? AND status = '貸出中'
  `);

  const duplicateRoomPractice = db.prepare(`
    SELECT log_id FROM rental_logs
    WHERE status = '貸出中'
      AND rental_type IN ('room', 'practice')
      AND log_id NOT IN (
        SELECT MIN(log_id)
        FROM rental_logs
        WHERE status = '貸出中'
          AND rental_type IN ('room', 'practice')
        GROUP BY student_id
      )
  `).all();

  for (const row of duplicateRoomPractice) {
    closeItems.run(row.log_id);
    closeRental.run(row.log_id);
  }

  const duplicateStorageOnly = db.prepare(`
    SELECT log_id FROM rental_logs
    WHERE status = '貸出中'
      AND rental_type = 'storage_only'
      AND log_id NOT IN (
        SELECT MIN(log_id)
        FROM rental_logs
        WHERE status = '貸出中'
          AND rental_type = 'storage_only'
        GROUP BY student_id
      )
  `).all();

  for (const row of duplicateStorageOnly) {
    closeItems.run(row.log_id);
    closeRental.run(row.log_id);
  }
}

// データベース初期化
function initDatabase() {
  // 学生テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      student_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT
    )
  `);

  // 団体テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      org_id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_name TEXT NOT NULL UNIQUE,
      room_number TEXT,
      can_use_practice_rooms INTEGER DEFAULT 0,
      storage_ids TEXT
    )
  `);
  ensureColumn('organizations', 'can_use_practice_rooms', 'INTEGER DEFAULT 0');
  ensureColumn('organizations', 'storage_ids', 'TEXT');

  // 所属テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS memberships (
      membership_id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      org_id INTEGER NOT NULL,
      role TEXT DEFAULT '一般会員',
      FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
      FOREIGN KEY (org_id) REFERENCES organizations(org_id) ON DELETE CASCADE,
      UNIQUE(student_id, org_id)
    )
  `);
  ensureColumn('memberships', 'role', "TEXT DEFAULT '一般会員'");

  // 練習場テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS practice_rooms (
      room_id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_name TEXT NOT NULL UNIQUE,
      room_type TEXT NOT NULL
    )
  `);

  // 倉庫テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS storage_rooms (
      storage_id INTEGER PRIMARY KEY AUTOINCREMENT,
      storage_name TEXT NOT NULL UNIQUE
    )
  `);

  // 印刷室テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS print_rooms (
      print_room_id INTEGER PRIMARY KEY AUTOINCREMENT,
      print_room_name TEXT NOT NULL UNIQUE
    )
  `);

  // 貸出履歴テーブル（拡張版）
  db.exec(`
    CREATE TABLE IF NOT EXISTS rental_logs (
      log_id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      org_id INTEGER NOT NULL,
      rental_type TEXT NOT NULL,
      room_number TEXT,
      practice_room_id INTEGER,
      print_room_id INTEGER,
      storage_ids TEXT,
      borrowed_at TEXT NOT NULL,
      returned_at TEXT,
      status TEXT DEFAULT '貸出中',
      FOREIGN KEY (student_id) REFERENCES students(student_id),
      FOREIGN KEY (org_id) REFERENCES organizations(org_id),
      FOREIGN KEY (practice_room_id) REFERENCES practice_rooms(room_id),
      FOREIGN KEY (print_room_id) REFERENCES print_rooms(print_room_id)
    )
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_rental_logs_student_room_practice
    ON rental_logs(student_id)
    WHERE status = '貸出中' AND rental_type IN ('room', 'practice', 'print_room')
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_rental_logs_student_storage_only
    ON rental_logs(student_id)
    WHERE status = '貸出中' AND rental_type = 'storage_only'
  `);
  ensureColumn('rental_logs', 'practice_room_id', 'INTEGER');
  ensureColumn('rental_logs', 'print_room_id', 'INTEGER');
  ensureColumn('rental_logs', 'storage_ids', 'TEXT');
  ensureColumn('rental_logs', 'returned_at', 'TEXT');
  ensureColumn('rental_logs', 'status', "TEXT DEFAULT '貸出中'");

  // 個別貸出テーブル（練習場・倉庫・部屋・印刷室を個別返却可能にするため）
  db.exec(`
    CREATE TABLE IF NOT EXISTS rental_items (
      item_id INTEGER PRIMARY KEY AUTOINCREMENT,
      rental_log_id INTEGER NOT NULL,
      item_type TEXT NOT NULL,
      practice_room_id INTEGER,
      storage_id INTEGER,
      room_number TEXT,
      print_room_id INTEGER,
      borrowed_at TEXT NOT NULL,
      returned_at TEXT,
      status TEXT DEFAULT '貸出中',
      FOREIGN KEY (rental_log_id) REFERENCES rental_logs(log_id) ON DELETE CASCADE,
      FOREIGN KEY (practice_room_id) REFERENCES practice_rooms(room_id),
      FOREIGN KEY (storage_id) REFERENCES storage_rooms(storage_id),
      FOREIGN KEY (print_room_id) REFERENCES print_rooms(print_room_id)
    )
  `);
  ensureColumn('rental_items', 'room_number', 'TEXT');
  ensureColumn('rental_items', 'print_room_id', 'INTEGER');

  resolveDuplicateActiveRentals();

  // 練習場の初期データを登録
  const practiceRooms = [];

  // 音楽練習室 1-6
  for (let i = 1; i <= 6; i++) {
    practiceRooms.push({ name: `音楽練習室${i}`, type: 'music' });
  }

  // 合同練習室 A-E
  for (const letter of ['A', 'B', 'C', 'D', 'E']) {
    practiceRooms.push({ name: `合同練習室${letter}`, type: 'joint' });
  }

  // 大ホール
  practiceRooms.push({ name: '大ホール', type: 'hall' });

  // 集会室 1-6
  for (let i = 1; i <= 6; i++) {
    practiceRooms.push({ name: `集会室${i}`, type: 'meeting' });
  }

  // グループ練習室 1-6
  for (let i = 1; i <= 6; i++) {
    practiceRooms.push({ name: `グループ練習室${i}`, type: 'group' });
  }

  // 和室
  practiceRooms.push({ name: '和室', type: 'japanese' });

  // 屋上
  practiceRooms.push({ name: '屋上', type: 'rooftop' });

  const insertPracticeRoom = db.prepare('INSERT OR IGNORE INTO practice_rooms (room_name, room_type) VALUES (?, ?)');
  for (const room of practiceRooms) {
    insertPracticeRoom.run(room.name, room.type);
  }

  // 倉庫の初期データを登録
  const storageRooms = [];
  for (let i = 1; i <= 10; i++) {
    storageRooms.push(`倉庫${i}`);
  }
  storageRooms.push('新倉庫');

  const insertStorage = db.prepare('INSERT OR IGNORE INTO storage_rooms (storage_name) VALUES (?)');
  for (const storage of storageRooms) {
    insertStorage.run(storage);
  }

  // 印刷室の初期データを登録
  const printRooms = ['印刷室'];
  const insertPrintRoom = db.prepare('INSERT OR IGNORE INTO print_rooms (print_room_name) VALUES (?)');
  for (const room of printRooms) {
    insertPrintRoom.run(room);
  }

  console.log('データベースを初期化しました');
}

// 学生情報取得
function getStudentByBarcode(studentId) {
  const stmt = db.prepare(`
    SELECT
      s.student_id,
      s.name,
      s.email,
      o.org_id,
      o.org_name,
      o.room_number,
      o.can_use_practice_rooms,
      o.storage_ids
    FROM students s
    JOIN memberships m ON s.student_id = m.student_id
    JOIN organizations o ON m.org_id = o.org_id
    WHERE s.student_id = ?
  `);
  return stmt.all(studentId);
}

// 鍵貸出処理（部屋、練習場、印刷室）
function borrowKey(studentId, orgId, rentalType, roomNumber = null, practiceRoomId = null, printRoomId = null, storageIds = []) {
  const normalizedStorageIds = Array.isArray(storageIds)
    ? storageIds
        .map((id) => parseInt(id, 10))
        .filter((id) => Number.isInteger(id))
    : [];

  if (normalizedStorageIds.length > 1) {
    throw new Error('倉庫は1つまで選択できます');
  }

  const storageIdsJson = normalizedStorageIds.length > 0 ? JSON.stringify(normalizedStorageIds) : null;
  const studentExists = db.prepare('SELECT 1 FROM students WHERE student_id = ?').get(studentId);
  if (!studentExists) {
    throw new Error('学生情報が登録されていません');
  }

  const isRoomInUse = (room) =>
    db.prepare(`
      SELECT 1 FROM rental_logs
      WHERE rental_type = 'room'
        AND room_number = ?
        AND status = '貸出中'
      LIMIT 1
    `).get(room);

  const isPracticeInUse = (practiceRoomId) =>
    db.prepare(`
      SELECT 1 FROM rental_logs
      WHERE rental_type = 'practice'
        AND practice_room_id = ?
        AND status = '貸出中'
      LIMIT 1
    `).get(practiceRoomId);

  const isStorageInUse = (storageId) =>
    db.prepare(`
      SELECT 1 FROM rental_items
      WHERE item_type = 'storage'
        AND storage_id = ?
        AND status = '貸出中'
      LIMIT 1
    `).get(storageId);

  const isPrintRoomInUse = (printRoomId) =>
    db.prepare(`
      SELECT 1 FROM rental_logs
      WHERE rental_type = 'print_room'
        AND print_room_id = ?
        AND status = '貸出中'
      LIMIT 1
    `).get(printRoomId);

  const activeRentals = db.prepare(`
    SELECT rental_type
    FROM rental_logs
    WHERE student_id = ?
      AND status = '貸出中'
  `).all(studentId);

  const hasActiveRoomOrPractice = activeRentals.some(
    (rental) => rental.rental_type === 'room' || rental.rental_type === 'practice'
  );

  const hasActivePrintRoom = activeRentals.some((rental) => rental.rental_type === 'print_room');

  // 印刷室は他のどの部屋とも同時に借りられない
  if (rentalType === 'print_room') {
    if (activeRentals.length > 0) {
      throw new Error('印刷室は他の部屋と同時に借りることができません。返却後に再度操作してください');
    }
  }

  // 印刷室を借りている場合は他の部屋を借りられない
  if (hasActivePrintRoom && rentalType !== 'print_room') {
    throw new Error('印刷室を返却してから他の部屋を借りてください');
  }

  if ((rentalType === 'room' || rentalType === 'practice') && hasActiveRoomOrPractice) {
    throw new Error('既に部屋または練習場を貸出中です。返却後に再度操作してください');
  }

  const hasActiveStorageOnly = activeRentals.some((rental) => rental.rental_type === 'storage_only');

  // storage_onlyを借りようとする場合のチェック
  if (rentalType === 'storage_only') {
    // 既にstorage_onlyを借りている場合はエラー
    if (hasActiveStorageOnly) {
      throw new Error('倉庫のみの貸出は1つまでです');
    }
    // 部室や練習場を借りている場合でも、追加で倉庫を借りることは可能
  }

  if (rentalType === 'room' && roomNumber && isRoomInUse(roomNumber)) {
    throw new Error(`部室 ${roomNumber} は既に貸出中です`);
  }

  if (rentalType === 'practice' && practiceRoomId && isPracticeInUse(practiceRoomId)) {
    throw new Error('選択した練習場は既に貸出中です');
  }

  if (normalizedStorageIds.length > 0) {
    for (const storageId of normalizedStorageIds) {
      if (isStorageInUse(storageId)) {
        throw new Error('選択した倉庫の一部が既に貸出中です');
      }
    }
  }

  if (rentalType === 'print_room' && printRoomId && isPrintRoomInUse(printRoomId)) {
    throw new Error('印刷室は既に貸出中です');
  }

  const transaction = db.transaction(() => {
    // メインの貸出ログを作成
    const stmt = db.prepare(`
      INSERT INTO rental_logs (
        student_id, org_id, rental_type, room_number, practice_room_id, print_room_id,
        storage_ids, borrowed_at, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), '貸出中')
    `);
    const result = stmt.run(studentId, orgId, rentalType, roomNumber, practiceRoomId, printRoomId, storageIdsJson);
    const rentalLogId = result.lastInsertRowid;

    // 部屋を個別アイテムとして登録
    if (rentalType === 'room' && roomNumber) {
      const roomItemStmt = db.prepare(`
        INSERT INTO rental_items (rental_log_id, item_type, room_number, borrowed_at, status)
        VALUES (?, 'room', ?, datetime('now', 'localtime'), '貸出中')
      `);
      roomItemStmt.run(rentalLogId, roomNumber);
    }

    // 練習場を個別アイテムとして登録
    if (rentalType === 'practice' && practiceRoomId) {
      const itemStmt = db.prepare(`
        INSERT INTO rental_items (rental_log_id, item_type, practice_room_id, borrowed_at, status)
        VALUES (?, 'practice_room', ?, datetime('now', 'localtime'), '貸出中')
      `);
      itemStmt.run(rentalLogId, practiceRoomId);
    }

    // 印刷室を個別アイテムとして登録
    if (rentalType === 'print_room' && printRoomId) {
      const printRoomItemStmt = db.prepare(`
        INSERT INTO rental_items (rental_log_id, item_type, print_room_id, borrowed_at, status)
        VALUES (?, 'print_room', ?, datetime('now', 'localtime'), '貸出中')
      `);
      printRoomItemStmt.run(rentalLogId, printRoomId);
    }

    // 倉庫を個別アイテムとして登録
    if (normalizedStorageIds.length > 0) {
      const storageStmt = db.prepare(`
        INSERT INTO rental_items (rental_log_id, item_type, storage_id, borrowed_at, status)
        VALUES (?, 'storage', ?, datetime('now', 'localtime'), '貸出中')
      `);
      storageStmt.run(rentalLogId, normalizedStorageIds[0]);
    }

    return result;
  });

  return transaction();
}

// 鍵返却処理（全体返却）
function returnKey(logId) {
  const transaction = db.transaction(() => {
    // メインの貸出ログを返却済みに
    const stmt = db.prepare(`
      UPDATE rental_logs
      SET returned_at = datetime('now', 'localtime'),
          status = '返却済み'
      WHERE log_id = ?
    `);
    stmt.run(logId);

    // 関連する個別アイテムも全て返却済みに
    const itemStmt = db.prepare(`
      UPDATE rental_items
      SET returned_at = datetime('now', 'localtime'),
          status = '返却済み'
      WHERE rental_log_id = ? AND status = '貸出中'
    `);
    itemStmt.run(logId);
  });

  return transaction();
}

// 個別アイテム返却処理
function returnItem(itemId) {
  const transaction = db.transaction(() => {
    // アイテムを返却済みに
    const updateItemStmt = db.prepare(`
      UPDATE rental_items
      SET returned_at = datetime('now', 'localtime'),
          status = '返却済み'
      WHERE item_id = ?
    `);
    updateItemStmt.run(itemId);

    // このアイテムが属する貸出ログIDを取得
    const getRentalLogStmt = db.prepare(`
      SELECT rental_log_id FROM rental_items WHERE item_id = ?
    `);
    const item = getRentalLogStmt.get(itemId);

    if (item) {
      // この貸出ログに紐づく貸出中のアイテムがあるか確認
      const remainingItemsStmt = db.prepare(`
        SELECT COUNT(*) as count
        FROM rental_items
        WHERE rental_log_id = ? AND status = '貸出中'
      `);
      const remaining = remainingItemsStmt.get(item.rental_log_id);

      // すべてのアイテムが返却済みなら、貸出ログも返却済みに
      if (remaining && remaining.count === 0) {
        const updateLogStmt = db.prepare(`
          UPDATE rental_logs
          SET returned_at = datetime('now', 'localtime'),
              status = '返却済み'
          WHERE log_id = ?
        `);
        updateLogStmt.run(item.rental_log_id);
      }
    }
  });

  return transaction();
}

// 貸出中の個別アイテムを取得
function getRentalItems(rentalLogId) {
  const stmt = db.prepare(`
    SELECT
      ri.item_id,
      ri.item_type,
      ri.practice_room_id,
      ri.storage_id,
      ri.print_room_id,
      ri.room_number,
      ri.borrowed_at,
      ri.status,
      pr.room_name as practice_room_name,
      sr.storage_name,
      ptr.print_room_name
    FROM rental_items ri
    LEFT JOIN practice_rooms pr ON ri.practice_room_id = pr.room_id
    LEFT JOIN storage_rooms sr ON ri.storage_id = sr.storage_id
    LEFT JOIN print_rooms ptr ON ri.print_room_id = ptr.print_room_id
    WHERE ri.rental_log_id = ? AND ri.status = '貸出中'
    ORDER BY
      CASE ri.item_type
        WHEN 'room' THEN 1
        WHEN 'practice_room' THEN 2
        WHEN 'print_room' THEN 3
        WHEN 'storage' THEN 4
      END,
      ri.item_id
  `);
  return stmt.all(rentalLogId);
}

// 現在貸出中の鍵を取得
function getCurrentRentals() {
  const stmt = db.prepare(`
    SELECT
      r.log_id,
      r.student_id,
      s.name,
      o.org_name,
      o.org_id,
      r.rental_type,
      r.room_number,
      r.practice_room_id,
      p.room_name as practice_room_name,
      p.room_type as practice_room_type,
      r.storage_ids,
      r.borrowed_at
    FROM rental_logs r
    JOIN students s ON r.student_id = s.student_id
    JOIN organizations o ON r.org_id = o.org_id
    LEFT JOIN practice_rooms p ON r.practice_room_id = p.room_id
    WHERE r.status = '貸出中'
    ORDER BY r.borrowed_at DESC
  `);
  return stmt.all();
}

// 貸出履歴取得（全て）
function getAllRentalHistory(limit = 100) {
  const stmt = db.prepare(`
    SELECT
      r.log_id,
      r.student_id,
      s.name,
      o.org_name,
      r.rental_type,
      r.room_number,
      r.practice_room_id,
      p.room_name as practice_room_name,
      r.storage_ids,
      r.borrowed_at,
      r.returned_at,
      r.status
    FROM rental_logs r
    JOIN students s ON r.student_id = s.student_id
    JOIN organizations o ON r.org_id = o.org_id
    LEFT JOIN practice_rooms p ON r.practice_room_id = p.room_id
    ORDER BY r.borrowed_at DESC
    LIMIT ?
  `);
  return stmt.all(limit);
}

function getRentalLogsForExport() {
  const stmt = db.prepare(`
    SELECT
      r.log_id,
      r.student_id,
      s.name AS student_name,
      r.org_id,
      o.org_name,
      r.rental_type,
      r.room_number,
      r.practice_room_id,
      pr.room_name AS practice_room_name,
      r.print_room_id,
      ptr.print_room_name,
      r.storage_ids,
      r.borrowed_at,
      r.returned_at,
      r.status
    FROM rental_logs r
    LEFT JOIN students s ON r.student_id = s.student_id
    LEFT JOIN organizations o ON r.org_id = o.org_id
    LEFT JOIN practice_rooms pr ON r.practice_room_id = pr.room_id
    LEFT JOIN print_rooms ptr ON r.print_room_id = ptr.print_room_id
    ORDER BY r.borrowed_at DESC
  `);
  return stmt.all();
}

// 団体一覧取得
function getAllOrganizations() {
  const stmt = db.prepare('SELECT * FROM organizations ORDER BY org_id');
  return stmt.all();
}

// 団体ごとのメンバー取得
function getOrganizationMembers(orgId = null) {
  let query = `
    SELECT
      o.org_id,
      o.org_name,
      o.room_number,
      o.can_use_practice_rooms,
      o.storage_ids,
      s.student_id,
      s.name,
      s.email
    FROM organizations o
    LEFT JOIN memberships m ON o.org_id = m.org_id
    LEFT JOIN students s ON m.student_id = s.student_id
  `;
  const params = [];
  if (orgId) {
    query += ' WHERE o.org_id = ?';
    params.push(orgId);
  }
  query += ' ORDER BY o.org_id, s.student_id';
  const stmt = db.prepare(query);
  return stmt.all(...params);
}

// 団体追加（IDを指定可能）
function addOrganization(orgName, roomNumber, canUsePracticeRooms = 0, storageIds = [], orgId = null) {
  const storageIdsJson = storageIds.length > 0 ? JSON.stringify(storageIds) : null;
  if (orgId) {
    // IDが指定された場合は明示的に挿入
    const stmt = db.prepare('INSERT INTO organizations (org_id, org_name, room_number, can_use_practice_rooms, storage_ids) VALUES (?, ?, ?, ?, ?)');
    return stmt.run(orgId, orgName, roomNumber, canUsePracticeRooms, storageIdsJson);
  } else {
    // IDが指定されていない場合は自動採番
    const stmt = db.prepare('INSERT INTO organizations (org_name, room_number, can_use_practice_rooms, storage_ids) VALUES (?, ?, ?, ?)');
    return stmt.run(orgName, roomNumber, canUsePracticeRooms, storageIdsJson);
  }
}

// 団体更新
function updateOrganization(orgId, orgName, roomNumber, canUsePracticeRooms, storageIds = []) {
  const storageIdsJson = storageIds.length > 0 ? JSON.stringify(storageIds) : null;
  const stmt = db.prepare('UPDATE organizations SET org_name = ?, room_number = ?, can_use_practice_rooms = ?, storage_ids = ? WHERE org_id = ?');
  return stmt.run(orgName, roomNumber, canUsePracticeRooms, storageIdsJson, orgId);
}

// 団体削除
function deleteOrganization(orgId) {
  const transaction = db.transaction((id) => {
    const rentalLogs = db.prepare('SELECT log_id FROM rental_logs WHERE org_id = ?').all(id);

    if (rentalLogs.length > 0) {
      const deleteRentalItems = db.prepare('DELETE FROM rental_items WHERE rental_log_id = ?');
      for (const log of rentalLogs) {
        deleteRentalItems.run(log.log_id);
      }
    }

    db.prepare('DELETE FROM rental_logs WHERE org_id = ?').run(id);
    db.prepare('DELETE FROM memberships WHERE org_id = ?').run(id);
    db.prepare('DELETE FROM organizations WHERE org_id = ?').run(id);
  });

  return transaction(orgId);
}

// 団体CSVインポート
function importOrganizationsFromCSV(organizations = []) {
  if (!Array.isArray(organizations) || organizations.length === 0) {
    return { inserted: 0, updated: 0 };
  }

  const normalizeStorageIds = (value) => {
    if (!value) {
      return [];
    }
    if (Array.isArray(value)) {
      return value
        .map((id) => parseInt(id, 10))
        .filter((id) => Number.isInteger(id));
    }
    return String(value)
      .split(/[\s,;]+/)
      .map((id) => parseInt(id, 10))
      .filter((id) => Number.isInteger(id));
  };

  const parseBoolean = (value) => {
    if (typeof value === 'number') {
      return value !== 0;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return ['1', 'true', 'yes', 'y', 'はい', '可', '可能', '〇'].includes(normalized);
    }
    return !!value;
  };

  const transaction = db.transaction((records) => {
    const insertWithId = db.prepare(`
      INSERT INTO organizations (org_id, org_name, room_number, can_use_practice_rooms, storage_ids)
      VALUES (?, ?, ?, ?, ?)
    `);
    const insertAuto = db.prepare(`
      INSERT INTO organizations (org_name, room_number, can_use_practice_rooms, storage_ids)
      VALUES (?, ?, ?, ?)
    `);
    const updateStmt = db.prepare(`
      UPDATE organizations
      SET org_name = ?, room_number = ?, can_use_practice_rooms = ?, storage_ids = ?
      WHERE org_id = ?
    `);
    const selectById = db.prepare('SELECT org_id FROM organizations WHERE org_id = ?');
    const selectByName = db.prepare('SELECT org_id FROM organizations WHERE org_name = ?');

    let inserted = 0;
    let updated = 0;

    for (const record of records) {
      if (!record) continue;

      const orgName = record.orgName || record.org_name || record.name || record['団体名'];
      if (!orgName || String(orgName).trim() === '') {
        throw new Error('団体名は必須です');
      }

      const orgIdRaw = record.orgId ?? record.org_id ?? record['団体ID'];
      const orgId = orgIdRaw !== undefined && orgIdRaw !== null && String(orgIdRaw).trim() !== ''
        ? parseInt(orgIdRaw, 10)
        : null;

      if (orgId !== null && Number.isNaN(orgId)) {
        throw new Error(`無効な団体IDが指定されています: ${orgIdRaw}`);
      }

      const roomNumber = record.roomNumber ?? record.room_number ?? record['部屋'] ?? record['部室'] ?? null;
      const canUsePractice = parseBoolean(
        record.canUsePracticeRooms ?? record.can_use_practice_rooms ?? record['練習場利用'] ?? 0
      )
        ? 1
        : 0;
      const storageIdsArray = normalizeStorageIds(
        record.storageIds ?? record.storage_ids ?? record['倉庫'] ?? record['storage']
      );
      const storageIdsJson = storageIdsArray.length > 0 ? JSON.stringify(storageIdsArray) : null;

      const existingById = orgId ? selectById.get(orgId) : null;
      const existingByName = selectByName.get(orgName);

      let targetId = null;

      if (existingById) {
        if (existingByName && existingByName.org_id !== existingById.org_id) {
          targetId = existingByName.org_id;
        } else {
          targetId = existingById.org_id;
        }
      } else if (existingByName) {
        targetId = existingByName.org_id;
      }

      if (targetId !== null) {
        updateStmt.run(orgName, roomNumber || null, canUsePractice, storageIdsJson, targetId);
        updated += 1;
        continue;
      }

      if (orgId) {
        try {
          insertWithId.run(orgId, orgName, roomNumber || null, canUsePractice, storageIdsJson);
          inserted += 1;
        } catch (error) {
          if (error.message.includes('UNIQUE')) {
            const existing = selectByName.get(orgName);
            if (existing) {
              updateStmt.run(orgName, roomNumber || null, canUsePractice, storageIdsJson, existing.org_id);
              updated += 1;
            } else {
              throw error;
            }
          } else {
            throw error;
          }
        }
      } else {
        insertAuto.run(orgName, roomNumber || null, canUsePractice, storageIdsJson);
        inserted += 1;
      }
    }

    return { inserted, updated };
  });

  return transaction(organizations);
}

// 練習場一覧取得
function getAllPracticeRooms() {
  const stmt = db.prepare('SELECT * FROM practice_rooms ORDER BY room_id');
  return stmt.all();
}

// 倉庫一覧取得
function getAllStorageRooms() {
  const stmt = db.prepare('SELECT * FROM storage_rooms ORDER BY storage_id');
  return stmt.all();
}

// 印刷室一覧取得
function getAllPrintRooms() {
  const stmt = db.prepare('SELECT * FROM print_rooms ORDER BY print_room_id');
  return stmt.all();
}

// 現在貸出中の資源状況
function getCurrentResourceUsage() {
  const rooms = db
    .prepare(`
      SELECT room_number
      FROM rental_logs
      WHERE rental_type = 'room'
        AND status = '貸出中'
        AND room_number IS NOT NULL
    `)
    .all()
    .map((row) => row.room_number);

  const practiceRoomIds = db
    .prepare(`
      SELECT practice_room_id
      FROM rental_items
      WHERE item_type = 'practice_room'
        AND status = '貸出中'
        AND practice_room_id IS NOT NULL
    `)
    .all()
    .map((row) => row.practice_room_id);

  const storageIds = db
    .prepare(`
      SELECT storage_id
      FROM rental_items
      WHERE item_type = 'storage'
        AND status = '貸出中'
        AND storage_id IS NOT NULL
    `)
    .all()
    .map((row) => row.storage_id);

  return {
    rooms,
    practiceRoomIds,
    storageIds
  };
}

// CSVから学生データ一括登録（更新対応）
function importStudentsFromCSV(students, updateMode = false, targetOrgId = null) {
  const transaction = db.transaction((students, updateMode, targetOrgId) => {
    if (updateMode && targetOrgId) {
      const deleteMemberships = db.prepare('DELETE FROM memberships WHERE org_id = ?');
      deleteMemberships.run(targetOrgId);
    }

    const upsertStudent = db.prepare(`
      INSERT INTO students (student_id, name, email)
      VALUES (?, ?, ?)
      ON CONFLICT(student_id) DO UPDATE SET
        name = excluded.name,
        email = excluded.email
    `);

    const upsertMembership = db.prepare(`
      INSERT INTO memberships (student_id, org_id, role)
      VALUES (?, ?, ?)
      ON CONFLICT(student_id, org_id) DO UPDATE SET
        role = excluded.role
    `);

    for (const student of students) {
      upsertStudent.run(student.student_id, student.name, student.email || null);
      upsertMembership.run(
        student.student_id,
        student.org_id,
        student.role || '一般会員'
      );
    }
  });

  return transaction(students, updateMode, targetOrgId);
}

function resetOrganizationsAndStudents() {
  const transaction = db.transaction(() => {
    db.exec('DELETE FROM rental_items');
    db.exec('DELETE FROM rental_logs');
    db.exec('DELETE FROM memberships');
    db.exec('DELETE FROM students');
    db.exec('DELETE FROM organizations');
    db.exec(`
      DELETE FROM sqlite_sequence
      WHERE name IN ('rental_items', 'rental_logs', 'memberships', 'students', 'organizations')
    `);
  });

  transaction();
}

module.exports = {
  initDatabase,
  getStudentByBarcode,
  borrowKey,
  returnKey,
  returnItem,
  getRentalItems,
  getCurrentRentals,
  getAllRentalHistory,
  getRentalLogsForExport,
  getAllOrganizations,
  getOrganizationMembers,
  importOrganizationsFromCSV,
  addOrganization,
  updateOrganization,
  deleteOrganization,
  getAllPracticeRooms,
  getAllStorageRooms,
  getAllPrintRooms,
  getCurrentResourceUsage,
  importStudentsFromCSV,
  resetOrganizationsAndStudents,
  db
};
