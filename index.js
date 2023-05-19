// This program extracts POI data from Monumenta's advancement data.
// Data required: POI name, region, subregion, coordinates
const registry = require('prismarine-registry')('1.16')
const ChatMessage = require('prismarine-chat')(registry)
const axios = require('axios').default
const fs = require('fs')

let advancements
let items
const regex = {
  poi: {
    shard: /^monumenta:pois\/([0-9a-zA-Z-_.]+)\/root$/, // $1 = shard
    region: /^monumenta:pois\/([0-9a-zA-Z-_.]+)\/([0-9a-zA-Z-_.]+)\/root$/, // $1 = shard, $2 = region
    specialSubregion: /^monumenta:pois\/([0-9a-zA-Z-_.]+)\/([0-9a-zA-Z-_.]+)\/root_([0-9a-zA-Z-_.]+)$/, // $1 = shard, $2 = region, $3 = subregion??
    subregion: /^monumenta:pois\/([0-9a-zA-Z-_.]+)\/([0-9a-zA-Z-_.]+)\/([0-9a-zA-Z-_.]+)\/root$/, // $1 = shard, $2 = region, $3 = subregion
    short: /^monumenta:pois\/([0-9a-zA-Z-_.]+)\/([0-9a-zA-Z-_.]+)\/((?!root)[0-9a-zA-Z-_.]+)$/, // $3 != 'root'
    special: /^monumenta:pois\/([0-9a-zA-Z-_.]+)\/([0-9a-zA-Z-_.]+)\/((?!root(?:_[0-9a-zA-Z-_.]))[0-9a-zA-Z-_.]+)$/, // $3 != root_
    long: /^monumenta:pois\/([0-9a-zA-Z-_.]+)\/([0-9a-zA-Z-_.]+)\/([0-9a-zA-Z-_.]+)\/((?!root(?:_[0-9a-zA-Z-_.])?)[0-9a-zA-Z-_.]+)$/, // $4 != 'root'
    suffix: /^(.+) Exploration$/ // ignore suffix 'Exploration' from end of region
  },
  dungeon: {
    path: /^monumenta:dungeons\/([0-9a-zA-Z-_.]+)\/find$/, // dungeon path
    prefix: /^Found(?: the)? (.+)/, // ignore prefix 'Found' or 'Found the' in dungeon titles
    poi: /POI: (.+) Coordinates.*/
  },
  quest: {
    path: /^monumenta:quests\/([0-9a-zA-Z-_.]+)\/((?!root)[0-9a-zA-Z-_.]+)$/, // $1 = region, $2 = quest && $2 != 'root'
    city: /Discover the (.+)/, // ignore prefix 'Discover the' fromcities
    ignore: /(.+) Quests/
  },
  handbook: {
    enchantments: /^monumenta:handbook\/enchantments\/([0-9a-zA-Z-_.]+)$/,
    enchantmentRoot: /^monumenta:handbook\/enchantments\/root$/,
    sites: /^monumenta:handbook\/important_sites\/([0-9a-zA-Z-_.]+)\/([0-9a-zA-Z-_.]+)$/
  },
  description: {
    // r1 and r2 coordinates
    coordinates: /x=(-?\d{1,5}) y=(-?\d{1,5}) z=(-?\d{1,5})/, // $1 = x, $2 = y, $3 = z
    // r3 coordinates
    coordinatesr3: /(-?\d{1,5}) (-?\d{1,5}) (-?\d{1,5})/, // $1 = x, $2 = y, $3 = z
    colorcodes: /&#\d+;/g,
    newlines: / ?\n ?/g
  }
}
// TODO: get rid of converter
const converter = {
  quest: {},
  sites: {}
}
const pois = {}
const dungeons = {}
const quests = {}
const enchantments = {}
const all = {}

async function fetchAdvancements () {
  if (!fs.existsSync('./out')) fs.mkdirSync('./out')
  if (fs.existsSync('./out/advancement.json') && process.env.DEBUG === 'true') {
    console.log('[FILE] Loading advancements from existing file...')
    advancements = require('./advancement.json')
    return
  }
  console.log('[API] Fetching advancements from Monumenta API')
  const advancementApi = await axios.get('https://api.playmonumenta.com/advancements')
  if (advancementApi.status !== 200) throw Error(`Monumenta API returned: ${advancementApi.status} with ${advancementApi.statusText}`)
  advancements = advancementApi.data
  console.log('[FILE] Writing advancements to file...')
  fs.writeFileSync('./out/advancement.json', JSON.stringify(advancements, null, 2))
}

