#!/usr/bin/env node

import fs from "fs";
import os from "os";
import path from "path";
import { parse } from "prismarine-nbt";
import { ungzip } from "pako";
import { decode } from "html-entities";

const DATA_VERSION = 5;

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  yellow: "\x1b[33m"
};

function expandHome(filepath) {
  if (filepath.startsWith("~")) {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

function isGzipped(buf) {
  return buf[0] === 0x1f && buf[1] === 0x8b;
}

async function parseNBT(buffer) {
  const { parsed } = await parse(buffer);
  return parsed;
}

function ModToShort(mod) {
  const map = {
    gregtech: "(GT)",
    harvestcraft: "(Pam)",
    Natura: "(Natura)",
    Forestry: "(Forestry)",
    TConstruct: "(TiC)",
    ExtraTrees: "(ET)",
    TwilightForest: "(TF)",
    witchery: "(Witchery)",
    ThaumicHorizons: "(TC)",
    etfuturum: "(EFR)",
    BiomesOPlenty: "(BoP)",
    cookingforblockheads: "(Cooking for BH)",
    minecraft: "(Vanilla)",
  };
  return map[mod] || `(${mod})`;
}

const pamFix = {
  "harvestcraft:pamcarrotCake": "Carrot Cake",
  "harvestcraft:pamcheeseCake": "Cheese Cake",
  "harvestcraft:pamcherrycheeseCake": "Cherry Cheese Cake",
  "harvestcraft:pampineappleupsidedownCake": "Pineapple Upside Down Cake",
  "harvestcraft:pamchocolatesprinkleCake": "Chocolate Sprinkles Cake",
  "harvestcraft:pamredvelvetCake": "Red Velvet Cake",
  "harvestcraft:pamlamingtonCake": "Lamington",
  "harvestcraft:pampavlovaCake": "Pavlova",
  "harvestcraft:pamholidayCake": "Holiday Cake",
  "harvestcraft:pampumpkincheeseCake": "Pumpkin Cheese Cake"
};

const manualFix = {
  "i:BloodArsenal:blood_cake:0": { name: "Blood Cake", mod: "BloodArsenal" },
  "i:TConstruct:strangeFood:2": { name: "Bacon", mod: "TConstruct" },
  "i:Forestry:beverage:1": { name: "Curative Mead", mod: "Forestry" },
};

class Repository {
  constructor(data) {
    this.objects = {};
    this.objectPositionMap = {};
    this.bytes = new Uint8Array(data);
    this.elements = new Int32Array(data);
    this.view = new DataView(data);
    this.textReader = new TextDecoder();

    if (this.elements[0] !== DATA_VERSION) throw new Error("Unsupported data version");

    [1, 2, 3, 5].forEach(idx => this.fillObjectPositionMap(this.getSlice(this.elements[idx])));

    const remap = this.getSlice(this.elements[7]);
    for (let i = 0; i < remap.length; i++) {
      const pos = remap[i];
      const id = this.getString(this.elements[pos]);
      this.objectPositionMap[id] = this.elements[pos + 1];
    }
  }

  static load(data) {
    return new Repository(data);
  }

  fillObjectPositionMap(elements) {
    for (let i = 0; i < elements.length; i++) {
      const id = this.getString(this.elements[elements[i] + 4]);
      this.objectPositionMap[id] = elements[i];
    }
  }

  getById(id) {
    if (!id || !this.objectPositionMap[id]) return null;
    return new Item(this, this.objectPositionMap[id]);
  }

  getString(pointer) {
    if (pointer === -1) return null;
    if (this.objects[pointer]) return this.objects[pointer];

    const length = this.elements[pointer];
    const begin = pointer * 4 + 4;
    const str = this.textReader.decode(this.bytes.subarray(begin, begin + length));

    this.objects[pointer] = str;
    return str;
  }

  getSlice(pointer) {
    return this.elements.subarray(pointer + 1, pointer + 1 + this.elements[pointer]);
  }
}

class Item {
  constructor(repository, offset) {
    this.repository = repository;
    this.offset = offset;
  }
  get name() { return this.repository.getString(this.repository.elements[this.offset + 5]); }
  get mod() { return this.repository.getString(this.repository.elements[this.offset + 6]); }
}

async function processPlayer(playerPath, parsedLevel, repo) {
  let playerBuf = fs.readFileSync(playerPath);
  if (isGzipped(playerBuf)) playerBuf = Buffer.from(ungzip(playerBuf));
  
  const parsedPlayer = await parseNBT(playerBuf);
  const name_id_matcher = parsedLevel.value.FML.value.ItemData.value.value.map((x) => ({
    id: x.V.value,
    tag: x.K.value.slice(1),
  }));

  const IdToTag = [];
  name_id_matcher.forEach((x) => (IdToTag[x.id] = x.tag));

  const eaten = parsedPlayer.value.ForgeData.value.PlayerPersisted.value
    .SpiceOfLifeHistory.value.FullHistory.value.Foods.value.value.map((x) => ({
      id: x.id?.value,
      damage: x.Damage?.value ?? 0,
      hunger: x.Hunger?.value ?? null,
    }));

  return eaten.map((x) => {
    const tag = IdToTag[x.id];
    
    if (tag === "minecraft:golden_apple") {
      let name = "Golden Apple";
      if (x.damage === 0) name = "Golden Apple (Ingots)";
      else if (x.damage === 1) name = "Golden Apple (Blocks)";
      return { n: name, m: "(Vanilla)", h: x.hunger };
    }

    if (pamFix[tag]) {
      return { n: pamFix[tag], m: "(Pam)", h: x.hunger };
    }

    const repoTag = `i:${tag}:${x.damage}`;
    let item = repo.getById(repoTag) || repo.getById(`i:${tag}Item:${x.damage}`) || manualFix[repoTag];

    if (!item) return { n: repoTag, m: "- ERROR IN DB LOOKUP", notfound: true };

    let name = decode(item.name);
    let modshort = ModToShort(item.mod);

    if (modshort === "(GT)" && name === "Dough") {
      if (x.damage === 32561) name = "Dough in Bread Shape";
      else if (x.damage === 32562) name = "Dough in Bun Shape";
      else if (x.damage === 32563) name = "Dough in Baguette Shape";
    }

    if (modshort === "(GT)" && name === "Fries" && x.damage === 32204) {
      name = "Fries (In Foil)";
    }

    if (modshort === "(Natura)" && tag === "Natura:natura.stewbowl") {
      name = x.damage >= 14 ? "Glowshroom " : "Mushroom ";
      const stewSuffixes = { 0: "Stew 1", 3: "Stew 2", 5: "Stew 3", 12: "Stew 4", 13: "Stew 5" };
      name += stewSuffixes[x.damage % 14] || "";
    }

    return { n: name, m: modshort, h: x.hunger };
  });
}

async function main() {
  const optionsPath = path.resolve("options.json");
  if (!fs.existsSync(optionsPath)) {
    console.error(`${colors.red}[ERROR]${colors.reset} options.json not found!`);
    process.exit(1);
  }

  const options = JSON.parse(fs.readFileSync(optionsPath, "utf8"));
  const worldPath = expandHome(options.world);
  const whitelist = options.whitelist || [];

  const outputDir = path.resolve("output");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const levelPath = path.join(worldPath, "level.dat");
  let levelBuf = fs.readFileSync(levelPath);
  if (isGzipped(levelBuf)) levelBuf = Buffer.from(ungzip(levelBuf));
  
  const parsedLevel = await parseNBT(levelBuf);
  const repoData = ungzip(fs.readFileSync("./data.bin"));
  const repo = Repository.load(repoData.buffer);

  for (const player of whitelist) {
    const { uuid, name } = player;
    const playerPath = path.join(worldPath, "playerdata", `${uuid}.dat`);

    if (!fs.existsSync(playerPath)) {
      console.log(`${colors.yellow}[SKIP]${colors.reset} Playerdata missing for ${name} (${uuid})`);
      continue;
    }

    console.log(`${colors.cyan}[INFO]${colors.reset} Processing ${name}...`);
    
    try {
      const result = await processPlayer(playerPath, parsedLevel, repo);
      const outPath = path.join(outputDir, `${name}.json`);
      fs.writeFileSync(outPath, JSON.stringify(result, null, null), "utf8");
      console.log(`${colors.green}[OK]${colors.reset} Wrote ${name}.json`);
    } catch (err) {
      console.error(`${colors.red}[ERROR]${colors.reset} Failed processing ${name}: ${err.message}`);
    }
  }

  console.log(`\n${colors.cyan}[DONE]${colors.reset} Execution finished.`);
}

main().catch(err => console.error(`${colors.red}[FATAL]${colors.reset}`, err));