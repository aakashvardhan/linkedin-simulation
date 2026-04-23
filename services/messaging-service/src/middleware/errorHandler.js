// FIXED: Uses the agreed Group 3 response format
const errorHandler = (err, req, res, next) => {
  console.error(`[Error] ${err.message}`, err.stack);
  const statusCode = err.statusCode || 500;
  return res.status(statusCode).json({
    status: 'error',
    data: null,
    error: {
      code: statusCode,
      message: err.message || 'Internal server error',
    },
  });
};

module.exports = errorHandler;