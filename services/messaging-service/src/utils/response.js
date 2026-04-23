// Shared response formatter — matches Group 3 agreed API standard:
// { status: "success"|"error", data: {...}|null, error: {code, message}|null }

function success(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    status: 'success',
    data,
    error: null,
  });
}

function error(res, statusCode, code, message) {
  return res.status(statusCode).json({
    status: 'error',
    data: null,
    error: { code, message },
  });
}

module.exports = { success, error };