function generate () {
  console.log('[CONVERTER] Mapping paths to names...')
  for (const advancement of Object.values(advancements)) {
    parseAny(advancement)
  }

  for (const advancement of Object.values(advancements)) {
    if (advancement.id.startsWith('monumenta:handbook')) convertHandbook(advancement)
    else if (advancement.id.startsWith('monumenta:quest')) convertQuest(advancement)
  }
  console.log('[CONVERTER] Done.')
  console.log('[PARSER] Parsing POI & Advancement data...')
  for (const advancement of Object.values(advancements)) {
    if (advancement.id.startsWith('monumenta:pois')) parseAdvancement(advancement, { type: 'poi' }) // parse pois
    else if (advancement.id.startsWith('monumenta:dungeons')) parseAdvancement(advancement, { type: 'dungeon' }) // parse dungeons
    else if (advancement.id.startsWith('monumenta:quest')) parseAdvancement(advancement, { type: 'quest' })
    else if (advancement.id.startsWith('monumenta:handbook')) parseAdvancement(advancement, { type: 'handbook' })
  }
  console.log('[PARSER] Done.')
  console.log('[ALL] Saving all advancements to readable file')
  console.log('[ALL] Done.')
  console.log('[FILE] Creating output directory...')
  console.log('[FILE] Writing POI data to file...')
  fs.writeFileSync('./out/pois.json', JSON.stringify(pois, null, 2))
  console.log('[FILE] Writing Dungeon data to file...')
  fs.writeFileSync('./out/dungeons.json', JSON.stringify(dungeons, null, 2))
  console.log('[FILE] Writing Quest data to file...')
  fs.writeFileSync('./out/quests.json', JSON.stringify(quests, null, 2))
  console.log('[FILE] Writing Enchantment data to file...')
  fs.writeFileSync('./out/enchantments.json', JSON.stringify(enchantments, null, 2))
  console.log('[FILE] Writing converter data to file...')
  fs.writeFileSync('./out/converter.json', JSON.stringify(converter, null, 2))
  console.log('[FILE] Writing all data to file...')
  fs.writeFileSync('./out/all.json', JSON.stringify(all, null, 2))
}

function convertQuest (advancement) {
  const id = advancement.id
  const data = advancement?.display

  if (!regex.quest.path.test(id)) return
  const [, region, quest] = regex.quest.path.exec(id)
  if (!regex.quest.path.test(advancement.parent)) return
  const [, preRegion, preQuest] = regex.quest.path.exec(advancement.parent)
  converter.quest[quest] = preQuest
}

function convertHandbook (advancement) {
  const id = advancement.id
  const data = advancement?.display
  const title = data.title
  const description = data.description
  if (!title || !description) return

  const titlePrint = parseChatJson(title)
  const descriptionPrint = parseChatJson(description)
  switch (true) { // monumenta:handbook/r1/site
    case regex.handbook.sites.test(id): {
      const [, region, site] = regex.handbook.sites.exec(id)
      if (!converter.sites[region]) converter.sites[region] = {}
      if (!converter.sites[region][site]) converter.sites[region][site] = {}
      converter.sites[region][site].name = titlePrint
      converter.sites[region][site].description = descriptionPrint
      break
    }
  }
}

function parseAny (advancement) {
  const id = advancement.id
  const display = advancement.display

  // null checking
  if (!display) return
  const title = display.title
  const description = display.description
  let parsedTitle = parseChatJson(title)
  let parsedDescription = parseChatJson(description)

  if (id.startsWith("monumenta:pois") && regex.poi.shard.test(id)) { // remove exploration prefix on POI shards
    parsedTitle = parsedTitle.replace(regex.poi.suffix, '$1')
  }

  all[advancement.id] = {
    title: parsedTitle,
    description: parsedDescription,
    parent: advancement.parent
  }
}

