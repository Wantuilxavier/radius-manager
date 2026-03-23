const router = require('express').Router();
const { pool } = require('../db/connection');
const { authMiddleware, requirePermission } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/dashboard/stats
router.get('/stats', requirePermission('dashboard', 'view'), async (req, res) => {
  try {
    const [[users]]   = await pool.query('SELECT COUNT(*) as total, SUM(active=1) as active, SUM(active=0) as inactive FROM user_profiles');
    const [[groups]]  = await pool.query('SELECT COUNT(*) as total FROM vlan_profiles WHERE active = 1');
    const [[online]]  = await pool.query("SELECT COUNT(DISTINCT username) as total FROM radacct WHERE acctstoptime IS NULL AND acctstarttime >= DATE_SUB(NOW(), INTERVAL 24 HOUR)");
    const [[sessions_today]] = await pool.query("SELECT COUNT(*) as total FROM radacct WHERE DATE(acctstarttime) = CURDATE()");
    
    // Sessões por grupo
    const [byGroup] = await pool.query(
      `SELECT rug.groupname, vp.color, COUNT(*) as sessions
       FROM radacct ra
       JOIN radusergroup rug ON rug.username = ra.username
       JOIN vlan_profiles vp ON vp.groupname = rug.groupname
       WHERE DATE(ra.acctstarttime) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
       GROUP BY rug.groupname, vp.color ORDER BY sessions DESC`
    );

    // Atividade últimos 7 dias
    const [daily] = await pool.query(
      `SELECT DATE(acctstarttime) as day, COUNT(*) as sessions
       FROM radacct
       WHERE acctstarttime >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       GROUP BY DATE(acctstarttime)
       ORDER BY day`
    );

    // Usuários por grupo
    const [usersByGroup] = await pool.query(
      `SELECT rug.groupname, vp.color, vp.vlan_id, COUNT(*) as total,
              SUM(up.active=1) as active
       FROM radusergroup rug
       JOIN vlan_profiles vp ON vp.groupname = rug.groupname
       JOIN user_profiles up ON up.username = rug.username
       GROUP BY rug.groupname, vp.color, vp.vlan_id`
    );

    res.json({
      totals: { users: users.total, active_users: users.active, inactive_users: users.inactive, groups: groups.total, online: online.total, sessions_today: sessions_today.total },
      sessions_by_group: byGroup,
      daily_activity: daily,
      users_by_group: usersByGroup,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao carregar stats' });
  }
});

// GET /api/dashboard/audit
router.get('/audit', requirePermission('audit', 'view'), async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const [rows] = await pool.query(
      'SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [parseInt(limit), offset]
    );
    const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM audit_log');
    res.json({ logs: rows, total });
  } catch {
    res.status(500).json({ error: 'Erro ao buscar logs' });
  }
});

// GET /api/dashboard/sessions - sessões ativas
router.get('/sessions', requirePermission('sessions', 'view'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ra.username, ra.framedipaddress, ra.nasipaddress, ra.acctstarttime,
              ra.callingstationid, rug.groupname, vp.color, vp.vlan_id,
              TIMESTAMPDIFF(MINUTE, ra.acctstarttime, NOW()) as duration_min
       FROM radacct ra
       LEFT JOIN radusergroup rug ON rug.username = ra.username
       LEFT JOIN vlan_profiles vp ON vp.groupname = rug.groupname
       WHERE ra.acctstoptime IS NULL
       ORDER BY ra.acctstarttime DESC
       LIMIT 100`
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar sessões' });
  }
});

// GET /api/dashboard/nas
router.get('/nas', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, nasname, shortname, type, description FROM nas ORDER BY shortname');
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar NAS' });
  }
});

module.exports = router;
