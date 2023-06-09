import type { parse as parse_ } from "master-ts/library/template/parse"
import type { TemplatePart } from "parse-literals"
import { parseLiterals } from "parse-literals"
import type typescript_ from "typescript"
import type { ImportDeclaration, Node, StringLiteral, TaggedTemplateExpression } from "typescript"

export type Dependencies = {
	typescript: typeof typescript_
	parse: typeof parse_
}

const fileRegex = /\.(ts)$/
export function preprocess(src: string, filename: string, deps: Dependencies): string {
	const { typescript, parse } = deps

	if (!fileRegex.test(filename)) return src

	type ImportName = {
		type: boolean
		name: string
		alias: string | null
	}

	type ImportStatement = {
		text: string
		default: string | null
		names: ImportName[]
		from: string
	}

	const rootNode = typescript.createSourceFile(filename, src, typescript.ScriptTarget.ESNext, true)
	const addToTop: string[] = []
	const imports: ImportStatement[] = []

	function processChildrenOf(node: Node): string {
		if (node.getChildCount() === 0) return node.getFullText()

		return node
			.getChildren()
			.map((childNode) => {
				// TODO: Type imports are not included and not need too anyway, but maybe might cause problems later, so implement it correctly later
				if (typescript.isImportDeclaration(childNode)) return processImportStatement(childNode)
				if (typescript.isTaggedTemplateExpression(childNode)) return processTaggedTemplate(childNode)
				if (childNode.getChildCount() > 0) return processChildrenOf(childNode)
				return childNode.getFullText()
			})
			.join("")
	}

	function processImportStatement(node: ImportDeclaration): string {
		const from = (node.moduleSpecifier as StringLiteral).text
		const importClause = node.importClause

		const importStatement: ImportStatement = {
			text: node.getText(),
			default: null,
			names: [],
			from,
		}

		if (importClause) {
			const { name, namedBindings } = importClause

			importStatement.default = name ? name.text : null

			if (namedBindings) {
				if (typescript.isNamespaceImport(namedBindings)) {
					importStatement.default = `* as ${namedBindings.name.text}`
				} else if (typescript.isNamedImports(namedBindings)) {
					const names: ImportName[] = []
					for (const element of namedBindings.elements) {
						const importName: ImportName = {
							type: element.isTypeOnly,
							name: element.name.text,
							alias: element.propertyName ? element.propertyName.text : null,
						}
						names.push(importName)
					}
					importStatement.names = names
				}
			}
		}
		imports.push(importStatement)

		return ""
	}

	function addOrReturnImport(from: string, name: string): string {
		const matchingImports = imports.filter((item) => item.from === from)
		for (const matchingImport of matchingImports) {
			const matchingName = matchingImport.names.find((item) => !item.type && item.name === name)
			if (matchingName) return matchingName.alias ?? matchingName.name
		}

		imports.push({
			text: `import { ${name} } from ${JSON.stringify(from)}`,
			default: null,
			from,
			names: [{ name, alias: null, type: false }],
		})
		return name
	}

	let cssTag: string | null = null
	let htmlTag: string | null = null
	let htmlTagCounter = 0
	function processTaggedTemplate(node: TaggedTemplateExpression): string {
		if (!cssTag) {
			const importItem = imports.find((item) => item.from === "master-ts/library/template") || null
			const nameItem = (importItem && importItem.names && importItem.names.find((item) => !item.type && item.name === "css")) || null
			cssTag = nameItem && (nameItem.alias ?? nameItem.name)
		}
		if (!htmlTag) {
			const importItem = imports.find((item) => item.from === "master-ts/library/template") || null
			const nameItem = (importItem && importItem.names && importItem.names.find((item) => !item.type && item.name === "html")) || null
			htmlTag = nameItem && (nameItem.alias ?? nameItem.name)
		}

		switch (node.getChildAt(0)?.getText()) {
			case cssTag:
				return node
					.getChildren()
					.map((childNode) => {
						if (!typescript.isNoSubstitutionTemplateLiteral(childNode)) {
							return processChildrenOf(childNode)
						}
						const cssText = childNode.getText().trim()
						const minifiedCss = minifyCss(cssText)
						return minifiedCss
					})
					.join("")

			case htmlTag: {
				const htmlTagIndex = htmlTagCounter++
				const newTagName = `__html__${htmlTagIndex}`

				const newCode = `${node.getFullText().substring(0, node.getLeadingTriviaWidth())}${newTagName}${processChildrenOf(
					node.getChildAt(1)
				)}`

				const templateParts = parseLiterals(newCode)[0]!.parts
				const htmlTexts = templateParts.map((part) => part.text)
				const templateDescriptor = parse.descriptor(parse.html(htmlTexts as readonly string[] as TemplateStringsArray))
				templateDescriptor.html = minifyHtml(templateDescriptor.html)

				const createCachedHtmlFunctionName = addOrReturnImport("master-ts/library/template/cache", "createCachedHtml")
				addToTop.push(`const ${newTagName}_descriptor = ${codefy(templateDescriptor)}`)
				addToTop.push(`const ${newTagName} = ${createCachedHtmlFunctionName}(${newTagName}_descriptor)`)

				// TODO: also bake the template

				return removeParts(templateParts, newCode)
			}
			default:
				return node.getFullText()
		}
	}

	function removeParts(parts: TemplatePart[], inputString: string): string {
		let result = ""

		// Sort parts in ascending order based on the start index
		parts.sort((a, b) => a.start - b.start)

		let lastIndex = 0
		for (const part of parts) {
			const { start, end } = part

			// Append the substring before the current part
			result += inputString.slice(lastIndex, start)

			// Update the lastIndex to the end index of the current part
			lastIndex = end
		}

		// Append the remaining substring after the last part
		result += inputString.slice(lastIndex)

		return result
	}

	function codefy(obj: unknown): string {
		function processValue(value: unknown): string {
			const code: string[] = []

			if (value instanceof Map) {
				code.push("new Map([")
				value.forEach((val, key) => {
					code.push(`[${processValue(key)}, ${processValue(val)}],`)
				})
				code.push("])")
			} else if (value instanceof Set) {
				code.push("new Set([")
				value.forEach((val) => {
					code.push(`${processValue(val)},`)
				})
				code.push("])")
			} else if (value instanceof Date) {
				code.push(`new Date(${value.getTime()})`)
			} else if (Array.isArray(value)) {
				code.push("[")
				value.forEach((item) => {
					code.push(`${processValue(item)},`)
				})
				code.push("]")
			} else if (typeof value === "object" && value !== null) {
				code.push("{")
				Object.entries(value as Record<string, unknown>).forEach(([key, val]) => {
					code.push(`"${key}": ${processValue(val)},`)
				})
				code.push("}")
			} else if (typeof value === "string") {
				code.push(JSON.stringify(value))
			} else if (typeof value === "number" || typeof value === "boolean") {
				code.push(`${value}`)
			} else {
				code.push("null")
			}

			return code.join("")
		}

		return processValue(obj)
	}

	function codifyImports() {
		return imports.map((item) => item.text).join(";\n")
	}

	const processResult = processChildrenOf(rootNode)
	return `${codifyImports()}\n\n${addToTop.join("\n")};\n\n${processResult}`
}

function minifyCss(css: string) {
	// remove all whitespace that is not inside a string
	return css.replace(/([^"'])(\s+)/g, "$1 ").trim()
}

function minifyHtml(html: string) {
	// remove all whitespace that is not inside a string
	return html.replace(/([^"'])(\s+)/g, "$1 ").trim()
}
