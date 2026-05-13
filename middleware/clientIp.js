export const getClientIp = (req) => {
  const forwardedFor = req.headers['x-forwarded-for'];
  const forwardedIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const firstForwardedIp = forwardedIp?.split(',')[0]?.trim();

  return firstForwardedIp || req.ip || req.socket.remoteAddress || 'unknown';
};
