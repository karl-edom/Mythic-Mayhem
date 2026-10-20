// The playable page (the published artifact): one place to build it, the same way
// from every session. The source of truth is the git branch; the page is a build of
// it. The local packs (packs/local, git-ignored) live only in the published page, so
// a session without them takes them back from it first (decision of 2026-10-20).
//
//   node tools/artifact.ts packs <page.html> [--force]
//     reads the fighter packs embedded in a saved copy of the published page and
//     writes them to packs/local/<id>/{kit,character}.json. Data is parsed, never run.
//   node tools/artifact.ts build [--allow-dirty]
//     builds dist/artifact/: index.html (one script, three from the CDN, models as
//     JSON) and the files to publish next to it, then lists them.
//
// The publishing itself is done by Claude (Artifact tool), always to the same URL:
// see CLAUDE.md, « Page jouable (artefact) ».

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const ROOT = new URL("../", import.meta.url).pathname;
const OUT = join(ROOT, "dist/artifact");
const PACKS = join(ROOT, "packs/local");

// ---------------------------------------------------------------------------
// Packs embedded in the bundle: `"/packs/local/<id>/kit.json":<name>` in the glob
// maps, and `<name>={…}` an object literal of plain data further on.

/** Reads one JS data literal (objects, arrays, strings, numbers, !0/!1, true/false/null). */
export function parseLiteral(src: string, start: number): { value: unknown; end: number } {
  let i = start;
  const fail = (what: string): never => {
    throw new Error(`${what} à la position ${i} : « ${src.slice(i, i + 30)} »`);
  };
  const ws = () => {
    while (i < src.length && /\s/.test(src[i]!)) i++;
  };
  const str = (): string => {
    const q = src[i]!;
    let out = "";
    i++;
    while (i < src.length && src[i] !== q) {
      if (q === "`" && src[i] === "$" && src[i + 1] === "{") fail("gabarit avec expression");
      if (src[i] === "\\") {
        const c = src[i + 1]!;
        const map: Record<string, string> = { n: "\n", t: "\t", r: "\r", "0": "\0", b: "\b", f: "\f", v: "\v" };
        if (c === "u") {
          const hex = src[i + 2] === "{" ? src.slice(i + 3, src.indexOf("}", i)) : src.slice(i + 2, i + 6);
          out += String.fromCodePoint(parseInt(hex, 16));
          i += src[i + 2] === "{" ? hex.length + 4 : 6;
          continue;
        }
        if (c === "x") {
          out += String.fromCharCode(parseInt(src.slice(i + 2, i + 4), 16));
          i += 4;
          continue;
        }
        out += map[c] ?? (c === "\n" ? "" : c);
        i += 2;
        continue;
      }
      out += src[i];
      i++;
    }
    if (src[i] !== q) fail("chaîne non fermée");
    i++;
    return out;
  };
  const value = (): unknown => {
    ws();
    const c = src[i];
    if (c === "{") {
      i++;
      const o: Record<string, unknown> = {};
      for (;;) {
        ws();
        if (src[i] === "}") {
          i++;
          return o;
        }
        let key: string;
        if (src[i] === '"' || src[i] === "'" || src[i] === "`") key = str();
        else {
          const m = /^[A-Za-z_$][\w$]*|^\d+(\.\d+)?/.exec(src.slice(i, i + 200));
          if (!m) fail("clé attendue");
          key = m![0];
          i += key.length;
        }
        ws();
        if (src[i] !== ":") fail("« : » attendu");
        i++;
        o[key] = value();
        ws();
        if (src[i] === ",") i++;
        else if (src[i] !== "}") fail("« , » ou « } » attendu");
      }
    }
    if (c === "[") {
      i++;
      const a: unknown[] = [];
      for (;;) {
        ws();
        if (src[i] === "]") {
          i++;
          return a;
        }
        a.push(value());
        ws();
        if (src[i] === ",") i++;
        else if (src[i] !== "]") fail("« , » ou « ] » attendu");
      }
    }
    if (c === '"' || c === "'" || c === "`") return str();
    for (const [word, v] of [["!0", true], ["!1", false], ["true", true], ["false", false], ["null", null], ["void 0", undefined]] as const)
      if (src.startsWith(word, i)) {
        i += word.length;
        return v;
      }
    if (src.startsWith("1/0", i)) {
      i += 3;
      return Infinity;
    }
    const m = /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i, i + 40));
    if (m) {
      i += m[0].length;
      return Number(m[0]);
    }
    return fail("donnée attendue (le pack ne doit contenir que des données)");
  };
  const v = value();
  return { value: v, end: i };
}

