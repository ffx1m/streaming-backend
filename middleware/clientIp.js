export const getClientIp = (req) => {
  return req.ip || req.socket?.remoteAddress || 'unknown';
};
