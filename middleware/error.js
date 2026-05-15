export const errorHandler = (err, req, res, next) => {
  console.error(`[Error] ${req.method} ${req.path}:`, err.stack);
  const statusCode = err.statusCode || 500;
  const isServerError = statusCode >= 500;
  const message = process.env.NODE_ENV === 'production' && isServerError
    ? 'Server Error'
    : err.message || 'Server Error';

  res.status(statusCode).json({
    success: false,
    message
  });
};

export const notFound = (req, res, next) => {
  res.status(404).json({ success: false, message: 'Resource not found' });
};
