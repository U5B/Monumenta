const fs = require('fs')
const pois = require('./out/pois.json')
const lines = ['==List of Known POIs ==',
  '{| class="sortable fandom-table"',
  '!Name',
  '!Region',
  '!Sub-Region',
  '! colspan="3" | Coordinates',
  '|-'
]

for (const [name, poi] of Object.entries(pois)) {
  const poiName = `|[[${poi.name}]]`
  lines.push(poiName)
  const regionName = `|[[${poi.shard}]]`
  lines.push(regionName)
  const subRegionName = `|${poi.region}`
  lines.push(subRegionName)
  if (poi.coordinates == null) {
    poi.coordinates = {
      x: null,
      y: null,
      z: null
    }
  }
  const x = `|<nowiki>${poi.coordinates.x}</nowiki>`
  lines.push(x)
  const y = `|<nowiki>${poi.coordinates.y}</nowiki>`
  lines.push(y)
  const z = `|<nowiki>${poi.coordinates.z}</nowiki>`
  lines.push(z)
  const seperator = '|-'
  lines.push(seperator)
}
lines.pop()
lines.push('|}')
const output = lines.join('\n')
fs.writeFileSync('./poiTable.txt', output)
