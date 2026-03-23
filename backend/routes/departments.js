const router = require('express').Router();
const { pool } = require('../db/connection');
const { authMiddleware, requirePermission } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/departments
router.get('/', requirePermission('departments', 'view'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT d.*, COUNT(up.username) AS user_count
       FROM departments d
       LEFT JOIN user_profiles up ON up.department = d.name
       GROUP BY d.id
       ORDER BY d.name`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar departamentos' });
  }
});

// POST /api/departments
router.post('/', requirePermission('departments', 'create'), async (req, res) => {
  const { name, description } = req.body;
  if (!name || !name.trim())
    return res.status(400).json({ error: 'Nome do departamento é obrigatório' });

  try {
    await pool.query(
      'INSERT INTO departments (name, description) VALUES (?, ?)',
      [name.trim(), description?.trim() || null]
    );
    res.status(201).json({ message: 'Departamento criado com sucesso' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'Departamento já existe' });
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar departamento' });
  }
});

// PUT /api/departments/:id
router.put('/:id', requirePermission('departments', 'edit'), async (req, res) => {
  const { name, description, active } = req.body;
  if (!name || !name.trim())
    return res.status(400).json({ error: 'Nome do departamento é obrigatório' });

  try {
    const [r] = await pool.query(
      'UPDATE departments SET name=?, description=?, active=? WHERE id=?',
      [name.trim(), description?.trim() || null, active !== undefined ? (active ? 1 : 0) : 1, req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Departamento não encontrado' });
    res.json({ message: 'Departamento atualizado com sucesso' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'Já existe um departamento com este nome' });
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar departamento' });
  }
});

// DELETE /api/departments/:id
router.delete('/:id', requirePermission('departments', 'delete'), async (req, res) => {
  try {
    const [[dept]] = await pool.query('SELECT name FROM departments WHERE id = ?', [req.params.id]);
    if (!dept) return res.status(404).json({ error: 'Departamento não encontrado' });

    const [[{ cnt }]] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM user_profiles WHERE department = ?', [dept.name]
    );
    if (cnt > 0)
      return res.status(409).json({ error: `${cnt} usuário(s) vinculado(s). Reatribua-os antes de remover.` });

    await pool.query('DELETE FROM departments WHERE id = ?', [req.params.id]);
    res.json({ message: 'Departamento removido com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao remover departamento' });
  }
});

module.exports = router;
