// node test/gen.mjs <module in src/> <export> '<json opts>'  -> prints the G-code
const [mod, fn, json] = process.argv.slice(2);
const m = await import(new URL(`../src/${mod}`, import.meta.url));
process.stdout.write(m[fn](JSON.parse(json)));
