require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const morgan       = require('morgan');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const path         = require('path');
const { testConnection } = require('./db/connection');

const app = express();

// ─── Segurança ────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // desabilitado para o frontend inline
}));

// Rate limit no login: 10 tentativas por 15 minutos por IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit geral na API: 300 req/min por IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: { error: 'Muitas requisições. Tente novamente em breve.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Middlewares ──────────────────────────────────────────────
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use('/api', apiLimiter);

// ─── API Routes ───────────────────────────────────────────────
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/users',     require('./routes/users'));
app.use('/api/groups',    require('./routes/groups'));
app.use('/api/nas',       require('./routes/nas'));
app.use('/api/settings',  require('./routes/settings'));
app.use('/api/dashboard', require('./routes/dashboard'));

// ─── Serve Frontend (produção) ────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
  }
});

// ─── Error handler ────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// ─── Start ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
testConnection().then(() => {
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`🚀 Radius Manager rodando na porta ${PORT} (somente localhost)`);
  });
});
