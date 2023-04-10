import typescript from "typescript"
import fs from "fs"
import { parseLiterals } from "parse-literals"
import path from "path"

// vite.config.TS doesn't support TS file imports, so we have to do this thing.
const preprocessorFilename = path.join("node_modules", "master-ts-vite-plugin", "library", "./preprocess.ts")
const preprocessorTs = fs.readFileSync(preprocessorFilename, "utf8")
const preprocessorJs = typescript.transpile(preprocessorTs, { module: "commonjs" }, preprocessorFilename)

const { preprocess } = new Function("parseLiterals", `const exports = {}; ${preprocessorJs}; return exports`)(parseLiterals)

export const masterTsPlugin = {
	name: "transform-file",
	transform(src, filename) {
		return {
			code: preprocess(src, filename),
		}
	},
}
