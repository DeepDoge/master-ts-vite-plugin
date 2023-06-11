import type { TemplateDescriptor, parseTemplateDescriptor as parseTemplateDescriptor_ } from "master-ts/library/template/parse/descriptor"
import type { parseTemplateHtml as parseTemplateHtml_ } from "master-ts/library/template/parse/html"
import type typescript_ from "typescript"
import type { ImportDeclaration, Node, StringLiteral, TaggedTemplateExpression } from "typescript"

const fileRegex = /\.(ts)$/
export function preprocess(
	src: string,
	filename: string,
	typescript: typeof typescript_,
	parseTemplateHtml: typeof parseTemplateHtml_,
	parseTemplateDescriptor: typeof parseTemplateDescriptor_
) {
	if (!fileRegex.test(filename)) return

	type ImportName = {
		type: boolean
		name: string
		alias: string | null
	}

	type ImportStatement = {
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

		if (importClause) {
			const { name, namedBindings } = importClause

			const importStatement: ImportStatement = {
				default: name ? name.text : null,
				names: null!,
				from,
			}

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

			imports.push(importStatement)
		}

		return ""
	}

	function addOrReturnImport(from: string, name: string): string {
		const matchingImports = imports.filter((item) => item.from === from)
		for (const matchingImport of matchingImports) {
			const matchingName = matchingImport.names.find((item) => !item.type && item.name === name)
			if (matchingName) return matchingName.alias ?? matchingName.name
		}

		imports.push({
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
				const htmlTexts: string[] = []
				const codeTexts: string[] = []
				const children = node.getChildren()
				for (const childNode of children) {
					if (!typescript.isNoSubstitutionTemplateLiteral(childNode)) {
						codeTexts.push(processChildrenOf(childNode))
						continue
					}
					htmlTexts.push(childNode.getText())
					codeTexts.push(childNode.getText())
				}
				const templateDescriptor = parseTemplateDescriptor(parseTemplateHtml(htmlTexts as readonly string[] as TemplateStringsArray))

				const createCachedHtmlFunctionName = addOrReturnImport("master-ts/library/template/cache", "createCachedHtml")
				addToTop.push(`const ${newTagName}_descriptor = ${codifyTemplateDescriptor(templateDescriptor)}`)
				addToTop.push(`const ${newTagName} = ${createCachedHtmlFunctionName}(${newTagName}_descriptor)`)

				// TODO: also bake the template

				return `${node.getFullText().substring(0, node.getLeadingTriviaWidth())}${newTagName}\`${codeTexts.join("")}\``
			}
			default:
				return node.getFullText()
		}
	}

	function codifyTemplateDescriptor(templateDescriptor: TemplateDescriptor) {
		const { html, valueDescriptors, refDataMap } = templateDescriptor

		// Generate code for the HTML string
		const htmlCode = `\`${html}\``

		// Generate code for the value descriptors
		const valueDescriptorsCode = valueDescriptors
			.map((valueDescriptor) => {
				const { type, ref, ...props } = valueDescriptor
				const propsCode = JSON.stringify(props)
				return `createValueDescriptor('${type}', ${propsCode})`
			})
			.join(",\n")

		// Generate code for the reference data map
		const refDataMapCode = Array.from(refDataMap.entries())
			.map(([ref, refData]) => {
				const attributesCode = Array.from(refData.attributes.entries())
					.map(([name, attributeData]) => {
						const indexesCode = JSON.stringify(attributeData.indexes)
						const partsCode = attributeData.parts ? JSON.stringify(attributeData.parts) : "null"
						return `"${name}": { indexes: ${indexesCode}, parts: ${partsCode} }`
					})
					.join(",\n")

				return `"${ref}": { attributes: new Map([${attributesCode}]) }`
			})
			.join(",\n")

		// Generate the final code
		const code = `const templateDescriptor = {
		html: ${htmlCode},
		valueDescriptors: [
		  ${valueDescriptorsCode}
		],
		refDataMap: new Map([
		  ${refDataMapCode}
		])
	  };`

		return code
	}

	function codifyImports() {
		let importStatements = ""

		for (const importStatement of imports) {
			let importNames = ""

			importNames = importStatement.names
				.map((importName) => {
					const name = importName.alias || importName.name
					return importName.type ? `${importName.name} as ${name}` : name
				})
				.join(", ")

			const defaultImport = importStatement.default ? `${importStatement.default}, ` : ""

			importStatements += `import ${defaultImport}{ ${importNames} } from '${importStatement.from}';\n`
		}

		return importStatements
	}

	const processResult = processChildrenOf(rootNode)
	const resultFile = `${codifyImports()}\n\n${addToTop.join("\n")};\n\n${processResult}`
	console.log(resultFile)
	return resultFile
}

function minifyCss(css: string) {
	// remove all whitespace that is not inside a string
	return css.replace(/([^"'])(\s+)/g, "$1 ")
}

function minifyHtml(html: string) {
	// remove all whitespace that is not inside a string
	return html.replace(/([^"'])(\s+)/g, "$1 ")
}
