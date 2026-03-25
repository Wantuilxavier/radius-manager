// ─── EXPORTAR USUÁRIOS — PDF ──────────────────────────────────

const _PDF_COL_IDS = [
  'pdf-col-fullname', 'pdf-col-email',   'pdf-col-phone',
  'pdf-col-department', 'pdf-col-group', 'pdf-col-status',
  'pdf-col-simconn',  'pdf-col-expires', 'pdf-col-created_at',
  'pdf-col-created_by',
];

const _PDF_COL_DEFAULTS = {
  'pdf-col-fullname':    true,
  'pdf-col-email':       true,
  'pdf-col-phone':       false,
  'pdf-col-department':  true,
  'pdf-col-group':       true,
  'pdf-col-status':      true,
  'pdf-col-simconn':     true,
  'pdf-col-expires':     true,
  'pdf-col-created_at':  true,
  'pdf-col-created_by':  false,
};

function openExportPdfModal() {
  document.getElementById('pdf-title').value = 'Relatório de Usuários WiFi';
  document.getElementById('pdf-show-password').checked = false;
  document.getElementById('pdf-use-password').checked   = false;
  document.getElementById('pdf-password').value         = '';
  document.getElementById('pdf-password-wrap').style.display = 'none';
  document.getElementById('btn-generate-pdf').disabled  = false;
  document.getElementById('btn-generate-pdf').innerHTML = '<svg><use href="#ic-download"/></svg> Gerar PDF';

  // Reset column checkboxes to defaults
  _PDF_COL_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.checked = _PDF_COL_DEFAULTS[id] ?? true;
  });
  _syncToggleAllBtn();

  openModal('modal-export-pdf');
}

// Marcar/desmarcar todas as colunas
function toggleAllPdfCols() {
  const anyChecked = _PDF_COL_IDS.some(id => document.getElementById(id)?.checked);
  _PDF_COL_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.checked = !anyChecked;
  });
  _syncToggleAllBtn();
}

function _syncToggleAllBtn() {
  const btn = document.getElementById('btn-pdf-toggle-all');
  if (!btn) return;
  const anyChecked = _PDF_COL_IDS.some(id => document.getElementById(id)?.checked);
  btn.textContent = anyChecked ? 'Desmarcar todos' : 'Marcar todos';
}

function _getSelectedCols() {
  const get = id => !!document.getElementById(id)?.checked;
  return {
    fullname:   get('pdf-col-fullname'),
    email:      get('pdf-col-email'),
    phone:      get('pdf-col-phone'),
    department: get('pdf-col-department'),
    group:      get('pdf-col-group'),
    status:     get('pdf-col-status'),
    simconn:    get('pdf-col-simconn'),
    expires:    get('pdf-col-expires'),
    created_at: get('pdf-col-created_at'),
    created_by: get('pdf-col-created_by'),
  };
}

