const express = require('express');
const multer = require('multer');
const csvParser = require('csv-parser');
const fs = require('fs');
const path = require('path');
const {
  initDatabase,
  getStudentByBarcode,
  borrowKey,
  returnKey,
  returnItem,
  getRentalItems,
  getCurrentRentals,
  getAllRentalHistory,
  getAllOrganizations,
  getOrganizationMembers,
  importOrganizationsFromCSV,
  addOrganization,
  updateOrganization,
  deleteOrganization,
  getAllPracticeRooms,
  getAllStorageRooms,
  getCurrentResourceUsage,
  importStudentsFromCSV
} = require('./database');

const app = express();
const PORT = 3000;

// ミドルウェア設定
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// CSVアップロード用の設定
const upload = multer({ dest: 'uploads/' });

// データベース初期化
initDatabase();

// API エンドポイント

// 学生証バーコード読み取り - 学生情報取得
app.get('/api/student/:studentId', (req, res) => {
  try {
    const { studentId } = req.params;
    const studentInfo = getStudentByBarcode(studentId);

    if (studentInfo.length === 0) {
      return res.status(404).json({ error: '学生が見つかりません。登録されていない可能性があります。' });
    }

    res.json(studentInfo);
  } catch (error) {
    console.error('学生情報取得エラー:', error);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// 鍵貸出
app.post('/api/borrow', (req, res) => {
  try {
    const { studentId, orgId, rentalType, roomNumber, practiceRoomId, storageIds } = req.body;

    if (!studentId || !orgId || !rentalType) {
      return res.status(400).json({ error: '必要な情報が不足しています' });
    }

    // 部屋か練習場のどちらかが必須
    if (rentalType === 'room' && !roomNumber) {
      return res.status(400).json({ error: '部屋番号が必要です' });
    }
    if (rentalType === 'practice' && !practiceRoomId) {
      return res.status(400).json({ error: '練習場が必要です' });
    }

    const result = borrowKey(
      studentId,
      orgId,
      rentalType,
      roomNumber || null,
      practiceRoomId || null,
      storageIds || []
    );

    res.json({
      success: true,
      logId: result.lastInsertRowid,
      message: '鍵を貸し出しました'
    });
  } catch (error) {
    console.error('鍵貸出エラー:', error);
    if (
      error.message.includes('貸出中') ||
      error.message.includes('学生情報が登録されていません') ||
      error.message.includes('部屋または練習場を貸出中') ||
      error.message.includes('倉庫') ||
      error.message.includes('UNIQUE constraint failed')
    ) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: '鍵の貸出に失敗しました' });
    }
  }
});

// 鍵返却（全体返却）
app.post('/api/return/:logId', (req, res) => {
  try {
    const { logId } = req.params;
    returnKey(logId);
    res.json({ success: true, message: '鍵を返却しました' });
  } catch (error) {
    console.error('鍵返却エラー:', error);
    res.status(500).json({ error: '鍵の返却に失敗しました' });
  }
});

// 個別アイテム返却（練習場・倉庫）
app.post('/api/return-item/:itemId', (req, res) => {
  try {
    const { itemId } = req.params;
    returnItem(itemId);
    res.json({ success: true, message: 'アイテムを返却しました' });
  } catch (error) {
    console.error('個別返却エラー:', error);
    res.status(500).json({ error: 'アイテムの返却に失敗しました' });
  }
});

// 貸出の個別アイテム取得
app.get('/api/rental-items/:logId', (req, res) => {
  try {
    const { logId } = req.params;
    const items = getRentalItems(logId);
    res.json(items);
  } catch (error) {
    console.error('個別アイテム取得エラー:', error);
    res.status(500).json({ error: 'データ取得に失敗しました' });
  }
});

// 現在貸出中の鍵一覧
app.get('/api/rentals/current', (req, res) => {
  try {
    const rentals = getCurrentRentals();
    res.json(rentals);
  } catch (error) {
    console.error('貸出中一覧取得エラー:', error);
    res.status(500).json({ error: 'データ取得に失敗しました' });
  }
});

// 現在利用中のリソース状況
app.get('/api/rentals/usage', (req, res) => {
  try {
    const usage = getCurrentResourceUsage();
    res.json(usage);
  } catch (error) {
    console.error('リソース使用状況取得エラー:', error);
    res.status(500).json({ error: 'データ取得に失敗しました' });
  }
});

