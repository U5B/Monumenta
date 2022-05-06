// This program extracts POI data from Monumenta's advancement data.
// Data required: POI name, region, subregion, coordinates

const axios = require('axios').default
const fs = require('fs')

let advancements
const regex = {
  coordinates: /^x=(-?\d{1,5}) y=(-?\d{1,5}) z=(-?\d{1,5})$/, // $1 = x, $2 = y, $3 = z
  poi: {
    shard: /^monumenta:pois\/([0-9a-zA-Z-_.]+)\/root$/, // $1 = shard
    region: /^monumenta:pois\/([0-9a-zA-Z-_.]+)\/([0-9a-zA-Z-_.]+)\/root$/, // $1 = shard, $2 = region
    subregion: /^monumenta:pois\/([0-9a-zA-Z-_.]+)\/([0-9a-zA-Z-_.]+)\/([0-9a-zA-Z-_.]+)\/root$/, // $1 = shard, $2 = region, $3 = subregion
    short: /^monumenta:pois\/([0-9a-zA-Z-_.]+)\/([0-9a-zA-Z-_.]+)\/((?!root)[0-9a-zA-Z-_.]+)$/, // $3 != 'root'
    long: /^monumenta:pois\/([0-9a-zA-Z-_.]+)\/([0-9a-zA-Z-_.]+)\/([0-9a-zA-Z-_.]+)\/((?!root)[0-9a-zA-Z-_.]+)$/, // $4 != 'root'
    suffix: /^(.+) Exploration$/ // ignore suffix Exploration from end of region
  },
  dungeon: {
    path: /^monumenta:dungeons\/([0-9a-zA-Z-_.]+)\/find$/, // dungeon path
    prefix: /^Found (.+)/ // ignore prefix 'Found' in dungeon titles
  },
  quest: {
    path: /^monumenta:quests\/([0-9a-zA-Z-_.]+)\/((?!root)[0-9a-zA-Z-_.]+)$/, // $1 = region, $2 = quest && $2 != 'root'
    city: /^Discover the (.+)$/,
    ignore: /^(.+) Quests$/
  },
  handbook: {
    enchantments: /^monumenta:handbook\/enchantments\/([0-9a-zA-Z-_.]+)$/
  }
}
const converter = {
  poi: {},
  quest: {},
  handbook: {}
}
const pois = {}
const dungeons = {}
const quests = {}

async function fetchAdvancements () {
  if (fs.existsSync('./advancement.json')) {
    console.log('[FILE] Loading advancements from existing file...')
    advancements = require('./advancement.json')
    return
  }
  console.log('[API] Fetching advancements from Monumenta API')
  const response = await axios.get('https://api.playmonumenta.com/advancements')
  if (response.status !== 200) throw Error(`Monumenta API returned: ${response.status} with ${response.statusText}`)
  advancements = response.data
  console.log('[FILE] Writing advancements to file...')
  fs.writeFileSync('./advancement.json', JSON.stringify(advancements, null, 2))
}

function generate () {
  console.log('[CONVERTER] Mapping paths to names...')
  for (const advancement of Object.values(advancements)) {
    if (advancement.id.startsWith('monumenta:pois')) convertPoi(advancement) // parse poi regions
    else if (advancement.id.startsWith('monumenta:handbook')) convertHandbook(advancement)
    // else if (advancement.id.startsWith('monumenta:quest')) convertQuest(advancement)
  }
  console.log('[CONVERTER] Done.')

  console.log('[PARSER] Parsing POI & Advancement data...')
  for (const advancement of Object.values(advancements)) {
    if (advancement.id.startsWith('monumenta:pois')) parseAdvancement(advancement, { type: 'poi' }) // parse pois
    else if (advancement.id.startsWith('monumenta:dungeons')) parseAdvancement(advancement, { type: 'dungeon' }) // parse dungeons
    else if (advancement.id.startsWith('monumenta:quest')) parseAdvancement(advancement, { type: 'quest' })
  }
  console.log('[PARSER] Done.')
  console.log('[FILE] Writing POI data to file...')
  fs.writeFileSync('./pois.json', JSON.stringify(pois, null, 2))
  console.log('[FILE] Writing Dungeon data to file...')
  fs.writeFileSync('./dungeons.json', JSON.stringify(dungeons, null, 2))
  console.log('[FILE] Writing Quest data to file...')
  fs.writeFileSync('./quests.json', JSON.stringify(quests, null, 2))
}

function convertPoi (advancement) {
  const id = advancement.id
  const data = advancement?.display
  let title = data.title.text
  switch (true) {
    // poi converter paths
    case regex.poi.shard.test(id): { // monumenta:pois/r1/root
      const [, region] = regex.poi.shard.exec(id)
      if (!converter.poi[region]) converter.poi[region] = {}
      title = title.replace(regex.poi.suffix, '$1') // remove Exploration at end of string
      converter.poi[region].name = title
      break
    }
    case regex.poi.region.test(id): { // monumenta:pois/r1/jungle/root
      const [, region, subregion] = regex.poi.region.exec(id)
      if (!converter.poi[region]) converter.poi[region] = {}
      if (!converter.poi[region][subregion]) converter.poi[region][subregion] = {}
      converter.poi[region][subregion].name = title
      break
    }
    case regex.poi.subregion.test(id): { // monumenta:pois/r1/jungle/south/root
      const [, region, subregion, subsubregion] = regex.poi.subregion.exec(id)
      if (!converter.poi[region]) converter.poi[region] = {}
      if (!converter.poi[region][subregion]) converter.poi[region][subregion] = {}
      if (!converter.poi[region][subregion][subsubregion]) converter.poi[region][subregion][subsubregion] = {}
      converter.poi[region][subregion][subsubregion].name = title
      break
    }
  }
}

