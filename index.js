const boxers = require('./scan/boxers.js')
const files = require('./scan/files.js')
const matches = require('./scan/matches.js')

module.exports = {
  scan: async (catalog) => {
    console.log('[boxing-scanner]', 'scanning matches')
    const matchFiles = await files.scan(catalog)
    const boxerList = await boxers.scan(matchFiles)
    const matchList = await matches.scan(matchFiles)
    catalog.boxing = {
      files: matchFiles,
      boxers: boxerList,
      matches: matchList
    }
  },
  load: async (catalog) => {
    // console.log('[indexer]', 'indexing match information')
    // await matches.indexMatches(catalog)
    // console.log('[indexer]', 'indexing boxers information')
    // await boxers.indexBoxers(catalog)
    // console.log('[indexer]', 'indexing divisions information')
    // await divisions.indexDivisions(catalog)
    // console.log('[indexer]', 'indexing organizations information')
    // await organizations.indexOrganizations(catalog)
    // catalog.api.boxing = {
    //   boxers: {
    //     get: require('./api/matches.get.js'),
    //     list: require('./api/matches.list.js')
    //   },
    //   matches: {
    //     get: require('./api/tracks.get.js'),
    //     list: require('./api/organizations.list.js')
    //   }
    // }
    // return catalog
  }
}
