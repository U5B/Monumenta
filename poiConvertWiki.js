const { Console } = require('console')
const fs = require('fs')
const poisPath = './out/pois.json'
const pois = require(poisPath)
const lines = ['==List of Known POIs ==',
  '{| class="sortable wikitable"',
  '!Name',
  '!Region',
  '!Sub-Region',
  '!Coordinates',
  '|-'
]
console.log(`Converting pois to wiki format...`)
for (const [, poi] of Object.entries(pois.pois)) {
  // name is a link
  const poiName = `|[[${poi.name}]]`
  lines.push(poiName)
   // region is a link
  const regionName = `|[[${poi.shard}]]`
  lines.push(regionName)
  // sub-region is not a link
  let subRegionName = `|${poi.region}`
  if (poi.subregion) subRegionName = `|<nowiki>${poi.region} | ${poi.subregion}</nowiki>` // sometimes there is a subregion, sometimes not
  lines.push(subRegionName)
  // The Minefield doesn't have coordinates
  if (poi.coordinates == null) {
    poi.coordinates = {
      x: null,
      y: null,
      z: null
    }
  }
  //  tags are required to prevent the wiki parser from interpreting negative coordinates
  const x = `${poi.coordinates.x}`
  const y = `${poi.coordinates.y}`
  const z = `${poi.coordinates.z}`
  const coordinates = `|<nowiki>(${x}, ${y}, ${z})</nowiki>` // coordinates is one line for easy copying
  lines.push(coordinates)
  const seperator = '|-'
  lines.push(seperator)
}

// remove ending seperator
lines.pop()
lines.push('|}')
const output = lines.join('\n')
console.log('Writing to file...')
fs.writeFileSync('./poiTable.txt', output)
console.log('Finished!')
