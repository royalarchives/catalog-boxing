module.exports = (catalog, options) => {
  const boxer = catalog.getObject(options.id)
  if (!boxer) {
    throw new Error('invalid-id')
  }
  return boxer
}
