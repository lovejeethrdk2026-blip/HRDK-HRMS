// Last two middleware in server.js: a JSON 404 for unknown routes, then the
// one place every error from a controller (via utils/asyncHandler.js) or from
// express.json() ends up.

function notFound(req, res) {
  res.status(404).json({ message: `Not found: ${req.method} ${req.originalUrl}` });
}

// `next` is unused but must stay: Express spots error middleware by its 4 arguments.
function errorHandler(error, req, res, next) {
  // Failed mid-stream (e.g. while writing a PDF): the status is already sent,
  // ending the response is all that is left to do.
  if (res.headersSent) return res.end();

  // HttpError, and body-parser's own errors (bad JSON, body too large).
  const status = error.status || error.statusCode;
  if (status >= 400 && status < 500) {
    return res.status(status).json({ message: error.message });
  }

  if (error.name === "ValidationError") {
    return res.status(400).json({ message: error.message });
  }
  if (error.name === "CastError") {
    return res.status(400).json({ message: `Invalid ${error.path}` });
  }

  console.error(`${req.method} ${req.originalUrl} failed:`, error);
  // Details (database names, file paths) stay in the server log.
  res.status(status || 500).json({ message: "Something went wrong. Please try again." });
}

export { notFound, errorHandler };
