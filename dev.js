(async () => {
  const Catalog = require('@royalarchives/catalog')
  const CatalogBoxing = require('./index.js')
  await Catalog.scan([], process.env.CATALOG_PATH.split(','))
  const catalog = await Catalog.load([], process.env.CATALOG_PATH.split(','))
  console.log('catalog', catalog)
  await CatalogBoxing.scan(catalog)
  console.log('finished', catalog.boxing)
  return process.exit(0)
})()
