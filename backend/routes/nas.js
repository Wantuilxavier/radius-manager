const router = require('express').Router();
const { pool } = require('../db/connection');
const { authMiddleware, requirePermission } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/nas
router.get('/', requirePermission('nas', 'view'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT n.*,
        (SELECT COUNT(DISTINCT username) FROM radacct
         WHERE nasipaddress = n.nasname
           AND acctstoptime IS NULL
           AND acctstarttime >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        ) AS online_count
       FROM nas n
       ORDER BY n.shortname`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar NAS' });
  }
});

// GET /api/nas/:id
router.get('/:id', requirePermission('nas', 'view'), async (req, res) => {
  try {
    const [[nas]] = await pool.query('SELECT * FROM nas WHERE id = ?', [req.params.id]);
    if (!nas) return res.status(404).json({ error: 'NAS não encontrado' });
    res.json(nas);
  } catch {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/nas
router.post('/', requirePermission('nas', 'create'), async (req, res) => {
  const { nasname, shortname, type, secret, ports, community, description } = req.body;
  if (!nasname || !secret)
    return res.status(400).json({ error: 'IP/hostname e secret são obrigatórios' });

  try {
    const [result] = await pool.query(
      `INSERT INTO nas (nasname, shortname, type, secret, ports, community, description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [nasname, shortname || null, type || 'other', secret, ports || null, community || null, description || null]
    );
    res.status(201).json({ id: result.insertId, message: 'NAS cadastrado com sucesso' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'NAS com este IP/hostname já existe' });
    res.status(500).json({ error: 'Erro ao cadastrar NAS' });
  }
});

// PUT /api/nas/:id
router.put('/:id', requirePermission('nas', 'edit'), async (req, res) => {
  const { nasname, shortname, type, secret, ports, community, description } = req.body;
  if (!nasname || !secret)
    return res.status(400).json({ error: 'IP/hostname e secret são obrigatórios' });
  try {
    const [r] = await pool.query(
      `UPDATE nas SET nasname=?, shortname=?, type=?, secret=?, ports=?, community=?, description=?
       WHERE id=?`,
      [nasname, shortname || null, type || 'other', secret, ports || null, community || null, description || null, req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'NAS não encontrado' });
    res.json({ message: 'NAS atualizado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar NAS' });
  }
});

// DELETE /api/nas/:id
router.delete('/:id', requirePermission('nas', 'delete'), async (req, res) => {
  try {
    const [r] = await pool.query('DELETE FROM nas WHERE id = ?', [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'NAS não encontrado' });
    res.json({ message: 'NAS removido com sucesso' });
  } catch {
    res.status(500).json({ error: 'Erro ao remover NAS' });
  }
});

module.exports = router;
