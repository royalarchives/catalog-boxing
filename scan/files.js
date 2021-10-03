const filenameWords = [ 'darksport', 'sample', 'punch[eztv]', 'mkv', 'mp4', 'msd[eztv]', 'hdtv', 'ppv', 'msd', 'punch', 'plutonium', 'verum', 'web', '[tgx]', 'megusta', 'ali', 'full', 'card', 'hevc', 'aac', 'h264', 'x265', 'x264', '480p', '720p', '1080p' ]
const spellingFixes = {
  'derek chisora': 'dereck chisora',
  'samuel vegas': 'samuel vargas',
  'floyd mayweather': 'floyd mayweather jr.'
}

module.exports = {
  scan
}

async function scan (catalog) {
  const matches = []
  await scanFiles(catalog.children, matches)
  return matches
}

async function scanFiles (files, matches) {
  for (const file of files) {
    if (file.children) {
      await scanFiles(file.children, matches)
      continue
    }
    if (file.extension !== 'mkv' && file.extension !== 'mp4') {
      continue
    }
    const name = file.name.toLowerCase()
    if (name.indexOf('boxing') !== 0) {
      continue
    }
    // try and extract a date
    let date
    for (let year=1800, len = new Date().getFullYear() + 1; year < len; year++) {
      const nameIndex = name.indexOf(year)
      if (nameIndex === -1) {
        continue
      }
      const parts = name.split(' ').join('.').split('-').join('.').split('.')
      parts.shift()
      parts.pop()
      for (const i in parts) {
        const n = parseInt(i, 10)
        if (parts[n] === year.toString()) {
          try {
            const month = parts[n + 1]
            if (month.length < 3) {
              const day = parts[n + 2]
              if (day.length < 3) {
                date = new Date(year, month - 1, day)
                parts.splice(i, 3)
                break
              }
            }
          } catch (error) {
          }
        }
      }
      // try and filter out everything but name vs name
      for (const word of filenameWords) {
        const index = parts.indexOf(word)
        if (index > -1) {
          parts.splice(index, 1)
        }
      }
      const vsIndex = parts.indexOf('vs') || parts.indexOf('v')
      let boxer1 = parts.slice(0, vsIndex).join(' ')
      if (boxer1.toLowerCase().endsWith(' jr') || boxer1.toLowerCase().endsWith(' sr')) {
        boxer1 += '.'
      }
      let boxer2 = parts.slice(vsIndex + 1).join(' ')
      if (boxer2.toLowerCase().endsWith(' jr') || boxer2.toLowerCase().endsWith(' sr')) {
        boxer2 += '.'
      }
      // spelling corrections for filenames
      for (const misspelling in spellingFixes) {
        if (boxer1 === misspelling) {
          boxer1 = boxer1.replace(misspelling, spellingFixes[misspelling])
        }
        if (boxer2 === misspelling) {
          boxer2 = boxer2.replace(misspelling, spellingFixes[misspelling])
        }
      }
      file.boxing = {
        boxer1,
        boxer2,
        date
      }
      matches.push(file)
    }
  }
}
