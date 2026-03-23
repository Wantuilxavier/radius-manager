// ─── EXPORTAR USUÁRIOS — PDF ──────────────────────────────────

function openExportPdfModal() {
  document.getElementById('pdf-title').value = 'Relatório de Usuários WiFi';
  document.getElementById('pdf-show-password').checked = false;
  document.getElementById('pdf-use-password').checked   = false;
  document.getElementById('pdf-password').value         = '';
  document.getElementById('pdf-password-wrap').style.display = 'none';
  document.getElementById('btn-generate-pdf').disabled  = false;
  document.getElementById('btn-generate-pdf').innerHTML = '<svg><use href="#ic-download"/></svg> Gerar PDF';
  openModal('modal-export-pdf');
}

async function generateUsersPdf() {
  const btn = document.getElementById('btn-generate-pdf');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Gerando…';

  try {
    // Coleta os filtros atuais da listagem de usuários
    const q = new URLSearchParams({
      limit: 9999,
      ...(usersState.search && { search: usersState.search }),
      ...(usersState.group  && { group:  usersState.group  }),
      ...(usersState.active !== '' && { active: usersState.active }),
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

    // Coleta as senhas se solicitado (busca individual — somente se habilitado)
    let passwordMap = {};
    if (showPasswords) {
      // As senhas vêm do radcheck — fazemos um batch fetch via endpoint de export
      // que já tem as senhas nos dados (precisamos buscá-las via endpoint de usuário)
      // Para não sobrecarregar, buscamos via radcheck no backend de export
      const pwData = await api.get(`/settings/users-export?${q}&include_password=1`).catch(() => null);
      if (pwData?.users) {
        pwData.users.forEach(u => { if (u.password) passwordMap[u.username] = u.password; });
      }
    }

    _buildPdf({ users, title, total, exported_at, showPasswords, passwordMap, usePassword, pdfPassword });

    closeModal('modal-export-pdf');
    toast(`PDF gerado com ${total} usuário(s)`, 'success');

  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg><use href="#ic-download"/></svg> Gerar PDF';
  }
}

function _buildPdf({ users, title, total, exported_at, showPasswords, passwordMap, usePassword, pdfPassword }) {
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

  if (usersState.search || usersState.group || usersState.active !== '') {
    const filters = [
      usersState.search  && `Busca: "${usersState.search}"`,
      usersState.group   && `Grupo: ${usersState.group}`,
      usersState.active !== '' && `Status: ${usersState.active === '1' ? 'Ativos' : 'Inativos'}`,
    ].filter(Boolean).join('  |  ');
    doc.text(`Filtros: ${filters}`, 10, 16);
  }

  doc.setTextColor(0, 0, 0);

  // ─── Tabela ───────────────────────────────────────────────────
  const columns = [
    { header: 'Usuário',       dataKey: 'username'    },
    { header: 'Nome completo', dataKey: 'full_name'   },
    { header: 'Departamento',  dataKey: 'department'  },
    { header: 'Grupo / VLAN',  dataKey: 'group'       },
    { header: 'Status',        dataKey: 'status'      },
    { header: 'Conexões Sim.', dataKey: 'sim_conn'    },
    { header: 'Expira em',     dataKey: 'expires_at'  },
    { header: 'Criado em',     dataKey: 'created_at'  },
  ];

  if (showPasswords) {
    columns.splice(1, 0, { header: 'Senha', dataKey: 'password' });
  }

  const rows = users.map(u => {
    const row = {
      username:   u.username,
      full_name:  u.full_name || '—',
      department: u.department || '—',
      group:      u.groupname ? `${u.groupname}${u.vlan_id ? ` (VLAN ${u.vlan_id})` : ''}` : '—',
      status:     u.active ? 'Ativo' : 'Inativo',
      sim_conn:   u.simultaneous_connections ? String(u.simultaneous_connections) : 'Ilim.',
      expires_at: u.expires_at ? new Date(u.expires_at).toLocaleDateString('pt-BR') : 'Nunca',
      created_at: new Date(u.created_at).toLocaleDateString('pt-BR'),
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
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.dataKey === 'status') {
        const val = data.cell.raw;
        doc.setFillColor(val === 'Ativo' ? 16 : 239, val === 'Ativo' ? 185 : 68, val === 'Ativo' ? 129 : 68);
      }
    },
    margin: { top: 22, left: 10, right: 10 },
    didDrawPage: (data) => {
      // Rodapé com número de página
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
