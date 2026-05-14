import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export const getCookieValue = (cookieHeader, name) => {
  if (!cookieHeader) return undefined;

  return cookieHeader
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.slice(name.length + 1);
};

const timingSafeEqual = (left, right) => {
  if (typeof left !== 'string' || typeof right !== 'string') return false;

  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export const protectAdmin = (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) {
    token = getCookieValue(req.headers.cookie, 'admin_token');
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized to access this route' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

export const requireAdminCsrf = (req, res, next) => {
  const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
  if (safeMethods.has(req.method)) {
    return next();
  }

  const csrfHeader = req.get('x-csrf-token');
  const csrfCookie = getCookieValue(req.headers.cookie, 'admin_csrf');
  const csrfClaim = req.admin?.csrfToken;

  if (
    !csrfHeader ||
    !csrfCookie ||
    !csrfClaim ||
    !timingSafeEqual(csrfHeader, csrfCookie) ||
    !timingSafeEqual(csrfHeader, csrfClaim)
  ) {
    return res.status(403).json({ success: false, message: 'Invalid CSRF token' });
  }

  next();
};
