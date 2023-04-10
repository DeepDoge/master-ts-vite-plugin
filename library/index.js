import typescript from "typescript"
import fs from "fs"
import { parseLiterals } from "parse-literals"
import path from "path"

const preprocessorFilename = path.join(__dirname, "./preprocess.ts")
const preprocessorTs = fs.readFileSync(preprocessorFilename, "utf8")
const preprocessorJs = typescript.transpile(preprocessorTs, { module: "commonjs" }, preprocessorFilename)

const exports = new Function("parseLiterals", `const exports = {}; ${preprocessorJs}; return exports`)(parseLiterals)

console.log(exports)

export const masterTsPlugin = {
	name: "transform-file",
	transform(src, filename) {
		return {
			code: src,
		}
	},
}