/** The packs of a built page: `{ "<id>/kit.json": {...}, "<id>/character.json": {...} }`. */
export function extractPacks(page: string): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [, path, name] of page.matchAll(/"\/packs\/local\/([^"]+\/(?:kit|character)\.json)":([A-Za-z_$][\w$]*)/g)) {
    if (out.has(path!)) continue;
    const def = new RegExp(`(?:var |let |const |,)${name!.replace(/\$/g, "\\$")}=\\{`).exec(page);
    if (!def) throw new Error(`définition introuvable pour ${path} (${name})`);
    out.set(path!, parseLiteral(page, def.index + def[0].length - 1).value);
  }
  return out;
}

function packsCommand(file: string, force: boolean): void {
  const packs = extractPacks(readFileSync(file, "utf8"));
  if (!packs.size) throw new Error("aucun pack dans cette page");
  if (existsSync(PACKS) && readdirSync(PACKS).length && !force)
    throw new Error("packs/local n'est pas vide : relancer avec --force pour l'écraser par la version publiée");
  for (const [path, data] of packs) {
    const to = join(PACKS, path);
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, JSON.stringify(data, null, 2) + "\n");
  }
  console.log(`${packs.size / 2} packs écrits dans packs/local/ (non commités).`);
  // Their VRM avatars: published next to the page as packs/<id>/<file>.vrm.json. Fetched
  // beside the saved page (Artifact read, same paths), they are unwrapped into the packs.
  const beside = join(dirname(file), "packs");
  let avatars = 0;
  if (existsSync(beside))
    for (const f of filesUnder(beside).filter((f) => f.endsWith(".vrm.json"))) {
      const to = join(PACKS, relative(beside, f).replace(/\.json$/, ""));
      mkdirSync(dirname(to), { recursive: true });
      writeFileSync(to, Buffer.from((JSON.parse(readFileSync(f, "utf8")) as { glb: string }).glb, "base64"));
      avatars++;
    }
  const missing = [...packs].filter(([p, d]) => p.endsWith("character.json") && (d as { look?: { model?: string; file?: string } }).look?.model === "vrm")
    .map(([p, d]) => `${dirname(p)}/${(d as { look: { file: string } }).look.file}`)
    .filter((p) => !existsSync(join(PACKS, p)));
  if (avatars) console.log(`${avatars} avatars VRM écrits dans packs/local/.`);
  if (missing.length) console.warn(`Avatars VRM à récupérer de la page publiée (fichiers packs/<id>/<fichier>.vrm.json, à poser à côté de la page) : ${missing.join(", ")}`);
}

// ---------------------------------------------------------------------------
// The build.

const git = (...args: string[]) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? filesUnder(join(dir, f)) : [join(dir, f)]));
}

