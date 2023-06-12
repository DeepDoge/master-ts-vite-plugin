import fs from "fs"
import { parseLiterals } from "parse-literals"
import path from "path"
import typescript from "typescript"

// vite.config.TS doesn't support TS file imports, so we have to do this thing.
const preprocessorFilename = path.join("node_modules", "master-ts-vite-plugin", "plugin", "preprocess.ts")
const preprocessorTs = fs.readFileSync(preprocessorFilename, "utf8")
const preprocessorJs = typescript.transpile(preprocessorTs, { module: "commonjs" }, preprocessorFilename)

const { preprocess } = new Function("args", `const exports = {}; ${preprocessorJs}; return exports`)([parseLiterals])

export const masterTsPlugin = (...args) => ({
	name: "transform-file",
	transform(src, filename) {
		const code = preprocess(src, filename, ...args)
		return { code }
	},
})
