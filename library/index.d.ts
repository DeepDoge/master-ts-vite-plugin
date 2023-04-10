export const masterTsPlugin: {
	name: "transform-file"
	transform(src: string, filename: string): { code: string }
}