// 貸出履歴
app.get('/api/rentals/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const history = getAllRentalHistory(limit);
    res.json(history);
  } catch (error) {
    console.error('履歴取得エラー:', error);
    res.status(500).json({ error: 'データ取得に失敗しました' });
  }
});

// 団体一覧
app.get('/api/organizations', (req, res) => {
  try {
    const organizations = getAllOrganizations();
    res.json(organizations);
  } catch (error) {
    console.error('団体一覧取得エラー:', error);
    res.status(500).json({ error: 'データ取得に失敗しました' });
  }
});

// 団体CSVインポート
app.post('/api/organizations/import-csv', upload.single('csvFile'), (req, res) => {
  try {
    console.log('団体CSVアップロードリクエスト受信', req.file && req.file.originalname);
    if (!req.file) {
      return res.status(400).json({ error: 'CSVファイルが選択されていません' });
    }

    const records = [];
    const filePath = req.file.path;

    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', (row) => {
        records.push({
          orgId: row.org_id || row.orgId || row['団体ID'],
          orgName: row.org_name || row.orgName || row['団体名'],
          roomNumber: row.room_number || row.roomNumber || row['部屋'] || row['部室'],
          canUsePracticeRooms:
            row.can_use_practice_rooms ||
            row.canUsePracticeRooms ||
            row['練習場利用'] ||
            row['練習場可'] ||
            0,
          storageIds: row.storage_ids || row.storageIds || row['倉庫'] || row['storage']
        });
      })
      .on('end', () => {
        try {
          const result = importOrganizationsFromCSV(records);

          fs.unlinkSync(filePath);

          res.json({
            success: true,
            count: result.inserted,
            updated: result.updated,
            message: `${result.inserted}件の団体を登録し、${result.updated}件を更新しました`
          });
        } catch (error) {
          console.error('団体CSV登録エラー:', error);
          fs.unlinkSync(filePath);
          if (error.message.includes('団体名は必須です') || error.message.includes('無効な団体ID')) {
            res.status(400).json({ error: error.message });
          } else if (error.message.includes('UNIQUE')) {
            res.status(400).json({ error: '同じ団体名またはIDが既に登録されています' });
          } else {
            res.status(500).json({ error: '団体データの登録に失敗しました' });
          }
        }
      })
      .on('error', (error) => {
        console.error('団体CSVパースエラー:', error);
        fs.unlinkSync(filePath);
        res.status(500).json({ error: 'CSVファイルの読み込みに失敗しました' });
      });
  } catch (error) {
    console.error('団体CSVインポートエラー:', error);
    res.status(500).json({ error: 'CSVのインポートに失敗しました' });
  }
});

// 団体ごとのメンバー一覧
app.get('/api/organizations/members', (req, res) => {
  try {
    const orgId = req.query.orgId ? parseInt(req.query.orgId, 10) : null;
    if (orgId && Number.isNaN(orgId)) {
      return res.status(400).json({ error: 'orgId は数値で指定してください' });
    }

    const rows = getOrganizationMembers(orgId);
    const orgMap = new Map();

    rows.forEach(row => {
      if (!orgMap.has(row.org_id)) {
        let storageIds = [];
        if (row.storage_ids) {
          try {
            const parsed = JSON.parse(row.storage_ids);
            if (Array.isArray(parsed)) {
              storageIds = parsed;
            }
          } catch (err) {
            console.error('storage_ids parse error:', err);
          }
        }

        orgMap.set(row.org_id, {
          orgId: row.org_id,
          orgName: row.org_name,
          roomNumber: row.room_number,
          canUsePracticeRooms: !!row.can_use_practice_rooms,
          storageIds,
          members: []
        });
      }

      if (row.student_id) {
        orgMap.get(row.org_id).members.push({
          studentId: row.student_id,
          name: row.name,
          email: row.email,
          role: row.role || '一般会員'
        });
      }
    });

    res.json(Array.from(orgMap.values()));
  } catch (error) {
    console.error('団体メンバー取得エラー:', error);
    res.status(500).json({ error: 'データ取得に失敗しました' });
  }
});

