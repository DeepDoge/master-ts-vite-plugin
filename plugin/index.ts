import type { Dependencies } from "./preprocess"
import { preprocess } from "./preprocess"

export const masterTs = (deps: Dependencies) => ({
	name: "transform-file",
	transform(src: string, filename: string) {
		const code = preprocess(src, filename, deps)
		return { code }
	},
})
