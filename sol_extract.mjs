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
    fether: "(fether)",
    cropsnh: "(cropsnh)",
    BloodArsenal: "(BloodArsenal)",
    Avaritia: "(Avaritia)",
    Thaumcraft: "(Thaumcraft)",
    ForbiddenMagic: "(ForbiddenMagic)",
    WitchingGadgets: "(WitchingGadgets)",
    miscutils: "(miscutils)"
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
  "i:Forestry:beverage:1": { name: "Curative Mead", mod: "Forestry" }
};

const aliasFix = {
  "i:fether:blood_leaf:0": { name: "Blood Leaf", mod: "fether" },
  "i:fether:flesh_root:0": { name: "Flesh Root", mod: "fether" },
  "i:fether:ignis_fruit:0": { name: "Ignis Fruit", mod: "fether" },
  "i:fether:glow_flower_seeds:0": { name: "Glow Flower Seeds", mod: "fether" },
  "i:fether:marrow_berry:0": { name: "Marrow Berry", mod: "fether" },
  "i:fether:flesh_root_seeds:0": { name: "Flesh Root Seeds", mod: "fether" },
  "i:fether:marrow_berry_seeds:0": { name: "Marrow Berry Seeds", mod: "fether" },
  "i:fether:blood_leaf_seeds:0": { name: "Blood Leaf Seeds", mod: "fether" },
  "i:cropsnh:goldfish:0": { name: "Goldfish", mod: "cropsnh" },
  "i:cropsnh:berry:0": { name: "Berry", mod: "cropsnh" },
  "i:cropsnh:berry:1": { name: "Berry Medley", mod: "cropsnh" },
  "i:cropsnh:berry:2": { name: "Pear", mod: "cropsnh" }
};

class Repository {
  constructor(data) {
    this.objects = {};
    this.objectPositionMap = {};
    this.bytes = new Uint8Array(data);
    this.elements = new Int32Array(data);
    this.textReader = new TextDecoder();

    if (this.elements[0] !== DATA_VERSION) {
      throw new Error("Unsupported data version");
    }

    [1, 2, 3, 5].forEach(idx => {
      this.fillObjectPositionMap(this.getSlice(this.elements[idx]));
    });

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
    if (!id || this.objectPositionMap[id] == null) return null;
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

  findIdsContaining(text, limit = 20) {
    const needle = String(text || "").toLowerCase();
    if (!needle) return [];

    const results = [];
    for (const id of Object.keys(this.objectPositionMap)) {
      if (id.toLowerCase().includes(needle)) {
        results.push(id);
        if (results.length >= limit) break;
      }
    }
    return results;
  }
}

class Item {
  constructor(repository, offset) {
    this.repository = repository;
    this.offset = offset;
  }

  get name() {
    return this.repository.getString(this.repository.elements[this.offset + 5]);
  }

