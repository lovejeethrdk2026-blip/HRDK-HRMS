// Wraps an async controller so a thrown error or rejected promise goes to the
// error middleware (middleware/errorHandler.js) instead of each controller
// needing its own try/catch.
function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export { asyncHandler };
