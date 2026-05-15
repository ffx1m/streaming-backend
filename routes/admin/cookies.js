export const getAdminCookieOptions = ({ httpOnly = true } = {}) => {
  const sameSite = process.env.ADMIN_COOKIE_SAMESITE || 'lax';
  const secure = process.env.NODE_ENV === 'production' || sameSite.toLowerCase() === 'none';

  return {
    httpOnly,
    secure,
    sameSite,
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  };
};

export const getClearAdminCookieOptions = (options = {}) => {
  const { maxAge, ...clearOptions } = getAdminCookieOptions(options);
  return clearOptions;
};
