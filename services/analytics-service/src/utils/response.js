function success(res, data, statusCode = 200) {
  return res.status(statusCode).json({ status: 'success', data });
}

function error(res, statusCode, code, message) {
  return res.status(statusCode).json({
    status: 'error', data: null, error: { code, message },
  });
}

module.exports = { success, error };