import lightningcss from 'bun-lightningcss';

async function bundle() {
  return await Bun.build({
    entrypoints: ['./src/index.ts'],
    outdir: './dist',
    minify: false,
    sourcemap: "external",
    target: "browser",
    plugins: [lightningcss()]
  });
}

const result = await bundle();
result?.logs.forEach((log, index) => console.log(index, log));

export { }
