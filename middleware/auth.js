const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const User = require('../model/userSchema');
const { envConfig } = require('../config/envConfig');

// Strict auth — must be logged in
exports.isAuthenticated = async (req, res, next) => {
    // Read token from session first (more secure), fallback to cookie
    const token = req.session?.token || req.cookies.token;
    if (!token) {
        req.flash('error', 'Please login first');
        return res.redirect('/login');
    }
    try {
        const decoded = await promisify(jwt.verify)(token, envConfig.secretKey);
        const user = await User.findById(decoded.id);
        if (!user || !user.isActive) {
            req.flash('error', 'Session expired. Please login again.');
            return res.redirect('/login');
        }
        req.user = user;
        req.userId = user._id;
        next();
    } catch (err) {
        // Token invalid — clear both session and cookie
        if (req.session) req.session.token = null;
        res.clearCookie('token');
        req.flash('error', 'Session expired. Please login again.');
        return res.redirect('/login');
    }
};

// Soft auth — sets req.user if logged in, continues anyway
exports.isLoggedIn = async (req, res, next) => {
    // Handle session-stored flash from eSewa cross-site redirect
    if (req.session?.flashSuccess) {
        req.flash('success', req.session.flashSuccess);
        delete req.session.flashSuccess;
    }
    if (req.session?.flashError) {
        req.flash('error', req.session.flashError);
        delete req.session.flashError;
    }

    const token = req.session?.token || req.cookies.token;
    if (!token) {
        res.locals.currentUser = null;
        req.user = null;
        return next();
    }
    try {
        const decoded = await promisify(jwt.verify)(token, envConfig.secretKey);
        const user = await User.findById(decoded.id);
        if (!user || !user.isActive) {
            res.locals.currentUser = null;
            req.user = null;
            return next();
        }
        res.locals.currentUser = user;
        req.user = user;
        req.userId = user?._id;
        next();
    } catch {
        res.locals.currentUser = null;
        req.user = null;
        next();
    }
};

// Role-based access
exports.requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            req.flash('error', 'Please login first');
            return res.redirect('/login');
        }
        if (!roles.includes(req.user.role)) {
            req.flash('error', 'Access denied.');
            return res.redirect('/');
        }
        next();
    };
};
