const fs = require("fs");

/**
 * Zod request-body validator middleware factory.
 * On success, replaces req.body with the parsed (stripped/coerced) data.
 * If multer already saved a file and validation fails, the file is safely unlinked.
 * Forwards parsed.error (ZodError) to the central Express errorHandler.
 */
function validate(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      if (req.file?.path) {
        fs.unlink(req.file.path, () => {});
      }
      return next(parsed.error);
    }
    req.body = parsed.data;
    next();
  };
}

module.exports = validate;