function parseAdvancement (advancement, options = { type: '' }) {
  const id = advancement.id
  const display = advancement?.display

  // null checking
  if (!display) return
  const title = display.title
  const description = display.description
  if (!title || !description) return
  const option = { id, display, title, description, advancement }
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
    case 'handbook': {
      parseHandbook(option)
      break
    }
  }
}

function parsePoi ({ id, display, title, description, advancement }) {
  const parsedTitle = parseChatJson(title) // make title into one line
  const parsedDescription = parseChatJson(description)
  // check if advancement has a valid path
  // if (id.includes("/root")) return // TODO: if they ever add ids with /root that are actual advancements, this is gonna ruin the code
  if (regex.poi.shard.test(id) || regex.poi.region.test(id) || regex.poi.subregion.test(id) || regex.poi.specialSubregion.test(id)) return
  const longPoi = regex.poi.long.test(id)
  const specialPoi = regex.poi.special.test(id)
  const shortPoi = regex.poi.short.test(id)
  if ((specialPoi || longPoi || shortPoi) === false) return
  // generate poi information
  const data = { name: parsedTitle, shard: null, region: null, subregion: null, coordinates: null }
  // get coordinates
  data.coordinates = parseCoordinates(parsedDescription)
  // coordinates may be missing
  if (!data.coordinates) console.error(`[POI] '${parsedTitle}' missing coordinates | advancement: '${id}'`)
  const poi = checkPoiName(id)
  data.shard = checkPoiShard(id)
  data.region = checkPoiRegion(id)
  data.subregion = checkPoiSubregion(id)
  if (!pois[poi]) pois[poi] = data
  else console.error(`[POI] '${parsedTitle} has duplicate name | advancement: '${id}'`)

}

function parseDungeon ({ id, display, title, description, advancement }) {
  let parsedTitle = parseChatJson(title) // make title into one line
  const parsedDescription = parseChatJson(description)
  // pre checks
  if (!regex.dungeon.path.test(id)) return
  const [, dungeon] = regex.dungeon.path.exec(id)
  // generate dungeon information
  parsedTitle = parsedTitle.replace(regex.dungeon.prefix, '$1') // get rid of 'Found ' prefix on dungeon name
  const data = { name: parsedTitle, description: null, poi: null, coordinates: null }
  data.description = parseChatJson(description[0]) // dungeon descriptions are special
  data.poi = parseDungeonPois(parsedDescription)
  if (!data.poi) console.error(`[DUNGEON] '${parsedTitle}' missing poi data | advancement: '${id}'`)
  data.coordinates = parseCoordinates(parsedDescription)
  if (!data.coordinates) console.error(`[DUNGEON] '${parsedTitle}' missing coordinates | advancement: '${id}'`)
  if (!dungeons[dungeon]) dungeons[dungeon] = data // add data
  else console.error(`[DUNGEON] '${parsedTitle} has duplicate name | advancement: '${id}'`)
}

function parseQuest ({ id, display, title, description, advancement }) {
  const parsedTitle = parseChatJson(title) // make title into one line
  const parsedDescription = parseChatJson(description)
  // pre checks
  if (regex.quest.ignore.test(parsedTitle.trim())) return // ignore `xxx Quests`
  if (regex.quest.city.test(parsedDescription)) return

  const data = { name: parsedTitle, description: null, region: null, city: null }
  data.description = parsedDescription // make description into one line
  if (regex.quest.path.test(id)) { // add region information
    const [, region, quest] = regex.quest.path.exec(id)
    data.region = checkPoiRegion(id) // use POI mapping
    const site = checkQuest(id)
    if (site) data.city = converter.sites[region][site].name
    if (!quests[quest]) quests[quest] = data // add data
    else console.error(`[QUEST] '${parsedTitle}' has duplicate name | advancement: '${id}'`)
  }
}

function parseHandbook ({ id, display, title, description, advancement }) {
  const parsedTitle = parseChatJson(title)
  const parsedDescription = parseChatJson(description)
  switch (true) {
    case regex.handbook.enchantments.test(id): {
      if (regex.handbook.enchantmentRoot.test(id) && title !== 'Agility') break
      const data = { name: parsedTitle, description: parsedDescription, category: null }
      const [, enchantment] = regex.handbook.enchantments.exec(id)
      data.category = checkEnchantment(id)
      if (!enchantments[enchantment]) enchantments[enchantment] = data // add data
      else console.error(`[ENCHANTMENT] '${parsedTitle}' has duplicate name | advancement: '${id}'`)
      break
    }
  }
}

