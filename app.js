const express = require('express');
const app = express();
const http = require('http');
const { Server } = require('socket.io');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const path = require('path');
require('dotenv').config();

const connectDB = require('./config/db');
const { envConfig } = require('./config/envConfig');
const routes = require('./routes/index');

// Connect DB
connectDB();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(methodOverride('_method'));
app.use(session({
    secret: envConfig.secretKey,
    resave: false,
    saveUninitialized: false
}));
app.use(flash());

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/storage', express.static(path.join(__dirname, 'storage')));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Make currentUser available in all views via isLoggedIn middleware
const { isLoggedIn } = require('./middleware/auth');
app.use(isLoggedIn);

// Routes
app.use('/', routes);

// 404 handler
app.use((req, res) => {
    res.status(404).render('error', { message: 'Page not found', code: 404 });
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', { message: 'Internal server error', code: 500 });
});

// Create HTTP server + Socket.io
const server = http.createServer(app);
const io = new Server(server);

// Make io accessible in controllers via req.app.get('io')
app.set('io', io);

// Socket.io events
io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('join', ({ role }) => {
        if (role === 'kitchen') socket.join('kitchen');
        if (role === 'waiter') socket.join('waiter');
        if (role === 'admin') { socket.join('kitchen'); socket.join('waiter'); }
        console.log(`Socket ${socket.id} joined as ${role}`);
    });

    socket.on('disconnect', () => {
        console.log(`Socket disconnected: ${socket.id}`);
    });
});

const PORT = envConfig.port || 3000;
server.listen(PORT, async () => {
    console.log(`\n Project is running on http://localhost:${PORT}`);
    // Clean expired reservations on start + every hour
    const cleanExpiredReservations = require('./services/reservationCleaner');
    await cleanExpiredReservations();
    setInterval(cleanExpiredReservations, 60 * 60 * 1000);
});

module.exports = { app, io };