  get mod() {
    return this.repository.getString(this.repository.elements[this.offset + 6]);
  }
}

function buildRepoCandidates(tag, damage) {
  return [
    `i:${tag}:${damage}`,
    `i:${tag}Item:${damage}`
  ];
}

function lookupItem(repo, tag, damage) {
  const candidates = buildRepoCandidates(tag, damage);

  for (const id of candidates) {
    const item = repo.getById(id);
    if (item) {
      return { item, source: "repo", matchedId: id };
    }
  }

  for (const id of candidates) {
    if (manualFix[id]) {
      return { item: manualFix[id], source: "manualFix", matchedId: id };
    }
  }

  for (const id of candidates) {
    if (aliasFix[id]) {
      return { item: aliasFix[id], source: "aliasFix", matchedId: id };
    }
  }

  return {
    item: null,
    source: null,
    matchedId: candidates[0],
    candidates
  };
}

function normalizeSpecialItem(tag, damage, hunger) {
  if (tag === "minecraft:golden_apple") {
    let name = "Golden Apple";
    if (damage === 0) name = "Golden Apple (Ingots)";
    else if (damage === 1) name = "Golden Apple (Blocks)";
    return { n: name, m: "(Vanilla)", h: hunger };
  }

  if (pamFix[tag]) {
    return { n: pamFix[tag], m: "(Pam)", h: hunger };
  }

  return null;
}

function normalizeNameAndMod(tag, damage, rawItem) {
  let name = decode(rawItem.name);
  let modshort = ModToShort(rawItem.mod);

  if (modshort === "(GT)" && name === "Dough") {
    if (damage === 32561) name = "Dough in Bread Shape";
    else if (damage === 32562) name = "Dough in Bun Shape";
    else if (damage === 32563) name = "Dough in Baguette Shape";
  }

  if (modshort === "(GT)" && name === "Fries" && damage === 32204) {
    name = "Fries (In Foil)";
  }

  if (modshort === "(Natura)" && tag === "Natura:natura.stewbowl") {
    name = damage >= 14 ? "Glowshroom " : "Mushroom ";
    const stewSuffixes = {
      0: "Stew 1",
      3: "Stew 2",
      5: "Stew 3",
      12: "Stew 4",
      13: "Stew 5"
    };
    name += stewSuffixes[damage % 14] || "";
  }

  return { name, modshort };
}

function applyHungerOverride(name, modshort, hunger) {
  if (name === "Berry Medley" && modshort === "(cropsnh)") return 3;
  if (name === "Pear" && modshort === "(cropsnh)") return 3;
  if (name === "Beef Wellington" && modshort === "(Pam)") return 16;
  return hunger;
}

function makeNotFoundResult(tag, damage, repo, candidates) {
  const repoTag = `i:${tag}:${damage}`;
  const searchTerm = (tag || "").split(":").pop() || tag;
  const possibleMatches = repo.findIdsContaining(searchTerm, 10);

  if (possibleMatches.length > 0) {
    console.log(
      `${colors.yellow}[WARN]${colors.reset} DB miss for ${repoTag} | possible matches: ${possibleMatches.join(", ")}`
    );
  } else {
    console.log(
      `${colors.yellow}[WARN]${colors.reset} DB miss for ${repoTag} | no similar IDs found`
    );
  }

  return {
    n: repoTag,
    m: "- ERROR IN DB LOOKUP",
    h: null,
    notfound: true,
    candidates,
    possibleMatches
  };
}

function safeGetFoods(parsedPlayer) {
  return parsedPlayer?.value?.ForgeData?.value?.PlayerPersisted?.value?.SpiceOfLifeHistory?.value?.FullHistory?.value?.Foods?.value?.value || [];
}

function buildIdToTag(parsedLevel) {
  const itemData = parsedLevel?.value?.FML?.value?.ItemData?.value?.value || [];
  const map = [];
  for (const x of itemData) {
    map[x.V.value] = x.K.value.slice(1);
  }
  return map;
}

async function processPlayer(playerPath, parsedLevel, repo) {
  let playerBuf = fs.readFileSync(playerPath);
  if (isGzipped(playerBuf)) {
    playerBuf = Buffer.from(ungzip(playerBuf));
  }

  const parsedPlayer = await parseNBT(playerBuf);
  const IdToTag = buildIdToTag(parsedLevel);

  const foods = safeGetFoods(parsedPlayer);
  const eaten = foods.map(x => ({
    id: x.id?.value,
    damage: x.Damage?.value ?? 0,
    hunger: x.Hunger?.value ?? null
  }));

  return eaten.map(x => {
    const tag = IdToTag[x.id];

    if (!tag) {
      return {
        n: `unknown-id:${x.id}:${x.damage}`,
        m: "- ERROR UNKNOWN ITEM ID",
        h: x.hunger,
        notfound: true
      };
    }

    const special = normalizeSpecialItem(tag, x.damage, x.hunger);
    if (special) {
      special.h = applyHungerOverride(special.n, special.m, special.h);
      return special;
    }

    const lookup = lookupItem(repo, tag, x.damage);

    if (!lookup.item) {
      return makeNotFoundResult(tag, x.damage, repo, lookup.candidates);
    }

    const { name, modshort } = normalizeNameAndMod(tag, x.damage, lookup.item);
    const hunger = applyHungerOverride(name, modshort, x.hunger);

    return {
      n: name,
      m: modshort,
      h: hunger
    };
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
  if (!fs.existsSync(levelPath)) {
    console.error(`${colors.red}[ERROR]${colors.reset} level.dat not found: ${levelPath}`);
    process.exit(1);
  }

  let levelBuf = fs.readFileSync(levelPath);
  if (isGzipped(levelBuf)) {
    levelBuf = Buffer.from(ungzip(levelBuf));
  }

  const parsedLevel = await parseNBT(levelBuf);

  const repoBinPath = path.resolve("./data.bin");
  if (!fs.existsSync(repoBinPath)) {
    console.error(`${colors.red}[ERROR]${colors.reset} data.bin not found!`);
    process.exit(1);
  }

  const repoData = ungzip(fs.readFileSync(repoBinPath));
  const repoBuffer = repoData.buffer.slice(
    repoData.byteOffset,
    repoData.byteOffset + repoData.byteLength
  );
  const repo = Repository.load(repoBuffer);

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
      fs.writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");
      console.log(`${colors.green}[OK]${colors.reset} Wrote ${name}.json`);
    } catch (err) {
      console.error(`${colors.red}[ERROR]${colors.reset} Failed processing ${name}: ${err.message}`);
    }
  }

  console.log(`\n${colors.cyan}[DONE]${colors.reset} Execution finished.`);
}

main().catch(err => {
  console.error(`${colors.red}[FATAL]${colors.reset}`, err);
  process.exit(1);
});