async function buildCommand(allowDirty: boolean): Promise<void> {
  // The page must be the branch as pushed: nothing local, nothing missing.
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  const dirty = git("status", "--porcelain");
  try {
    git("fetch", "-q", "origin", branch);
  } catch {
    console.warn("(fetch impossible : comparaison avec la branche distante sautée)");
  }
  const behind = Number(git("rev-list", "--count", `HEAD..origin/${branch}`) || 0);
  const ahead = Number(git("rev-list", "--count", `origin/${branch}..HEAD`) || 0);
  const problems = [dirty && "des changements ne sont pas commités", behind && `${behind} commit(s) distants à récupérer (git pull)`, ahead && `${ahead} commit(s) à pousser`].filter(Boolean);
  if (problems.length && !allowDirty) throw new Error(`la page doit être la branche poussée : ${problems.join(", ")}`);
  const packs = existsSync(PACKS) ? readdirSync(PACKS).filter((d) => existsSync(join(PACKS, d, "kit.json"))) : [];
  if (!packs.length) throw new Error("packs/local est vide : récupérer d'abord les packs de la page publiée (node tools/artifact.ts packs <page.html>)");

  const { build } = await import("vite");
  const tmp = join(OUT, ".bundle");
  rmSync(OUT, { recursive: true, force: true });
  await build({
    configFile: false,
    root: ROOT,
    publicDir: false,
    logLevel: "warn",
    // Hosts that serve neither .glb files nor fetches of data:/blob: URLs: models as JSON (see models.ts).
    define: { "import.meta.env.VITE_MODEL_EXT": JSON.stringify("json") },
    build: {
      outDir: tmp,
      emptyOutDir: true,
      target: "es2022",
      chunkSizeWarningLimit: 4000,
      assetsInlineLimit: 100_000_000,
      rolldownOptions: { external: [/^three$/], output: { inlineDynamicImports: true } },
    },
  });
  const js = filesUnder(tmp).find((f) => f.endsWith(".js"))!;
  const css = filesUnder(tmp).find((f) => f.endsWith(".css"));
  const script = readFileSync(js, "utf8");
  if (script.includes("</script")) throw new Error("le script contient « </script » : la page serait coupée");
  const three = (JSON.parse(readFileSync(join(ROOT, "node_modules/three/package.json"), "utf8")) as { version: string }).version;
  // The host adds the document around it (doctype, head): the page is its body.
  const page = [
    "<title>Mythic Mayhem Arène</title>",
    '<meta name="claude:viewport-fit-sides" content="cover">',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bangers&family=Rajdhani:wght@500;600;700&display=swap">',
    `<style>${css ? readFileSync(css, "utf8") : ""}`,
    "html,body{height:100%;background:#16121f}",
    ".hud-top{padding-top:max(12px,env(safe-area-inset-top,0px));padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}</style>",
    '<canvas id="view"></canvas>',
    '<div id="hud"></div>',
    '<div id="menu"></div>',
    `<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@${three}/build/three.module.js"}}</script>`,
    `<script type="module">${script}</script>`,
    "",
  ].join("\n");
  rmSync(tmp, { recursive: true, force: true });
  writeFileSync(join(OUT, "index.html"), page);
  // Next to it: the textures as they are, the models wrapped in JSON.
  cpSync(join(ROOT, "public/assets"), join(OUT, "assets"), { recursive: true });
  for (const f of filesUnder(join(ROOT, "public/models"))) {
    const rel = relative(join(ROOT, "public"), f);
    const to = join(OUT, f.endsWith(".glb") ? rel.replace(/\.glb$/, ".json") : rel);
    mkdirSync(dirname(to), { recursive: true });
    if (f.endsWith(".glb")) writeFileSync(to, JSON.stringify({ glb: readFileSync(f).toString("base64") }));
    else cpSync(f, to);
  }
  // The packs' VRM avatars, wrapped in JSON too: packs/<id>/<file>.vrm.json (see vrm.ts).
  for (const id of packs)
    for (const f of readdirSync(join(PACKS, id)).filter((f) => f.endsWith(".vrm"))) {
      const to = join(OUT, "packs", id, `${f}.json`);
      mkdirSync(dirname(to), { recursive: true });
      writeFileSync(to, JSON.stringify({ glb: readFileSync(join(PACKS, id, f)).toString("base64") }));
      if (statSync(to).size > 15.5 * 1024 * 1024) throw new Error(`${id}/${f} : trop lourd pour la page publiée (16 Mo par fichier une fois emballé)`);
    }
  const files = filesUnder(OUT).map((f) => relative(OUT, f)).filter((f) => f !== "index.html").sort();
  writeFileSync(join(OUT, "files.json"), JSON.stringify(files, null, 2) + "\n");
  const kb = (f: string) => (statSync(join(OUT, f)).size / 1024).toFixed(0);
  console.log(`dist/artifact/index.html (${kb("index.html")} Ko) : commit ${git("rev-parse", "--short", "HEAD")}, ${packs.length} packs.`);
  console.log(`${files.length} fichiers à publier à côté (liste dans dist/artifact/files.json).`);
  if (problems.length) console.warn(`ATTENTION, page de test seulement (--allow-dirty) : ${problems.join(", ")}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, ...rest] = process.argv.slice(2);
  const run = cmd === "packs" && rest[0] ? Promise.resolve(packsCommand(rest[0], rest.includes("--force"))) : cmd === "build" ? buildCommand(rest.includes("--allow-dirty")) : null;
  if (!run) {
    console.error("Usage : node tools/artifact.ts packs <page.html> [--force] | build [--allow-dirty]");
    process.exit(2);
  }
  run.catch((e: unknown) => {
    console.error(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