// 団体追加
app.post('/api/organizations', (req, res) => {
  try {
    const { orgName, roomNumber, canUsePracticeRooms, storageIds, orgId } = req.body;

    if (!orgName) {
      return res.status(400).json({ error: '団体名は必須です' });
    }

    const result = addOrganization(
      orgName,
      roomNumber || null,
      canUsePracticeRooms ? 1 : 0,
      storageIds || [],
      orgId ? parseInt(orgId) : null
    );
    res.json({
      success: true,
      orgId: orgId || result.lastInsertRowid,
      message: '団体を追加しました'
    });
  } catch (error) {
    console.error('団体追加エラー:', error);
    if (error.message.includes('UNIQUE')) {
      res.status(400).json({ error: 'この団体名またはIDは既に登録されています' });
    } else {
      res.status(500).json({ error: '団体の追加に失敗しました' });
    }
  }
});

// 団体更新
app.put('/api/organizations/:orgId', (req, res) => {
  try {
    const { orgId } = req.params;
    const { orgName, roomNumber, canUsePracticeRooms, storageIds } = req.body;

    if (!orgName) {
      return res.status(400).json({ error: '団体名は必須です' });
    }

    updateOrganization(
      parseInt(orgId),
      orgName,
      roomNumber || null,
      canUsePracticeRooms ? 1 : 0,
      storageIds || []
    );
    res.json({ success: true, message: '団体を更新しました' });
  } catch (error) {
    console.error('団体更新エラー:', error);
    if (error.message.includes('UNIQUE')) {
      res.status(400).json({ error: 'この団体名は既に登録されています' });
    } else {
      res.status(500).json({ error: '団体の更新に失敗しました' });
    }
  }
});

// 団体削除
app.delete('/api/organizations/:orgId', (req, res) => {
  try {
    const { orgId } = req.params;
    deleteOrganization(orgId);
    res.json({ success: true, message: '団体を削除しました' });
  } catch (error) {
    console.error('団体削除エラー:', error);
    res.status(500).json({ error: '団体の削除に失敗しました' });
  }
});

// 練習場一覧
app.get('/api/practice-rooms', (req, res) => {
  try {
    const rooms = getAllPracticeRooms();
    res.json(rooms);
  } catch (error) {
    console.error('練習場一覧取得エラー:', error);
    res.status(500).json({ error: 'データ取得に失敗しました' });
  }
});

// 倉庫一覧
app.get('/api/storage-rooms', (req, res) => {
  try {
    const storages = getAllStorageRooms();
    res.json(storages);
  } catch (error) {
    console.error('倉庫一覧取得エラー:', error);
    res.status(500).json({ error: 'データ取得に失敗しました' });
  }
});

// CSV一括登録
app.post('/api/import-csv', upload.single('csvFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'CSVファイルが選択されていません' });
    }

    const students = [];
    const filePath = req.file.path;

    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', (row) => {
        // CSVの列名に対応: student_id, name, email, org_id, role
        students.push({
          student_id: row.student_id || row['学籍番号'],
          name: row.name || row['氏名'],
          email: row.email || row['メール'] || null,
          org_id: parseInt(row.org_id || row['団体ID']),
          role: row.role || row['役職'] || '一般会員'
        });
      })
      .on('end', () => {
        try {
          // 更新モードかチェック（同じorg_idが既存の場合）
          const updateMode = req.body.updateMode === 'true';
          const targetOrgId = students.length > 0 ? students[0].org_id : null;

          importStudentsFromCSV(students, updateMode, targetOrgId);

          // アップロードファイルを削除
          fs.unlinkSync(filePath);

          const modeText = updateMode ? '更新' : '登録';
          res.json({
            success: true,
            count: students.length,
            message: `${students.length}件のデータを${modeText}しました`
          });
        } catch (error) {
          console.error('CSV登録エラー:', error);
          res.status(500).json({ error: 'データの登録に失敗しました' });
        }
      })
      .on('error', (error) => {
        console.error('CSVパースエラー:', error);
        fs.unlinkSync(filePath);
        res.status(500).json({ error: 'CSVファイルの読み込みに失敗しました' });
      });
  } catch (error) {
    console.error('CSVインポートエラー:', error);
    res.status(500).json({ error: 'CSVのインポートに失敗しました' });
  }
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`鍵貸し出しシステムがポート${PORT}で起動しました`);
  console.log(`ユーザー画面: http://localhost:${PORT}`);
  console.log(`管理者画面: http://localhost:${PORT}/admin.html`);
});
