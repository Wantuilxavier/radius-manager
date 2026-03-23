const router = require('express').Router();
const { pool } = require('../db/connection');
const { authMiddleware, requirePermission } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/groups
router.get('/', requirePermission('groups', 'view'), async (req, res) => {
  try {
    const [groups] = await pool.query(
      `SELECT vp.*, COUNT(rug.username) as user_count
       FROM vlan_profiles vp
       LEFT JOIN radusergroup rug ON rug.groupname = vp.groupname
       GROUP BY vp.id
       ORDER BY vp.vlan_id`
    );
    res.json(groups);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar grupos' });
  }
});

// POST /api/groups
router.post('/', requirePermission('groups', 'create'), async (req, res) => {
  const { groupname, vlan_id, description, color } = req.body;
  if (!groupname || !vlan_id)
    return res.status(400).json({ error: 'groupname e vlan_id são obrigatórios' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      'INSERT INTO vlan_profiles (groupname, vlan_id, description, color) VALUES (?,?,?,?)',
      [groupname, vlan_id, description || null, color || '#6366f1']
    );
    const attrs = [
      [groupname, 'Tunnel-Type',               ':=', '13'],
      [groupname, 'Tunnel-Medium-Type',         ':=', '6'],
      [groupname, 'Tunnel-Private-Group-Id',    ':=', String(vlan_id)],
    ];
    for (const [g, attr, op, val] of attrs) {
      await conn.query('INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES (?,?,?,?)', [g, attr, op, val]);
    }
    await conn.commit();
    res.status(201).json({ message: 'Grupo/VLAN criado com sucesso' });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Grupo ou VLAN ID já existe' });
    res.status(500).json({ error: 'Erro ao criar grupo' });
  } finally {
    conn.release();
  }
});

// PUT /api/groups/:groupname
router.put('/:groupname', requirePermission('groups', 'edit'), async (req, res) => {
  const { groupname } = req.params;
  const { vlan_id, description, color, active } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      'UPDATE vlan_profiles SET vlan_id=?, description=?, color=?, active=? WHERE groupname=?',
      [vlan_id, description || null, color || '#6366f1', active !== undefined ? active : 1, groupname]
    );
    if (vlan_id) {
      await conn.query("UPDATE radgroupreply SET value=? WHERE groupname=? AND attribute='Tunnel-Private-Group-Id'", [String(vlan_id), groupname]);
    }
    await conn.commit();
    res.json({ message: 'Grupo atualizado' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: 'Erro ao atualizar grupo' });
  } finally {
    conn.release();
  }
});

// DELETE /api/groups/:groupname
router.delete('/:groupname', requirePermission('groups', 'delete'), async (req, res) => {
  const { groupname } = req.params;
  const [[{ cnt }]] = await pool.query('SELECT COUNT(*) as cnt FROM radusergroup WHERE groupname = ?', [groupname]);
  if (cnt > 0) return res.status(409).json({ error: `Existem ${cnt} usuários neste grupo. Mova-os antes de remover.` });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM radgroupreply WHERE groupname = ?', [groupname]);
    await conn.query('DELETE FROM radgroupcheck WHERE groupname = ?', [groupname]);
    await conn.query('DELETE FROM vlan_profiles WHERE groupname = ?', [groupname]);
    await conn.commit();
    res.json({ message: 'Grupo removido' });
  } catch {
    await conn.rollback();
    res.status(500).json({ error: 'Erro ao remover grupo' });
  } finally {
    conn.release();
  }
});

module.exports = router;
