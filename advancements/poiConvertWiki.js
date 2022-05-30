const fs = require('fs')
const pois = require('./out/pois.json')
const lines = ['==List of Known POIs ==',
  '{| class="sortable fandom-table"',
  '!Name',
  '!Region',
  '!Sub-Region',
  '!Coordinates',
  '|-'
]

for (const [, poi] of Object.entries(pois)) {
  const poiName = `|[[${poi.name}]]` // name is a link
  lines.push(poiName)
  const regionName = `|[[${poi.shard}]]` // region is a link
  lines.push(regionName)
  const subRegionName = `|${poi.region}` // sub-region is not a link
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
fs.writeFileSync('./poiTable.txt', output)