async function generateUsersPdf() {
  const btn = document.getElementById('btn-generate-pdf');

  const selectedCols = _getSelectedCols();
  const hasAny = Object.values(selectedCols).some(Boolean);
  if (!hasAny) {
    toast('Selecione ao menos uma coluna para incluir no PDF', 'error');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Gerando…';

  try {
    // Coleta os filtros atuais da listagem de usuários
    const q = new URLSearchParams({
      limit: 9999,
      ...(usersState.search      && { search:      usersState.search }),
      ...(usersState.group       && { group:        usersState.group }),
      ...(usersState.department  && { department:   usersState.department }),
      ...(usersState.active !== '' && { active:     usersState.active }),
    });

    const { users, total, exported_at } = await api.get(`/settings/users-export?${q}`);

    if (!users || !users.length) {
      toast('Nenhum usuário encontrado com os filtros aplicados', 'error');
      return;
    }

    const title         = document.getElementById('pdf-title').value.trim() || 'Relatório de Usuários WiFi';
    const showPasswords = document.getElementById('pdf-show-password').checked;
    const usePassword   = document.getElementById('pdf-use-password').checked;
    const pdfPassword   = document.getElementById('pdf-password').value;

    if (usePassword && pdfPassword.length < 4) {
      toast('A senha do PDF deve ter ao menos 4 caracteres', 'error');
      return;
    }

    // Coleta as senhas se solicitado
    let passwordMap = {};
    if (showPasswords) {
      const pwData = await api.get(`/settings/users-export?${q}&include_password=1`).catch(() => null);
      if (pwData?.users) {
        pwData.users.forEach(u => { if (u.password) passwordMap[u.username] = u.password; });
      }
    }

    _buildPdf({ users, title, total, exported_at, showPasswords, passwordMap, usePassword, pdfPassword, selectedCols });

    closeModal('modal-export-pdf');
    toast(`PDF gerado com ${total} usuário(s)`, 'success');

  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg><use href="#ic-download"/></svg> Gerar PDF';
  }
}

function _buildPdf({ users, title, total, exported_at, showPasswords, passwordMap, usePassword, pdfPassword, selectedCols }) {
  const { jsPDF } = window.jspdf;

  const encryptionOptions = usePassword && pdfPassword ? {
    userPassword: pdfPassword,
    ownerPassword: pdfPassword,
    userPermissions: ['print'],
  } : undefined;

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    ...(encryptionOptions ? { encryption: encryptionOptions } : {}),
  });

  const pageW = doc.internal.pageSize.getWidth();
  const now   = new Date(exported_at).toLocaleString('pt-BR');

  // ─── Cabeçalho ───────────────────────────────────────────────
  doc.setFillColor(99, 102, 241);
  doc.rect(0, 0, pageW, 18, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 10, 11);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Exportado em: ${now}  |  Total: ${total} usuário(s)`, pageW - 10, 11, { align: 'right' });

  if (usersState.search || usersState.group || usersState.department || usersState.active !== '') {
    const filters = [
      usersState.search      && `Busca: "${usersState.search}"`,
      usersState.group       && `Grupo: ${usersState.group}`,
      usersState.department  && `Depto: ${usersState.department}`,
      usersState.active !== '' && `Status: ${usersState.active === '1' ? 'Ativos' : 'Inativos'}`,
    ].filter(Boolean).join('  |  ');
    doc.text(`Filtros: ${filters}`, 10, 16);
  }

  doc.setTextColor(0, 0, 0);

  // ─── Colunas dinâmicas ────────────────────────────────────────
  const columns = [
    { header: 'Usuário', dataKey: 'username' }, // sempre incluído
  ];

  if (selectedCols.fullname)   columns.push({ header: 'Nome completo',  dataKey: 'full_name'   });
  if (showPasswords)           columns.push({ header: 'Senha',          dataKey: 'password'    });
  if (selectedCols.email)      columns.push({ header: 'E-mail',         dataKey: 'email'       });
  if (selectedCols.phone)      columns.push({ header: 'Telefone',       dataKey: 'phone'       });
  if (selectedCols.department) columns.push({ header: 'Departamento',   dataKey: 'department'  });
  if (selectedCols.group)      columns.push({ header: 'Grupo / VLAN',   dataKey: 'group'       });
  if (selectedCols.status)     columns.push({ header: 'Status',         dataKey: 'status'      });
  if (selectedCols.simconn)    columns.push({ header: 'Conex. Sim.',    dataKey: 'sim_conn'    });
  if (selectedCols.expires)    columns.push({ header: 'Expira em',      dataKey: 'expires_at'  });
  if (selectedCols.created_at) columns.push({ header: 'Criado em',      dataKey: 'created_at'  });
  if (selectedCols.created_by) columns.push({ header: 'Criado por',     dataKey: 'created_by'  });

  const rows = users.map(u => {
    const row = {
      username:   u.username,
      full_name:  u.full_name || '—',
      email:      u.email || '—',
      phone:      u.phone || '—',
      department: u.department || '—',
      group:      u.groupname ? `${u.groupname}${u.vlan_id ? ` (VLAN ${u.vlan_id})` : ''}` : '—',
      status:     u.active ? 'Ativo' : 'Inativo',
      sim_conn:   u.simultaneous_connections ? String(u.simultaneous_connections) : 'Ilim.',
      expires_at: u.expires_at ? new Date(u.expires_at).toLocaleDateString('pt-BR') : 'Nunca',
      created_at: new Date(u.created_at).toLocaleDateString('pt-BR'),
      created_by: u.created_by || '—',
    };
    if (showPasswords) row.password = passwordMap[u.username] || '—';
    return row;
  });

  doc.autoTable({
    startY: 22,
    columns,
    body: rows,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      overflow: 'linebreak',
      font: 'helvetica',
    },
    headStyles: {
      fillColor: [30, 34, 54],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: [245, 246, 252],
    },
    columnStyles: {
      username:  { fontStyle: 'bold', font: 'courier', fontSize: 7.5 },
      status:    { halign: 'center' },
      sim_conn:  { halign: 'center' },
    },
    willDrawCell: (data) => {
      if (data.section === 'body' && data.column.dataKey === 'status') {
        data.cell.styles.fillColor = data.cell.raw === 'Ativo' ? [16, 185, 129] : [239, 68, 68];
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = 'bold';
      }
    },
    margin: { top: 22, left: 10, right: 10 },
    didDrawPage: (data) => {
      const pageCount = doc.internal.getNumberOfPages();
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Página ${data.pageNumber} de ${pageCount}  —  Radius Manager`,
        pageW / 2, doc.internal.pageSize.getHeight() - 5,
        { align: 'center' }
      );
    },
  });

  const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const dateStr   = new Date().toISOString().slice(0, 10);
  doc.save(`${safeTitle}_${dateStr}.pdf`);
}
