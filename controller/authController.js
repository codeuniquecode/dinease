const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../model/userSchema');
const { envConfig } = require('../config/envConfig');

exports.renderLogin = (req, res) => {
    // If already logged in, redirect to their dashboard
    if (req.session?.token) {
        return res.redirect('/');
    }
    res.render('auth/login', { flashMessage: req.flash() });
};

exports.renderRegister = (req, res) => {
    res.render('auth/register', { flashMessage: req.flash() });
};

exports.login = async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email, isActive: true });
        if (!user) {
            req.flash('error', 'Invalid email or password');
            return res.redirect('/login');
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            req.flash('error', 'Invalid email or password');
            return res.redirect('/login');
        }

        const token = jwt.sign({ id: user._id }, envConfig.secretKey, { expiresIn: '1d' });

        // Store token in SERVER-SIDE session (not just cookie)
        // This means each browser tab/window has its own session
        req.session.token = token;
        req.session.userId = user._id.toString();
        req.session.userRole = user.role;

        // Cookie with 'lax' so eSewa cross-site redirect doesn't kill the session
        res.cookie('token', token, {
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000
        });

        const redirectMap = {
            admin:    '/admin/dashboard',
            waiter:   '/waiter/dashboard',
            kitchen:  '/kitchen/display',
            customer: '/'
        };
        req.flash('success', `Welcome back, ${user.name}!`);
        return res.redirect(redirectMap[user.role] || '/');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Login failed. Try again.');
        return res.redirect('/login');
    }
};

exports.register = async (req, res) => {
    const { name, email, password, phone } = req.body;
    try {
        // Server-side email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email.trim())) {
            req.flash('error', 'Please enter a valid email address');
            return res.redirect('/register');
        }
        // Phone validation — 10 digits Nepal
        const phoneRegex = /^[0-9]{10}$/;
        if (!phone || !phoneRegex.test(phone.trim())) {
            req.flash('error', 'Phone number must be exactly 10 digits');
            return res.redirect('/register');
        }
        // Password length
        if (!password || password.length < 6) {
            req.flash('error', 'Password must be at least 6 characters');
            return res.redirect('/register');
        }
        // Name
        if (!name || name.trim().length < 2) {
            req.flash('error', 'Please enter your full name');
            return res.redirect('/register');
        }

        const exists = await User.findOne({ email: email.trim().toLowerCase() });
        if (exists) {
            req.flash('error', 'An account with this email already exists');
            return res.redirect('/register');
        }
        const hashed = await bcrypt.hash(password, 10);
        const user = new User({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            password: hashed,
            phone: phone.trim(),
            role: 'customer'
        });
        await user.save();
        req.flash('success', 'Account created successfully! Please login.');
        return res.redirect('/login');
    } catch (err) {
        req.flash('error', 'Registration failed: ' + err.message);
        return res.redirect('/register');
    }
};

exports.logout = (req, res) => {
    // Destroy SESSION (this is the key fix — each tab has own session)
    req.session.destroy((err) => {
        if (err) console.error('Session destroy error:', err);
        res.clearCookie('token');
        res.clearCookie('connect.sid'); // express-session cookie
        res.redirect('/login');
    });
};
