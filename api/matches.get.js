module.exports = (catalog, options) => {
  const match = catalog.getObject(options.id)
  if (!match) {
    throw new Error('invalid-id')
  }
  return match
}