function convertQuest (advancement) {
  const id = advancement.id
  const data = advancement?.display
  const title = data.title
  console.log(`${advancement.id} || ${advancement.parent}`)
}

function convertHandbook (advancement) {
  const id = advancement.id
  const data = advancement?.display
  let title = data.title
  let description = data.description
  if (!title || !description) return
  if (!Array.isArray(title)) title = [title]
  if (!Array.isArray(description)) description = [description]

  const titlePrint = joinText(title)
  // console.log(`${advancement.id} || ${titlePrint}`)
}

function parseAdvancement (advancement, options = { type: '' }) {
  const id = advancement.id
  const display = advancement?.display

  // null checking
  if (!display) return
  let title = display.title
  let description = display.description
  if (!title || !description) return
  if (!Array.isArray(title)) title = [title] // titles can have multiple lines
  if (!Array.isArray(description)) description = [description] // description can have multiple lines
  const option = { id, display, title, description }
  switch (options.type) {
    case 'poi': {
      parsePoi(option)
      break
    }
    case 'dungeon': {
      parseDungeon(option)
      break
    }
    case 'quest': {
      parseQuest(option)
      break
    }
  }
}

function parsePoi ({ id, display, title, description }) {
  title = joinText(title) // make title into one line
  // check if advancement has a valid path
  const longPoi = regex.poi.long.test(id)
  const shortPoi = regex.poi.short.test(id)
  if ((longPoi || shortPoi) === false) return
  // POIs can sometimes not have coordinates
  if (!description[3]?.text) console.error(`[POI] '${title}' missing coordinates | advancement: '${id}'`)
  // generate poi information
  const data = { name: title.trim(), shard: '', region: '', subregion: '', coordinates: { x: '0', y: '0', z: '0' } }
  if (longPoi) { // monumenta:pois/r1/jungle/south/poi1
    const [, shard, region, subregion] = regex.poi.long.exec(id)
    data.shard = converter.poi[shard].name
    data.region = converter.poi[shard][region].name
    data.subregion = converter.poi[shard][region][subregion].name
    data.coordinates = parseCoordinates(description[3]?.text)
    pois[data.name] = data // add data
  } else if (shortPoi) { // monumenta:pois/r1/jungle/poi1
    const [, shard, region] = regex.poi.short.exec(id)
    data.shard = converter.poi[shard].name
    data.region = converter.poi[shard][region].name
    data.coordinates = parseCoordinates(description[3]?.text)
    pois[data.name] = data // add data
  }
}

function parseDungeon ({ id, display, title, description }) {
  title = joinText(title) // make title into one line
  // pre checks
  if (!regex.dungeon.path.test(id)) return

  // generate dungeon information
  title = title.replace(regex.dungeon.prefix, '$1') // get rid of 'Found ' prefix on dungeon name
  const lines = {
    1: cleanDescriptionLine(description[0]?.text), // description of dungeon
    2: cleanDescriptionLine(description[1]?.text), // 'POI:' or 'Coordinates:'
    3: cleanDescriptionLine(description[2]?.text) // POI name or coordinates data
  }
  const data = { name: title.trim(), description: lines[1], poi: '', coordinates: { x: '0', y: '0', z: '0' } }
  if (lines[2] === 'POI:') data.poi = lines[3] // hardcoding POI data (not chad)
  for (const line of description) { // check for coordinates in a loop (chad)
    const text = cleanDescriptionLine(line.text)
    if (text === '' || text == null) continue // skip empty lines
    if (regex.coordinates.test(text)) data.coordinates = parseCoordinates(text) // coordinates easy to parse
  }
  dungeons[data.name] = data // add data
}

function parseQuest ({ id, display, title, description }) {
  title = joinText(title) // make title into one line
  // pre checks
  if (regex.quest.ignore.test(title.trim())) return // ignore `xxx Quests`
  if (regex.quest.city.test(description[0]?.text)) return

  const data = { name: title.trim(), description: '', region: '' }
  data.description = joinText(description) // make description into one line
  if (regex.quest.path.test(id)) { // add region information
    const [, region, quest] = regex.quest.path.exec(id)
    data.region = converter.poi[region].name // use POI mapping
  }
  quests[data.name] = data // add data
}

function parseCoordinates (text = '') {
  if (!text) return null
  if (!regex.coordinates.test(text)) return null
  const [, x, y, z] = regex.coordinates.exec(text)
  return { x, y, z }
}

function joinText (text = []) {
  if (!text) return null
  if (!Array.isArray(text)) text = [text]
  let output = ''
  for (const line of text) { // title
    const text = cleanDescriptionLine(line.text)
    if (text === '' || text == null || text === '\n') continue // skip empty lines
    if (output === '') output = text
    else output = `${output} ${text}`
  }
  return output
}

function cleanDescriptionLine (text = '') {
  if (!text) return null
  return String(text)
    .replaceAll('\n', '') // clean new lines
    .replaceAll(/&#\d+; /g, '') // clean color codes
    .trim() // get rid of trailing whitespaces
}

async function run () {
  try {
    await fetchAdvancements()
    generate()
  } catch (e) {
    console.error(e)
  }
}
run()