function checkPoiName (id = '') {
  if (!id || id === '') return null
  if (regex.poi.long.test(id)) {
    const [, shard, region, subregion, poi] = regex.poi.long.exec(id)
    return poi
  } 
  if (regex.poi.special.test(id)) {
    const [, shard, region, poi, subregion] = regex.poi.special.exec(id)
    return poi
  } 
  if (regex.poi.short.test(id)) {
    const [, shard, region, poi] = regex.poi.short.exec(id)
    return poi
  }
  return null
}

function checkPoiShard (id = '') { // monumenta:pois/r1/
  if (!id || id === '') return null
  if (regex.poi.shard.test(id)) return all[id].title
  if (!all[id]?.parent) return null
  const value = checkPoiShard(all[id].parent)
  return value
}

function checkPoiRegion (id = '') {  // monumenta:pois/r1/jungle
  if (!id || id === '') return null
  if (regex.poi.region.test(id)) return all[id].title
  if (!all[id]?.parent) return null
  const value = checkPoiRegion(all[id].parent)
  return value
}

function checkPoiSubregion (id = '') { // monumenta:pois/r1/jungle/north or monumenta:pois/r1/jungle/root_north
  if (!id|| id === '') return null
  if (regex.poi.specialSubregion.test(id) || regex.poi.subregion.test(id)) return all[id].title
  if (!all[id]?.parent) return null
  const value = checkPoiSubregion(all[id].parent)
  return value
}

function checkQuest (name = '') { // recursively check for quests
  if (!name || name === '') return null
  for (const [region] of Object.entries(converter.sites)) {
    for (const [site] of Object.entries(converter.sites[region])) {
      if (name === site) return site
    }
  }
  if (!converter.quest[name]) return null // quests that don't "technically" have a city associated with them
  const value = checkQuest(id)
  return value
}

function checkEnchantment (id = '') { // recursively check for enchantments
  if (!id || id === '') return null
  if (regex.handbook.enchantmentRoot.test(all[id].parent) && all[id].title != "Agility") return all[id].title
  if (!all[id]?.parent) return null
  const value = checkEnchantment(all[id].parent)
  return value
}

function parseCoordinates (text) {
  if (!text) return null
  if (regex.description.coordinates.test(text)) {
    const [, x, y, z] = regex.description.coordinates.exec(text)
    return { x, y, z }
  } else if (regex.description.coordinatesr3.test(text)) {
    const [, x, y, z] = regex.description.coordinatesr3.exec(text)
    return { x, y, z }
  }
  return null
}

function parseDungeonPois (text) {
  if (!text) return null
  if (regex.dungeon.poi.test(text)) {
    const [, poi] = regex.dungeon.poi.exec(text)
    return poi
  }
  return null
}

function parseChatJson (json = '') {
  if (!json) return null
  const msg = new ChatMessage(json)
  return cleanDescriptionLine(msg.toString())
}

function cleanDescriptionLine (text = '') {
  if (!text) return null
  return String(text)
    .replaceAll(regex.description.colorcodes, '') // clean color codes
    .replaceAll(regex.description.newlines, ' ') // clean new lines
    .trim() // get rid of trailing whitespaces
}


// ITems

async function fetchItems () {
  if (!fs.existsSync('./out')) fs.mkdirSync('./out')
  if (fs.existsSync('./out/item.json') && process.env.DEBUG === 'true') {
    console.log('[FILE] Loading items from existing file...')
    items = require('./item.json')
    return
  }
  console.log('[API] Fetching items from Monumenta API')
  const itemApi = await axios.get('https://api.playmonumenta.com/items')
  if (itemApi.status !== 200) throw Error(`Monumenta API returned: ${itemApi.status} with ${itemApi.statusText}`)
  items = itemApi.data
  console.log('[FILE] Writing items to file...')
  fs.writeFileSync('./out/item.json', JSON.stringify(items, null, 2))
}

async function run () {
  try {
    await fetchAdvancements()
    generate()
  } catch (e) {
    console.error(e)
  }
  try {
    await fetchItems()
  } catch (e) {
    console.error(e)
  }
}
run()
